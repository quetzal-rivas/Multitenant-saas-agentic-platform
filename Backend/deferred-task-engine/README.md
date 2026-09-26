# Deferred Task Engine

A resilient, hybrid Durable Execution and Agent Graph pattern application built with Node.js, TypeScript, BullMQ, LangGraph, Model Context Protocol (MCP), and Supabase.

## 📁 Location & Standards Compliance
This project strictly follows the workspace guidelines in `/Users/aztecgod/Active-Projects/README.txt`:

- **Path:** `/Users/aztecgod/Active-Projects/AI/Deferred-Task-Engine` (and `/Backend/deferred-task-engine`)
- **Category:** `AI/`
- **Isolated Environment:** Independent `package.json`, `.env`, `.gitignore`, and Git repository.

## 🏗 Architecture
- **API Ingestion (`src/server.ts`):** Validates scheduled task payloads from live LLMs using Zod.
- **Orchestration (`src/queue.ts`):** Relies on BullMQ and Redis for durable, crash-proof deferred execution delays.
- **Execution Layer (`src/agent.ts`):** LangGraph StateGraph agent node execution with automatic edge escalation handling.
- **MCP Client Wrapper (`src/mcp_client.ts`):** Connects to dynamic MCP servers (Gmail, ElevenLabs) over Stdio transport.
- **Database Persistence (`src/db.ts`):** Logs task state (`scheduled`, `completed`, `failed`, `escalated`) directly into Supabase PostgreSQL (`ephemeral_context` table).

## 🚀 Running the Project
```bash
# 1. Start Redis
docker run -d --name redis-deferred-engine -p 6379:6379 redis:alpine

# 2. Start the Engine
npm run dev

# 3. Schedule a Task
curl -X POST http://localhost:3000/schedule_task \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task-202",
    "targetTime": "2026-09-10T18:00:00Z",
    "primaryInstructions": "Send summary report via email.",
    "toolsWhitelist": ["gmail"],
    "edgeCasePolicies": {
      "fallbackOnPrimaryFailure": "escalate",
      "escalationTool": "elevenlabs",
      "escalationInstructions": "Trigger voice alert call if email fails.",
      "contactOverrides": {
        "boss": "boss@example.com"
      }
    }
  }'
```
