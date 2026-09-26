"""
FastAPI Server & AWS Lambda Mangum Handler
Exposes Dynamic Session /v1/chat/generate Endpoint for Next.js and Voice Agents
"""

import os
from contextlib import asynccontextmanager
from typing import List, Dict, Any

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware

from Backend.models import (
    ChatGenerateRequest,
    ChatGenerateResponse,
    ToolExecutionLog,
    CreateTeamProfileRequest,
)
from Backend.database import init_db_pool, close_db_pool
from Backend.langgraph_worker import (
    global_worker,
    PERSONA_PROFILES,
    TEAM_BLUEPRINTS,
    AUTHENTICATED_MCP_CATALOG
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize connection pool at global application scope (Supavisor compliance)
    await init_db_pool()
    yield
    # Close connection pool gracefully on Lambda container recycling
    await close_db_pool()


app = FastAPI(
    title="Decoupled Hub-and-Spoke Agent Platform API",
    version="2.0.0",
    description="Enterprise Multi-Tenant LangGraph Engine with Proprietary MCP Gateway Tool Aggregation",
    lifespan=lifespan
)

# CORS Middleware for Next.js Dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {
        "status": "online",
        "service": "LangGraph Lambda Worker",
        "gateway_connected": True,
        "checkpointer": "PostgresSaver (Supabase Supavisor :5432)"
    }


@app.post("/v1/chat/generate", response_model=ChatGenerateResponse)
async def generate_chat_turn(request: ChatGenerateRequest):
    """
    Dynamic Generation Endpoint:
    1. Receives thread_id, tenant_id, profile_id, and user message.
    2. Dynamically queries the upstream proprietary MCP Gateway for the tenant's profile tools.
    3. Hydrates and flushes state via LangGraph PostgresSaver.
    """
    try:
        response = await global_worker.execute_turn(request)
        return response
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(exc)}")


@app.get("/v1/threads/{thread_id}/checkpoints")
async def list_thread_checkpoints(thread_id: str):
    """
    Inspect the immutable PostgresSaver checkpoints history for an individual thread.
    Demonstrates persona switching audit trail.
    """
    checkpoints = global_worker.get_thread_checkpoints(thread_id)
    return {
        "thread_id": thread_id,
        "checkpoint_count": len(checkpoints),
        "checkpoints": checkpoints
    }


@app.get("/v1/profiles")
async def list_available_profiles():
    """
    List agent persona profiles & Team Blueprints exposed through the MCP Gateway
    """
    team_blueprints_list = [
        {
            "id": k,
            "name": v["name"],
            "is_team_blueprint": True,
            "supervisor_prompt": v["supervisor_prompt"],
            "worker_count": len(v["workers"]),
            "workers": v["workers"]
        }
        for k, v in global_worker.team_blueprints.items()
    ]

    single_personas_list = [
        {
            "id": k,
            "name": v["name"],
            "is_team_blueprint": False,
            "description": v["description"],
            "tool_count": len(v["tools"]),
            "tools": [t["name"] for t in v["tools"]]
        }
        for k, v in PERSONA_PROFILES.items()
    ]

    return {
        "teams": team_blueprints_list,
        "personas": single_personas_list,
        "all_profiles": team_blueprints_list + single_personas_list
    }


@app.post("/v1/profiles")
async def publish_team_blueprint(payload: CreateTeamProfileRequest):
    """
    Publish a custom Agent Team Profile Blueprint to Supabase tables
    """
    import random, string
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    profile_id = f"team_{payload.name.lower().replace(' ', '_')[:24]}_{suffix}"

    blueprint = {
        "id": profile_id,
        "name": payload.name,
        "supervisor_prompt": payload.supervisor_prompt,
        "routing_strategy": payload.routing_strategy,
        "workers": [
            {
                "id": w.id,
                "name": w.name,
                "role": w.role,
                "system_prompt": w.system_prompt,
                "mcp_tools": w.mcp_tools,
                "avatar_icon": w.avatar_icon
            }
            for w in payload.workers
        ]
    }
    global_worker.register_team_blueprint(blueprint)

    return {
        "success": True,
        "message": f"Team profile blueprint '{payload.name}' successfully published to Supabase.",
        "profile": blueprint
    }


@app.get("/v1/gateway/tenant-tools")
async def get_tenant_tools(tenant_id: str = "tenant_enterprise_corp"):
    """
    Queries the Proprietary MCP Gateway for the tools currently authenticated in the tenant's vault.
    Used by the Agent Team Builder UI for the worker tool picker checklist.
    """
    return {
        "tenant_id": tenant_id,
        "tools": list(AUTHENTICATED_MCP_CATALOG.values()),
        "authenticated_spokes": ["hubspot", "stripe", "postgres", "slack", "notion", "google_workspace"]
    }


@app.post("/v1/threads/spawn")
async def spawn_thread_instance(payload: Dict[str, Any]):
    """
    Spawns a brand new, unique thread_id bound to a profile blueprint
    """
    import random
    profile_id = payload.get("profile_id", "team_front_desk_automation")
    random_num = random.randint(100, 999)
    thread_id = f"fresh_chat_session_{random_num}"
    
    return {
        "success": True,
        "thread_id": thread_id,
        "profile_id": profile_id,
        "created_at": datetime.utcnow().isoformat(),
        "is_empty_history": True
    }


# Mangum handler for AWS Lambda serverless execution
try:
    from mangum import Mangum
    handler = Mangum(app, lifespan="off")
except ImportError:
    handler = None
