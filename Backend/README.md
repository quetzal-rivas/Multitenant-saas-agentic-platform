# Platform Control MCP Server

Specialized Model Context Protocol (MCP 2024-11-05 Specification) server providing programmatic access for localized LLMs (Claude Desktop, Cursor, IDE sub-agents, internal administration bots).

## Core Architectural Principle: Decouple Transport from Logic
Does not invoke public HTTP network loops over the open web. Instead, the MCP server wraps local in-memory controllers and repository services directly:
- **`teamBlueprintManager`**: Manages PostgreSQL `profiles` and `profile_workers` tables.
- **`taskQueue`**: Directly calls `taskQueue.scheduleTask()` writing to Redis/durable journal in < 5ms.
- **`db`**: Manages durable task persistence and historical execution records.
- **`TenantVaultManager`**: Audits encrypted OAuth2/API credentials with Row-Level Security (RLS) isolation.
- **`database.py` / `schema.sql`**: Direct PostgreSQL schema inspection.

---

## Tool Matrix (4 Specialized Categories)

### Category A: Agent Team Blueprint Engineering
1. **`create_agent_profile(name, supervisor_prompt, routing_strategy, tenant_id)`**: Writes a fresh blueprint row to the Supabase profiles store.
2. **`attach_worker_to_profile(profile_id, worker_name, role, system_prompt, mcp_tools, avatar_icon)`**: Inserts a child worker node into `profile_workers` with role definitions and whitelisted MCP tools.
3. **`list_team_blueprints(tenant_id)`**: Queries active team topologies, supervisor prompts, and assigned toolsets.

### Category B: Durable Task Control (BullMQ Lifecycle)
1. **`schedule_deferred_task(title, instructions, targetTime, toolsWhitelist, edgeCasePolicies, tenant_id)`**: Directly schedules an asynchronous task into BullMQ without HTTP overhead. Supports ISO 8601 target times and full `edgeCasePolicies` matrix with ElevenLabs failover.
2. **`cancel_deferred_task(task_id)`**: Drops an active/delayed task from the queue and updates the database.
3. **`list_scheduled_tasks(tenant_id, status)`**: Inspects scheduled, queued, running, and completed tasks.
4. **`trigger_task_now(task_id)`**: Forces immediate promotion and execution of a scheduled task.

### Category C: Database & State Store Governance
1. **`inspect_database_schema(schema_name)`**: Inspects relational tables, row estimates, columns, and foreign keys.
2. **`query_database_table(table, tenant_id, limit)`**: Queries records with strict `tenant_id` RLS isolation.

### Category D: Auth Vault & Security Enforcement
1. **`view_tenant_vault_status(tenant_id)`**: Audits pre-authenticated OAuth2 and API spoke credentials without exposing raw decrypted tokens.
2. **`update_tenant_spoke_auth(tenant_id, provider, account_label, scopes)`**: Connects or updates a spoke service credential inside the encrypted tenant vault.

---

## Transports & Usage

### 1. Cursor IDE Integration (`.cursor/mcp.json`)
```json
{
  "mcp": {
    "servers": {
      "platform-control": {
        "url": "http://localhost:3000/api/mcp/platform?tenant_id=tenant_enterprise_corp",
        "headers": {
          "x-tenant-id": "tenant_enterprise_corp"
        }
      }
    }
  }
}
```

### 2. Claude Desktop Integration (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "platform-control": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sse", "http://localhost:3000/api/mcp/platform?tenant_id=tenant_enterprise_corp"],
      "env": {
        "PLATFORM_TENANT_ID": "tenant_enterprise_corp"
      }
    }
  }
}
```

### 3. Local In-Memory Python Stdio Server
```bash
python3 -m Backend.platform_control_mcp
```
Reads JSON-RPC 2.0 lines directly on `stdin` and writes results to `stdout`, completely bypassing network interfaces.
