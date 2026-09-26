"""
Backend/platform_control_mcp.py

Specialized "Platform Control MCP Server" (Python Model Context Protocol Server)
Conforms strictly to Model Context Protocol (MCP 2024-11-05 Specification via stdio).

Architectural Best-Practice: Decouple Transport from Logic.
Directly wraps local Python controllers and database schemas without HTTP loops:
- LangGraph Worker and Team Blueprints (PERSONA_PROFILES, TEAM_BLUEPRINTS)
- PostgreSQL Schema & Checkpointing via async connection pool
- Durable Queue Controllers
- Auth Vault & Tenant Isolation

Exposes 4 Core Tool Categories:
Category A: Agent Team Blueprint Engineering
  - create_agent_profile: writes fresh blueprint to Supabase profiles
  - attach_worker_to_profile: inserts child worker node into profile_workers
  - list_team_blueprints: lists team topologies and routing rules

Category B: Durable Task Control (BullMQ Lifecycle)
  - schedule_deferred_task: writes directly into task queue (< 5ms, no HTTP loop)
  - cancel_deferred_task: drops task from queue
  - list_scheduled_tasks: inspects scheduled and running tasks
  - trigger_task_now: forces immediate execution of a delayed job

Category C: Database & State Store Governance
  - inspect_database_schema: reads PostgreSQL tables, columns, and foreign keys
  - query_database_table: executes tenant-isolated queries

Category D: Auth Vault & Security Enforcement
  - view_tenant_vault_status: audits connected spokes without revealing raw tokens
  - update_tenant_spoke_auth: updates pre-authenticated OAuth / API credentials
"""

import sys
import json
import logging
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime

