"""
FastAPI Server & AWS Lambda Mangum Handler
Exposes Dynamic Session /v1/chat/generate Endpoint for Next.js, Voice Agents, and EventBridge Scheduler
"""

import os
import random
import string
from datetime import datetime
from contextlib import asynccontextmanager
from typing import List, Dict, Any, Optional

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
from Backend.scheduler import schedule_deferred_task_eventbridge, create_recurring_heartbeat
from Backend.database import init_db_pool, close_db_pool, get_db_pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db_pool()
    yield
    await close_db_pool()


app = FastAPI(
    title="Decoupled Hub-and-Spoke Agent Platform API",
    version="2.5.0",
    description="Enterprise Multi-Tenant LangGraph Engine with AWS Lambda + EventBridge Scheduler & Supabase PostgreSQL",
    lifespan=lifespan
)

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
        "scheduler": "AWS EventBridge Scheduler (Free Tier)",
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


@app.post("/v1/schedule_task")
async def schedule_deferred_task(payload: Dict[str, Any]):
    """
    Schedules a deferred task using AWS EventBridge Scheduler:
    1. Saves task state in Supabase ephemeral_context table with target_time.
    2. Enqueues a single-use EventBridge Scheduler rule set to fire at target_time.
    3. Zero serverless container idle costs - 100% Free Tier compliant.
    """
    task_id = payload.get("id") or f"task_{random.randint(1000, 9999)}"
    target_time = payload.get("scheduled_at") or payload.get("target_time") or datetime.utcnow().isoformat()
    instructions = payload.get("instructions", "Automated scheduled task execution")

    schedule_res = schedule_deferred_task_eventbridge(
        task_id=task_id,
        target_time_iso=target_time,
        payload=payload
    )

    return {
        "success": True,
        "task_id": task_id,
        "status": "SCHEDULED",
        "target_time": target_time,
        "scheduler": schedule_res,
        "message": f"Task '{task_id}' enqueued for target-time execution at {target_time} via AWS EventBridge Scheduler."
    }


@app.post("/v1/tasks/eventbridge-trigger")
async def handle_eventbridge_trigger(payload: Dict[str, Any]):
    """
    Invocation receiver when AWS EventBridge Scheduler fires at target_time
    """
    task_payload = payload.get("payload", {})
    trigger_type = task_payload.get("trigger_type")
    task_id = payload.get("task_id", "unknown_task")

    import time
    if trigger_type == "heartbeat":
        profile_id = task_payload.get("profile_id")
        
        # CHEAP CHECK
        pool = await get_db_pool()
        if pool:
            async with pool.connection() as conn:
                async with conn.cursor() as cur:
                    # Get org_id for profile
                    await cur.execute("SELECT org_id FROM profiles WHERE id = %s", (profile_id,))
                    org_row = await cur.fetchone()
                    if org_row and org_row[0]:
                        org_id = org_row[0]
                        # Check open board tasks for this org
                        await cur.execute("SELECT COUNT(*) FROM board_tasks WHERE org_id = %s AND status = 'open'", (org_id,))
                        open_tasks = (await cur.fetchone())[0]
                        
                        if open_tasks == 0:
                            return {"status": "no-op", "reason": "No open board tasks, sleeping."}

        # Wake up LLM if work exists (Synthesize a ChatGenerateRequest)
        req = ChatGenerateRequest(
            thread_id=f"heartbeat_{profile_id}_{int(time.time())}",
            tenant_id="00000000-0000-0000-0000-000000000001",
            profile_id=profile_id,
            message=f"[HEARTBEAT] Wake up. Goal: {task_payload.get('goal_checklist', '')}. Check board tasks."
        )
        res = await global_worker.execute_turn(req)
        return {
            "success": True,
            "eventbridge_triggered": True,
            "trigger_type": "heartbeat",
            "execution": res
        }

    # Paradigm 1: Calendar / Task Heartbeat Subscriptions
    subscribed_profile_ids = task_payload.get("subscribed_profile_ids", [])
    subscriber_executions = []
    
    for profile_id in subscribed_profile_ids:
        req = ChatGenerateRequest(
            thread_id=f"cal_event_{task_id}_{profile_id}_{int(time.time())}",
            tenant_id=task_payload.get("tenant_id", "00000000-0000-0000-0000-000000000001"),
            profile_id=profile_id,
            message=f"[CALENDAR EVENT WAKEUP] Scheduled event triggered. Instructions: {task_payload.get('instructions', '')}"
        )
        res = await global_worker.execute_turn(req)
        subscriber_executions.append(res)

    res = await global_worker.execute_deferred_task_eventbridge(task_id, task_payload)
    return {
        "success": True,
        "eventbridge_triggered": True,
        "execution": res,
        "subscriber_executions": subscriber_executions
    }


@app.get("/v1/threads/{thread_id}/checkpoints")
async def list_thread_checkpoints(thread_id: str):
    checkpoints = global_worker.get_thread_checkpoints(thread_id)
    return {
        "thread_id": thread_id,
        "checkpoint_count": len(checkpoints),
        "checkpoints": checkpoints
    }


@app.get("/v1/profiles")
async def list_available_profiles():
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
    
    heartbeat_res = None
    if payload.heartbeat_enabled:
        heartbeat_res = create_recurring_heartbeat(
            profile_id=profile_id,
            rate_minutes=payload.heartbeat_rate_minutes,
            goal_checklist=payload.heartbeat_goal
        )

    return {
        "success": True,
        "message": f"Team profile blueprint '{payload.name}' successfully published to Supabase.",
        "profile": blueprint,
        "heartbeat_scheduler": heartbeat_res
    }


@app.get("/v1/gateway/tenant-tools")
async def get_tenant_tools(tenant_id: str = "tenant_enterprise_corp"):
    return {
        "tenant_id": tenant_id,
        "tools": list(AUTHENTICATED_MCP_CATALOG.values()),
        "authenticated_spokes": ["hubspot", "stripe", "postgres", "slack", "notion", "google_workspace"]
    }


@app.post("/v1/threads/spawn")
async def spawn_thread_instance(payload: Dict[str, Any]):
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
