# Multitenant SaaS Agentic Platform & Deferred Task Engine

An enterprise-grade, multi-tenant AI agent orchestration platform built with **Next.js 15**, **Model Context Protocol (MCP)**, **LangGraph-style State Machines**, and **Supabase PostgreSQL** (`pgvector` & Row-Level Security).

---

## 🌟 Overview

The **Multitenant SaaS Agentic Platform** provides a unified runtime for autonomous agent teams, scheduled deferred task execution, and hub-and-spoke MCP tool integration.

It bridges LLM reasoning with durable cloud infrastructure, providing:
- **Durable Task Lifecycle:** Schedule long-running or deferred tasks with automatic escalation fallback paths.
- **PostgresSaver Checkpointing:** Binary state continuity and audit logs backed by Supabase PostgreSQL.
- **Hub-and-Spoke MCP Gateway:** Pre-authenticated tool execution over stdio/SSE for Gmail, ElevenLabs Conversational Voice Calls, Google Calendar, and Slack.
- **Context Compiler:** Token-budgeted context compilation with RAG policy retrieval and `pgvector` semantic memory.
- **Multi-Tenant Security:** Strict Row-Level Security (RLS) policies and encrypted auth vault per tenant.

---

## 🏗️ Architecture Topology

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Next.js 15 Full-Stack UI & API                        │
│             (Agent Session Studio, Team Builder, Simulator, MCP Hub)           │
└────────────────                        ┬                        ────────────────┘
                                         │ JSON-RPC / REST
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                             LangGraph Agent Engine                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────────────────┐  │
│  │ intake_and_plan  │ ──►│ execute_primary  │ ──►│ verify_outcome            │  │
│  └──────────────────┘    └──────────────────┘    └─────────────┬─────────────┘  │
│                                                                │                │
│                                          Primary Tool Failure  ▼                │
│                                                  ┌───────────────────────────┐  │
│                                                  │  escalate_and_fallback    │  │
│                                                  │  (ElevenLabs Voice Call)  │  │
│                                                  └───────────────────────────┘  │
└────────────────                        ┬                        ────────────────┘
                                         │ Async Persistence
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      Supabase PostgreSQL & Vector Store                         │
│  • public.tenants         • public.checkpoints         • public.memory_store    │
│  • public.tenant_vault    • public.ephemeral_context   • public.profiles        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Core Capabilities

### 1. State Machine & Escalation Graph ([Backend/agent.ts](file:///Users/aztecgod/Active-Projects/cobrinhamountainsedge/Context%20Control/mcp-agent-graph%20%281%29/Backend/agent.ts))
- **Node Pipeline:** `intake_and_plan` ➔ `execute_primary_action` ➔ `verify_outcome` ➔ `complete_task`.
- **Conditional Escalation:** When a primary action fails (e.g. Gmail rate limit or delivery bounce), the execution graph traverses conditional edges to trigger high-urgency fallback policies (e.g., automated ElevenLabs voice call).

### 2. Hub-and-Spoke MCP Client ([Backend/mcp_client.ts](file:///Users/aztecgod/Active-Projects/cobrinhamountainsedge/Context%20Control/mcp-agent-graph%20%281%29/Backend/mcp_client.ts))
- Standardized tool definitions with JSON schema input validation.
- Tenant auth vault pre-authentication checks before tool invocation.
- Supported spokes:
  - `gmail_send_message` & `gmail_fetch_threads`
  - `elevenlabs_trigger_call`
  - `calendar_list_events` & `calendar_create_event`
  - `slack_post_message`

### 3. PostgresSaver Checkpoint Manager ([Backend/checkpoint-manager.ts](file:///Users/aztecgod/Active-Projects/cobrinhamountainsedge/Context%20Control/mcp-agent-graph%20%281%29/Backend/checkpoint-manager.ts))
- Records every agent reasoning step, tool payload, and latency metric in Supabase `public.checkpoints`.
- Preserves full auditability and multi-persona session continuity.

### 4. Context Compiler & Token Budgeting ([lib/compiler.ts](file:///Users/aztecgod/Active-Projects/cobrinhamountainsedge/Context%20Control/mcp-agent-graph%20%281%29/lib/compiler.ts))
- Dynamically compiles context profiles (System Instructions, Tenant Brand Voice, Customer Loyalty Tier, `pgvector` Long-Term Memories, and RAG Knowledge Base).
- Enforces hard token budgets with automatic priority-based section trimming.

---

## 🛠️ Tech Stack

- **Frontend / Full-Stack:** Next.js 15, React 19, TypeScript, TailwindCSS v4, Lucide React, Motion.
- **Database & Persistence:** Supabase PostgreSQL (Supavisor 5432), `pgvector`, Row-Level Security (RLS).
- **Protocol:** Model Context Protocol (MCP) JSON-RPC Stdio / SSE Transport.
- **Authentication & Vault:** AES-256-GCM encrypted tenant credential vault.
- **Cloud Infrastructure:** AWS CLI (`us-east-2`) & Supabase.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `>= 20.x`
- **npm** or **bun**
- **Supabase Account / Local Stack**

### 1. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/quetzal-rivas/Multitenant-saas-agentic-platform.git
cd Multitenant-saas-agentic-platform
npm install
```

### 2. Environment Configuration
Create a `.env.local` file in the project root:
```ini
PORT=3000

# Supabase Configuration
SUPABASE_URL=https://sttaszlypmeusqtqqqyt.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# AWS Infrastructure
AWS_REGION=us-east-2
AWS_PROFILE=agente-ai
```

### 3. Database Migration
Apply the PostgreSQL schema to your Supabase instance using [Backend/schema.sql](file:///Users/aztecgod/Active-Projects/cobrinhamountainsedge/Context%20Control/mcp-agent-graph%20%281%29/Backend/schema.sql):
```bash
# Executed directly via Supabase SQL Editor or MCP execute_sql tool
```

### 4. Run Development Server
Start the local Next.js development environment:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📡 Key API Routes

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/tasks` | `GET`, `POST` | List and schedule deferred agentic tasks |
| `/api/v1/tasks/[id]` | `GET`, `DELETE` | Retrieve execution status and reasoning steps for a task |
| `/api/v1/context/resolve` | `POST` | Compile token-budgeted context for an incoming LLM session |
| `/api/v1/conversations` | `GET` | Fetch thread checkpoints and multi-persona audit logs |
| `/api/mcp` | `POST` | Primary MCP JSON-RPC gateway endpoint |
| `/api/mcp/platform` | `POST` | Platform control MCP server for supervisor agents |

---

## 🛡️ Security & Multi-Tenancy

- **Row Level Security (RLS):** All tables (`tenants`, `profiles`, `checkpoints`, `ephemeral_context`, `memory_store`) enforce tenant isolation.
- **Zero Credential Exposure:** OAuth tokens and API keys are stored encrypted in `tenant_vault` and decrypted exclusively inside the MCP gateway.

---

## 📜 License

Distributed under the MIT License.