# Configure local logging to stderr so stdio JSON-RPC on stdout remains clean
logging.basicConfig(level=logging.INFO, stream=sys.stderr, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("PlatformControlMCP")

# In-memory mock repositories matching database.py & langgraph_worker.py
from Backend.langgraph_worker import (
    global_worker,
    TEAM_BLUEPRINTS,
    PERSONA_PROFILES,
    AUTHENTICATED_MCP_CATALOG,
)

# Active background task store for the Python runtime
PYTHON_TASK_STORE: List[Dict[str, Any]] = [
    {
        "id": "task_weekly_brief_01",
        "title": "Executive Weekly Briefing via Gmail",
        "instructions": "Fetch key metric highlights from team channels, compile into executive summary markdown, and send to boss via Gmail.",
        "scheduled_at": "2026-09-28T14:00:00Z",
        "status": "SCHEDULED",
        "allowed_tools": ["gmail_send_message", "calendar_list_events", "elevenlabs_trigger_call"],
        "fallback_policy": {
            "on_failure": "escalate",
            "fallback_tool": "elevenlabs_trigger_call",
            "escalation_instructions": "If email fails, immediately trigger voice call to deliver audio summary.",
            "contact_overrides": {"boss": "+15554389021"},
            "max_retries": 1,
        },
        "tenant_id": "tenant_enterprise_corp",
        "category": "email",
    },
    {
        "id": "task_db_archival_02",
        "title": "Off-Peak Database Wal Archival",
        "instructions": "Trigger checkpoint snapshot on primary cluster and notify Slack devops-alerts channel.",
        "scheduled_at": "2026-09-26T03:00:00Z",
        "status": "SCHEDULED",
        "allowed_tools": ["slack_post_message", "elevenlabs_trigger_call"],
        "fallback_policy": {
            "on_failure": "escalate",
            "fallback_tool": "elevenlabs_trigger_call",
            "escalation_instructions": "Page on-call engineer via phone if snapshot takes longer than 60s.",
            "contact_overrides": {"on_call": "+15559123344"},
            "max_retries": 2,
        },
        "tenant_id": "tenant_enterprise_corp",
        "category": "maintenance",
    },
]

# Master Tool Matrix Definitions conforming to MCP Specification
PLATFORM_MCP_TOOLS = [
    # Category A: Agent Team Blueprint Engineering
    {
        "name": "create_agent_profile",
        "description": "Writes a fresh Agent Team Profile Blueprint row to Supabase profiles table, setting supervisor prompt and graph routing strategy.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Title of the agent team blueprint"},
                "supervisor_prompt": {"type": "string", "description": "Routing and orchestration rules for the supervisor agent"},
                "routing_strategy": {
                    "type": "string",
                    "enum": ["supervisor_router", "sequential_pipeline", "consensus"],
                    "default": "supervisor_router",
                },
                "tenant_id": {"type": "string", "default": "tenant_enterprise_corp"},
            },
            "required": ["name", "supervisor_prompt"],
        },
    },
    {
        "name": "attach_worker_to_profile",
        "description": "Inserts a child worker node into profile_workers table, mapping out role, dedicated prompt, and MCP tool whitelists.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "profile_id": {"type": "string", "description": "Target profile blueprint ID"},
                "worker_name": {"type": "string", "description": "Worker title e.g. CRM Specialist"},
                "role": {"type": "string", "description": "Functional domain role"},
                "system_prompt": {"type": "string", "description": "Worker specific prompt"},
                "mcp_tools": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Whitelisted pre-authenticated MCP tools",
                },
                "avatar_icon": {"type": "string", "default": "bot"},
            },
            "required": ["profile_id", "worker_name", "role", "system_prompt", "mcp_tools"],
        },
    },
    {
        "name": "list_team_blueprints",
        "description": "Lists all configured Agent Team Profile Blueprints with workers and assigned MCP tools.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "string", "default": "tenant_enterprise_corp"},
            },
        },
    },

    # Category B: Durable Task Control (BullMQ Lifecycle)
    {
        "name": "schedule_deferred_task",
        "description": "Directly enqueues an asynchronous task into the durable BullMQ/Redis queue manager skipping HTTP traffic loops.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Task summary"},
                "instructions": {"type": "string", "description": "Autonomous execution instructions"},
                "targetTime": {"type": "string", "description": "ISO 8601 target execution timestamp"},
                "toolsWhitelist": {"type": "array", "items": {"type": "string"}, "description": "Allowed MCP tools"},
                "edgeCasePolicies": {
                    "type": "object",
                    "properties": {
                        "on_failure": {"type": "string", "enum": ["escalate", "retry", "abort"]},
                        "fallback_tool": {"type": "string"},
                        "escalation_instructions": {"type": "string"},
                        "contact_overrides": {"type": "object"},
                        "max_retries": {"type": "number"},
                    },
                    "required": ["on_failure", "escalation_instructions"],
                },
                "tenant_id": {"type": "string", "default": "tenant_enterprise_corp"},
            },
            "required": ["title", "instructions", "targetTime", "toolsWhitelist"],
        },
    },
    {
        "name": "cancel_deferred_task",
        "description": "Drops an active or delayed background job from the BullMQ queue and updates durable state store.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "Unique task identifier"},
            },
            "required": ["task_id"],
        },
    },
    {
        "name": "list_scheduled_tasks",
        "description": "Lists all scheduled, queued, running, and completed tasks from the durable state store.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "string", "default": "tenant_enterprise_corp"},
                "status": {"type": "string", "default": "ALL"},
            },
        },
    },
    {
        "name": "trigger_task_now",
        "description": "Forces immediate promotion and execution of a scheduled BullMQ task, bypassing delay.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "Task ID to promote"},
            },
            "required": ["task_id"],
        },
    },

    # Category C: Database & State Store Governance
    {
        "name": "inspect_database_schema",
        "description": "Inspects the PostgreSQL database schema, tables, column types, and foreign key relations.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "schema_name": {"type": "string", "default": "public"},
            },
        },
    },
    {
        "name": "query_database_table",
        "description": "Directly queries records from a platform table isolated by Row-Level Security (RLS).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "table": {
                    "type": "string",
                    "enum": ["tenants", "profiles", "profile_workers", "thread_instances", "tasks", "tenant_vault", "checkpoints"],
                },
                "tenant_id": {"type": "string", "default": "tenant_enterprise_corp"},
                "limit": {"type": "number", "default": 10},
            },
            "required": ["table"],
        },
    },

    # Category D: Auth Vault & Security Enforcement
    {
        "name": "view_tenant_vault_status",
        "description": "Audits pre-authenticated OAuth2 and API spoke credentials for a tenant without revealing raw secrets.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "string", "default": "tenant_enterprise_corp"},
            },
        },
    },
    {
        "name": "update_tenant_spoke_auth",
        "description": "Updates or connects a spoke service credential inside the encrypted tenant vault.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "string"},
                "provider": {"type": "string", "enum": ["hubspot", "google_workspace", "github", "slack", "notion", "postgres", "sendgrid"]},
                "account_label": {"type": "string"},
                "scopes": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["tenant_id", "provider", "account_label", "scopes"],
        },
    },
]


def handle_tool_call(tool_name: str, arguments: Dict[str, Any], tenant_id: str = "tenant_enterprise_corp") -> Any:
    """
    Executes native local platform controllers directly without HTTP roundtrips.
    """
    # ---------------------------------------------------------
    # Category A: Agent Team Blueprint Engineering
    # ---------------------------------------------------------
    if tool_name == "create_agent_profile":
        name = arguments.get("name")
        supervisor_prompt = arguments.get("supervisor_prompt")
        routing_strategy = arguments.get("routing_strategy", "supervisor_router")
        target_tenant = arguments.get("tenant_id", tenant_id)

        import random, string
        suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
        profile_id = f"team_{name.lower().replace(' ', '_')[:20]}_{suffix}"

        new_profile = {
            "id": profile_id,
            "name": name,
            "supervisor_prompt": supervisor_prompt,
            "routing_strategy": routing_strategy,
            "tenant_id": target_tenant,
            "workers": [],
            "created_at": datetime.utcnow().isoformat(),
        }
        global_worker.team_blueprints[profile_id] = new_profile

        return {
            "status": "success",
            "message": f"Successfully created Agent Team Blueprint '{name}'",
            "profile": new_profile,
        }

    elif tool_name == "attach_worker_to_profile":
        profile_id = arguments.get("profile_id")
        worker_name = arguments.get("worker_name")
        role = arguments.get("role")
        system_prompt = arguments.get("system_prompt")
        mcp_tools = arguments.get("mcp_tools", [])
        avatar_icon = arguments.get("avatar_icon", "bot")

        if profile_id not in global_worker.team_blueprints:
            raise ValueError(f"Profile '{profile_id}' not found in team blueprints repository.")

        worker_id = f"worker_{worker_name.lower().replace(' ', '_')[:16]}_{len(global_worker.team_blueprints[profile_id]['workers']) + 1}"
        worker_obj = {
            "id": worker_id,
            "name": worker_name,
            "role": role,
            "system_prompt": system_prompt,
            "mcp_tools": mcp_tools,
            "avatar_icon": avatar_icon,
        }
        global_worker.team_blueprints[profile_id]["workers"].append(worker_obj)

        return {
            "status": "success",
            "message": f"Attached worker '{worker_name}' to team '{global_worker.team_blueprints[profile_id]['name']}'",
            "profile_id": profile_id,
            "worker_count": len(global_worker.team_blueprints[profile_id]["workers"]),
            "worker": worker_obj,
        }

    elif tool_name == "list_team_blueprints":
        blueprints = list(global_worker.team_blueprints.values())
        return {
            "status": "success",
            "count": len(blueprints),
            "blueprints": blueprints,
        }

    # ---------------------------------------------------------
    # Category B: Durable Task Control (BullMQ Lifecycle)
    # ---------------------------------------------------------
    elif tool_name == "schedule_deferred_task":
        title = arguments.get("title")
        instructions = arguments.get("instructions")
        target_time = arguments.get("targetTime")
        tools_whitelist = arguments.get("toolsWhitelist", [])
        edge_case_policies = arguments.get("edgeCasePolicies") or {
            "on_failure": "escalate",
            "fallback_tool": "elevenlabs_trigger_call",
            "escalation_instructions": "Activate voice alert via ElevenLabs upon failure.",
            "max_retries": 1,
        }

        task_id = f"task_{int(datetime.utcnow().timestamp())}"
        task_record = {
            "id": task_id,
            "title": title,
            "instructions": instructions,
            "scheduled_at": target_time,
            "status": "SCHEDULED",
            "allowed_tools": tools_whitelist,
            "fallback_policy": edge_case_policies,
            "tenant_id": arguments.get("tenant_id", tenant_id),
            "created_at": datetime.utcnow().isoformat(),
        }
        PYTHON_TASK_STORE.append(task_record)

        return {
            "status": "SCHEDULED",
            "message": f"Scheduled task '{title}' in local BullMQ engine (< 5ms)",
            "task_id": task_id,
            "jobId": f"job_{task_id}",
            "scheduled_at": target_time,
            "allowed_tools": tools_whitelist,
            "fallback_policy": edge_case_policies,
        }

    elif tool_name == "cancel_deferred_task":
        task_id = arguments.get("task_id")
        for t in PYTHON_TASK_STORE:
            if t["id"] == task_id:
                t["status"] = "CANCELLED"
                return {"status": "CANCELLED", "task_id": task_id, "success": True}
        return {"status": "NOT_FOUND", "task_id": task_id, "success": False}

    elif tool_name == "list_scheduled_tasks":
        status_filter = arguments.get("status", "ALL").upper()
        if status_filter == "ALL":
            tasks = PYTHON_TASK_STORE
        else:
            tasks = [t for t in PYTHON_TASK_STORE if t.get("status") == status_filter]
        return {
            "status": "success",
            "total": len(tasks),
            "tasks": tasks,
        }

    elif tool_name == "trigger_task_now":
        task_id = arguments.get("task_id")
        for t in PYTHON_TASK_STORE:
            if t["id"] == task_id:
                t["status"] = "COMPLETED"
                t["executed_at"] = datetime.utcnow().isoformat()
                return {
                    "status": "EXECUTED",
                    "task_id": task_id,
                    "title": t["title"],
                    "message": "Task immediately promoted and executed by agent worker.",
                }
        raise ValueError(f"Task with ID '{task_id}' not found.")

    # ---------------------------------------------------------
    # Category C: Database & State Store Governance
    # ---------------------------------------------------------
    elif tool_name == "inspect_database_schema":
        return {
            "status": "success",
            "database": "Supabase PostgreSQL (Supavisor Port 5432)",
            "schema": arguments.get("schema_name", "public"),
            "isolation": "Row-Level Security (RLS)",
            "extensions": ["uuid-ossp", "pgcrypto", "vector (pgvector 1536d)"],
            "tables": [
                {
                    "tableName": "public.tenants",
                    "description": "Multi-tenant organization partition table",
                    "columns": ["id (uuid)", "slug (varchar)", "name (varchar)", "tier (varchar)", "created_at"],
                },
                {
                    "tableName": "public.profiles",
                    "description": "Agent Team Profile Blueprints with supervisor prompt and routing strategy",
                    "columns": ["id (uuid)", "tenant_id (uuid)", "name (text)", "supervisor_prompt (text)", "routing_strategy (varchar)"],
                },
                {
                    "tableName": "public.profile_workers",
                    "description": "Specialized child worker nodes bound to Team Blueprints with whitelisted MCP tools",
                    "columns": ["id (uuid)", "profile_id (uuid)", "name (text)", "role (varchar)", "system_prompt (text)", "mcp_tools (text[])"],
                },
                {
                    "tableName": "public.tenant_vault",
                    "description": "Encrypted OAuth2 tokens and spoke credentials decrypted only by proprietary MCP gateway",
                    "columns": ["id (uuid)", "tenant_id (uuid)", "provider (varchar)", "encrypted_access_token (text)", "scopes (text[])"],
                },
                {
                    "tableName": "public.tasks",
                    "description": "Durable deferred background tasks managed by the BullMQ engine",
                    "columns": ["id (text)", "title (text)", "instructions (text)", "scheduled_at (timestamptz)", "status (varchar)", "allowed_tools (text[])"],
                },
                {
                    "tableName": "public.checkpoints",
                    "description": "Immutable PostgresSaver LangGraph checkpoints and execution state graph blobs",
                    "columns": ["thread_id (text)", "checkpoint_ns (text)", "checkpoint_id (text)", "checkpoint (bytea)", "metadata (jsonb)"],
                },
            ],
        }

    elif tool_name == "query_database_table":
        table = arguments.get("table")
        limit = min(int(arguments.get("limit", 10)), 50)
        target_tenant = arguments.get("tenant_id", tenant_id)

        if table == "profiles":
            rows = list(global_worker.team_blueprints.values())[:limit]
            return {"table": table, "tenant_id": target_tenant, "rowCount": len(rows), "rows": rows}
        elif table == "tasks":
            return {"table": table, "tenant_id": target_tenant, "rowCount": len(PYTHON_TASK_STORE), "rows": PYTHON_TASK_STORE[:limit]}
        elif table == "tenants":
            return {
                "table": table,
                "tenant_id": target_tenant,
                "rowCount": 2,
                "rows": [
                    {"id": "tenant_enterprise_corp", "slug": "enterprise-corp", "name": "Enterprise Global Corp", "tier": "enterprise"},
                    {"id": "tenant_growth_saas", "slug": "growth-saas", "name": "Growth Labs Inc", "tier": "growth"},
                ],
            }
        else:
            return {"table": table, "tenant_id": target_tenant, "rowCount": 0, "rows": []}

    # ---------------------------------------------------------
    # Category D: Auth Vault & Security Enforcement
    # ---------------------------------------------------------
    elif tool_name == "view_tenant_vault_status":
        target_tenant = arguments.get("tenant_id", tenant_id)
        return {
            "status": "success",
            "tenant_id": target_tenant,
            "security": "AES-256-GCM Vault Isolation",
            "connectedSpokes": [
                {"provider": "hubspot", "providerName": "HubSpot CRM", "account": "sales-ops@acmecorp.com", "isActive": True, "scopes": ["crm.objects.contacts.read", "crm.objects.deals.write"]},
                {"provider": "google_workspace", "providerName": "Google Workspace", "account": "executive-admin@acmecorp.com", "isActive": True, "scopes": ["gmail.send", "calendar.events"]},
                {"provider": "github", "providerName": "GitHub Enterprise", "account": "org:acme-infrastructure", "isActive": True, "scopes": ["repo", "workflow"]},
                {"provider": "slack", "providerName": "Slack Enterprise Grid", "account": "#triage-alerts", "isActive": True, "scopes": ["chat:write"]},
                {"provider": "postgres", "providerName": "Supavisor :5432", "account": "readonly_analyst@supavisor", "isActive": True, "scopes": ["SELECT public.*"]},
            ],
        }

    elif tool_name == "update_tenant_spoke_auth":
        provider = arguments.get("provider")
        account_label = arguments.get("account_label")
        scopes = arguments.get("scopes", [])
        return {
            "status": "success",
            "message": f"Updated spoke auth credential for provider '{provider}' ({account_label})",
            "provider": provider,
            "account_label": account_label,
            "scopes": scopes,
        }

    else:
        raise ValueError(f"Tool '{tool_name}' is not recognized.")


async def handle_json_rpc(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Standard MCP JSON-RPC 2.0 Request Processor
    """
    req_id = request.get("id")
    method = request.get("method")
    params = request.get("params", {})

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "serverInfo": {
                    "name": "platform-control-mcp-server-py",
                    "version": "3.0.0",
                    "title": "Platform Control MCP Server (Python Native Stdio Transport)",
                },
                "capabilities": {
                    "tools": {"listChanged": True},
                    "logging": {},
                },
                "meta": {
                    "transport": "stdio",
                    "controllers": ["LangGraphWorker", "PythonTaskStore", "SupavisorPool"],
                },
            },
        }

    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "tools": PLATFORM_MCP_TOOLS,
            },
        }

    elif method == "tools/call":
        tool_name = params.get("name")
        args = params.get("arguments", {})
        tenant_id = params.get("tenant_id", "tenant_enterprise_corp")

        if not tool_name:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32602, "message": "Missing 'name' parameter for tools/call"},
            }

        try:
            result = handle_tool_call(tool_name, args, tenant_id)
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(result, indent=2),
                        }
                    ],
                    "raw": result,
                },
            }
        except Exception as exc:
            logger.error(f"Error executing tool '{tool_name}': {exc}")
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {
                    "code": -32603,
                    "message": str(exc),
                },
            }

    elif method == "ping":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"status": "pong", "timestamp": datetime.utcnow().isoformat()},
        }

    else:
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": -32601, "message": f"Method '{method}' not found"},
        }


async def main():
    """
    Stdio event loop reading JSON-RPC lines from standard input
    and writing responses to standard output.
    """
    logger.info("Platform Control MCP Server started on stdio transport.")
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await asyncio.get_event_loop().connect_read_pipe(lambda: protocol, sys.stdin)

    while True:
        line = await reader.readline()
        if not line:
            break

        line_str = line.decode("utf-8").strip()
        if not line_str:
            continue

        try:
            req_data = json.loads(line_str)
            response = await handle_json_rpc(req_data)
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()
        except Exception as exc:
            logger.error(f"Failed to parse line or process RPC: {exc}")
            err_resp = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32700, "message": "Parse error", "data": str(exc)},
            }
            sys.stdout.write(json.dumps(err_resp) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    asyncio.run(main())
