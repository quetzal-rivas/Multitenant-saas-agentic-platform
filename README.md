# Context Control Multitenant SaaS Agentic Platform

An enterprise-grade, multi-tenant SaaS platform for autonomous AI agent teams, persistent conversation threads, scheduled deferred task execution, and Hub-and-Spoke Model Context Protocol (MCP) tool integration.

The platform completely abstracts away cloud infrastructure (AWS Lambda, SQS, EventBridge Schedulers, KMS Envelope Encryption, and Supabase `pgvector` databases) into an intuitive, high-performance UI dashboard for tenants.

---

## 🌟 Comprehensive Tenant Capabilities

- 🤖 **Agent & Team Studio:** Interactive Agent Session Studio and visual Team Builder with LangGraph TS hierarchical supervisor routing.
- 💬 **Persistent Threads & Voice AI Engine:** Supabase PostgreSQL conversation state checkpointing paired with **ElevenLabs Conversational Voice AI** and **Twilio Phone Telephony** (behind feature flag & compliance attestation).
- 📅 **Deferred Task Calendar View:** AWS EventBridge Scheduler & SQS powered target-time job scheduling with PostgreSQL outbox pattern and live calendar visualization.
- 🔌 **MCP Tool Hub & Gateway:** Pre-built Hub-and-Spoke tool connections (Gmail, Slack, Google Calendar, Supabase Vector, and Tenant Custom MCPs) with zero credential leakage.
- 🧠 **Context Profiles & RAG Knowledge:** Token-budgeted context compiler, system instruction profiles, tenant brand voice enforcement, and `pgvector` 1536d semantic memory stores under tenant RLS.
- ⚡ **Endpoints API & Live cURL Generator:** Dedicated tenant REST API endpoints (`/api/v1/*`) with RFC 9457 problem+json error formatting and interactive cURL request builder.
- 🛡️ **Multi-Tenant BYOK Vault:** KMS AES-256-GCM envelope encryption, CSPRNG SHA-256 hashed platform API keys, asymmetric ES256 JWKS client tokens, and role-aware Row-Level Security (RLS).

---

## 📱 SaaS Tenant Workspace User Guide

---

### 1. Agent Session Studio (Single Agent)

![Agent Session Studio](public/docs/images/agent_studio.png)

#### 🎯 Overview & Strategic Purpose
The **Agent Session Studio** serves as the primary real-time operational interface for single autonomous agents. It bridges high-level tenant prompt inputs with dynamic LLM reasoning, live tool call execution, and token-budgeted context resolution. Rather than relying on simple stateless chat widgets, the Agent Studio provides full visibility into the agent's internal thought process, active context profile parameters, and intermediate tool execution outputs.

#### ⚡ Comprehensive Feature Breakdown & Architecture
- **Real-Time Thought & Tool Execution Streaming:** As the agent evaluates user instructions, every intermediate reasoning step, JSON schema validation, and tool call payload is streamed live to the UI interface over Supabase Realtime (`run_events` table under tenant RLS).
- **Dynamic Context Profile Toggling:** Tenants can dynamically select pre-configured **Context Profiles** from a header dropdown. Switching profiles instantly updates the agent's core system instructions, tenant brand voice, customer loyalty tier rules, and token allocation limits without restarting the chat session.
- **System Instruction Overrides:** Offers an inline developer drawer allowing tenants to inject temporary system instruction overrides on the fly. This enables testing specific edge-case prompts, tone adjustments, or constraint guardrails before committing them to a production profile blueprint.
- **Persistent State Checkpointing:** Every message, thought step, and tool call result is serialized into binary checkpoints stored in Supabase PostgreSQL (`public.checkpoints`). Sessions can be paused, resumed, or audited at any time with guaranteed state continuity.
- **Token Budget Monitoring:** Real-time token usage meter displays prompt tokens, completion tokens, and context window utilization, preventing unexpected API cost spikes.

#### 📖 Step-by-Step UI How-To-Use Guide
1. Select **Agent Studio** from the left navigation menu under the *Workspace* section.
2. In the top bar header, click the **Context Profile** dropdown selector to choose an active agent profile (e.g., *Customer Support Lead*, *Sales Outbound Representative*, or *Technical Auditor*).
3. Type your operational instructions into the prompt input drawer at the bottom of the studio screen and press **Send** or `Enter`.
4. Observe the live execution waterfall:
   - Green accordion headers indicate successful tool calls (e.g. `gmail_fetch_threads`).
   - Yellow headers highlight pending or executing actions.
   - Red headers indicate caught errors or fallback triggers.
5. Click on any tool call accordion card to view raw JSON parameters, response headers, and latency metrics.
6. To test custom instructions, click **System Overrides**, modify the system prompt text, and submit a new message turn.

---

### 2. Team Builder (Multi-Agent Supervisor Graphs)

![Agent Team Builder](public/docs/images/team_builder.png)

#### 🎯 Overview & Strategic Purpose
The **Team Builder** allows tenants to construct collaborative multi-agent teams using hierarchical supervisor topologies. Complex business workflows often exceed the capabilities of a single monolithic agent persona. The Team Builder solves this by establishing a central **Supervisor Agent** that acts as an intelligent router, decomposing incoming multi-step tasks and delegating sub-tasks to specialized worker agents (e.g. *Research Specialist*, *Copywriter*, *Billing Auditor*, *Incident Dispatcher*).

#### ⚡ Comprehensive Feature Breakdown & Architecture
- **Hierarchical Routing Topologies:** Incorporates LangGraph TS state machine routing patterns (`supervisor_router`, `sequential_pipeline`, `consensus`). The supervisor agent evaluates incoming user turns and routes control to worker nodes based on their assigned operational roles and tool whitelists.
- **Specialized Worker Node Assignment:** Tenants can create and attach an unlimited number of worker nodes to a team blueprint. Each worker node receives dedicated system instructions, an avatar icon, and a strictly scoped whitelist of allowed MCP tools (e.g. restricting a Billing Clerk to Stripe tools while granting a Copywriter access to Gmail and Slack).
- **Conditional Fallback & Escalation Matrix:** Every team blueprint includes an automated fallback policy matrix (`edgeCasePolicies`). If a primary worker's tool action fails (such as an email delivery bounce or CRM API rate limit), the state graph automatically traverses conditional edges to trigger high-priority fallback actions, including automated **ElevenLabs Voice Calls** or Slack emergency alerts.
- **Visual Topology Tree:** Interactive canvas displays the team structure, routing strategies, active worker nodes, allocated MCP tools, and assigned capability skills.

#### 📖 Step-by-Step UI How-To-Use Guide
1. Navigate to **Team Builder** from the workspace sidebar.
2. Click **Create New Team** or click an existing blueprint card (e.g. *Front Desk Automation Team*, *Night Audit Team*).
3. In the team configuration modal:
   - Enter the **Team Name** and select the **Routing Strategy** (*Supervisor Router*, *Sequential Pipeline*, or *Consensus*).
   - Write the **Supervisor Prompt** specifying corporate routing rules (e.g., *"Route billing and invoice inquiries to the Billing Clerk; route technical bugs to the Database Auditor"*).
4. Click **Add Worker Node** to attach specialist agents:
   - Specify the **Worker Name** (e.g., *CRM Specialist*) and **Role** (e.g., *Lead Enrichment*).
   - Input dedicated **System Instructions** for the worker.
   - Select whitelisted **MCP Tools** from the tool selector drawer (e.g. `crm.add_lead`, `slack_post_message`).
5. Click **Deploy Team Graph** to make the multi-agent team blueprint available for live studio sessions, API endpoints, and scheduled deferred calendar tasks.

---

### 3. Conversations & Live Voice Conference (Postgres Threads, ElevenLabs & Twilio)

![Conversations & Voice Calls](public/docs/images/conversations.png)

#### 🎯 Overview & Strategic Purpose
The **Conversations** module provides full auditability and management across all past and active agent communication threads. It houses the platform's **Live Voice Conference Engine**, enabling agents to perform automated outbound telephone calls and answer inbound calls over standard PSTN phone lines using **ElevenLabs Conversational AI** and **Twilio Telephony**.

#### ⚡ Comprehensive Feature Breakdown & Architecture
- **Postgres Persistent Thread Audit:** Displays thread execution sessions stored in Supabase PostgreSQL (`public.thread_instances` and `public.checkpoints`). Tenants can inspect exact turn-by-turn message logs, token consumption per turn, and timestamped tool execution records.
- **Feature Flag & Compliance Protection:** Voice integration is guarded by the `ENABLE_VOICE_CALLS` feature flag (off by default). Initiating outbound calls requires explicit tenant acceptance of TCPA and AI voice recording consent compliance attestations.
- **ElevenLabs Speech Synthesis Integration:** Outbound voice calls utilize ElevenLabs low-latency conversational speech synthesis models via tenant BYOK credentials.
- **Twilio Telephony & Signature Verification:** Manages direct phone call dispatch and phone number provisioning via Twilio. Incoming webhooks are validated using HMAC-SHA1 signature verification (`X-Twilio-Signature`).
- **Real-Time Audio & Text Transcript Logs:** Automatically transcribes voice call conversations into text transcripts and stores call recordings in tenant-isolated storage.
- **Multi-Tenant RLS Isolation:** All thread records and call transcripts enforce strict tenant isolation via Postgres role-aware RLS policies.

#### 📖 Step-by-Step UI How-To-Use Guide
1. Select **Conversations** from the left navigation menu under *Workspace*.
2. Browse the thread list or use the search bar to filter by thread ID, customer contact name, or date range.
3. Click any thread row to view its full conversation history, inspect LLM reasoning steps, and review tool call payloads.
4. **To Dispatch a Live Voice Call:**
   - Click the **Trigger Voice Call** button at the top of the view.
   - Enter the target recipient phone number in E.164 format (e.g. `+15554389021`).
   - Accept the compliance attestation checkbox (TCPA / recording consent laws).
   - Select the **Voice Agent Persona** and script parameters.
   - Click **Dispatch Call**.
5. Monitor call status indicators (*Initiating*, *Ringing*, *In Progress*, *Completed*).
6. Once completed, click the **Audio Transcript** button to review the text transcript and audio recording.

---

### 4. Task Calendar & Deferred Queue View (AWS EventBridge & SQS)

![Task Calendar View](public/docs/images/task_calendar.png)

#### 🎯 Overview & Strategic Purpose
The **Task Calendar** view provides a visual timeline and scheduling dashboard for deferred background agent tasks. Standard serverless web applications suffer from strict HTTP execution timeouts. The Task Calendar eliminates these limitations by offloading delayed agent jobs to **AWS EventBridge Scheduler** `at()` one-time schedules targeting **AWS SQS standard queues** and worker Lambdas.

#### ⚡ Comprehensive Feature Breakdown & Architecture
- **PostgreSQL Outbox Pattern:** Tasks are written to `public.supervisor_tasks` before creating EventBridge `at()` target-time schedules. If scheduling fails, background reconcilers repair or retry the schedule.
- **Target-Time Countdown Triggers:** Enables tenants to schedule agent tasks to execute at exact future ISO 8601 timestamps (e.g. `at(2026-09-28T14:00:00Z)`). Single-use AWS EventBridge rules trigger SQS standard queues and worker Lambdas with zero idle compute cost.
- **Durable EventBridge + SQS Execution:** Idempotent consumers process SQS messages using task IDs. On worker failures, SQS dead-letter queues (DLQ) and retry policies handle retries without state corruption.
- **Interactive Monthly & Weekly Calendar Timelines:** Visual calendar view displays upcoming scheduled tasks, active execution countdown timers, and historical task outcomes.
- **Fallback & Edge-Case Policy Matrix:** Every scheduled task incorporates a configurable fallback matrix. If a primary tool action fails, the worker loop automatically triggers secondary actions, retries, or voice call escalations.
- **Asynchronous Job Management:** Allows tenants to trigger pending tasks immediately for testing or cancel delayed executions with a single click.

#### 📖 Step-by-Step UI How-To-Use Guide
1. Click **Task Calendar** in the workspace sidebar.
2. Toggle between the **Calendar View** (interactive monthly timeline) and **List View** (tabular job status table).
3. **To Schedule a New Deferred Task:**
   - Click the **Schedule Deferred Task** button.
   - Enter the **Task Title** (e.g. *Nightly Lead Quality Audit*) and **Operational Instructions**.
   - Select the target **Execution Date & Time** using the date-time picker.
   - Select the **Target Agent or Team Graph** to perform the work.
   - Choose allowed **MCP Tools** from the whitelist drawer.
   - Configure **Fallback Policies** (*Escalate to Voice Call*, *Retry with Exponential Backoff*, or *Abort*).
   - Click **Schedule Task**.
4. View the newly created task card on the calendar timeline.
5. To test execution immediately, click on the task card and select **Trigger Now**. To cancel a pending job, click **Cancel Task**.

---

### 5. Context Profiles Engine & Token Budgeting

![Context Profiles](public/docs/images/profiles.png)

#### 🎯 Overview & Strategic Purpose
In modern enterprise LLM architectures, unmanaged prompt context leads directly to context window drift, non-deterministic model behavior, severe hallucination, and escalating API infrastructure costs. The **Context Profiles Engine** serves as a deterministic context compiler (`compileAgentContext`) designed to solve these challenges. It standardizes system prompts, corporate brand voice, customer loyalty rules, working memory, and vector RAG fragments into tight, token-budgeted prompt payloads with stable prefix layouts for prompt caching.

#### ⚡ Comprehensive Feature Breakdown & Deep-Dive Architecture
- **Deterministic Context Compilation Pipeline:** The compiler evaluates and sequences context sources based on tenant-configured priority weights:
  1. `system_instructions` (Priority 100): Core operational boundaries, security guardrails, and role definitions.
  2. `agent_instructions` (Priority 90): Tactical directives, dialog strategy, and persona constraints.
  3. `tenant_context` (Priority 85): Enterprise organization metadata, active SLA tier, brand voice, and legal policies.
  4. `current_user` (Priority 80): User profile, account tenure, loyalty tier privileges, and saved preferences.
  5. `runtime_input` (Priority 75): Primary user prompt and incoming trigger webhook payloads.
  6. `relevant_knowledge` (Priority 70): Retrieval-Augmented Generation (RAG) snippets queried from Supabase `pgvector`.
  7. `long_term_memory` (Priority 65): Vectorized past user interaction memories and preference score records.
  8. `working_memory` (Priority 60): Ephemeral session state, active sub-goals, and pending concessions.
  9. `conversation` (Priority 50): Recent message thread history serialized from Supabase checkpoints.

- **Priority-Based Token Trimming & Prompt Caching:** Standard token counters truncate messages arbitrarily from the top or bottom. The compiler preserves system instructions and identity context at fixed prefix positions, maximizing LLM prompt caching while trimming lower-priority history items to fit within model context limits.

#### 📖 Step-by-Step UI How-To-Use Guide
1. Navigate to **Profiles** from the workspace sidebar menu under the *Workspace* section.
2. View active profile blueprints (e.g., *Customer Support Lead*, *Sales Outbound Representative*, *Technical Auditor*).
3. **To Create or Modify a Context Profile:**
   - Click **Create Profile** or click an existing profile card to edit.
   - Enter the **Profile Name**, **Slug ID**, and **Description**.
   - In the **System Prompt Instructions** field, define core agent behavior, operational guardrails, and forbidden response patterns.
   - Specify **Brand Voice & Tone** guidelines.
   - Define **Max Token Budget** (e.g., `4096`, `8192`, or `120000` tokens).
4. **To Test Context Compilation:**
   - Click the **Live Compiler Sandbox** drawer.
   - Input sample user identity attributes and query strings.
   - Click **Compile Context** to review the prompt preview and token count.

---

### 6. Knowledge Base Ingestion & pgvector RAG Engine

![Knowledge Sources](public/docs/images/sources.png)

#### 🎯 Overview & Strategic Purpose
The **Knowledge Base Ingestion & RAG Engine** equips agents with enterprise-wide long-term memory and factual knowledge retrieval. By integrating a high-performance Retrieval-Augmented Generation (RAG) pipeline backed by Supabase `pgvector`, the platform allows agents to dynamically search, retrieve, and synthesize factual document fragments in real-time under tenant RLS.

#### ⚡ Comprehensive Feature Breakdown & Deep-Dive Architecture
- **Text Chunking Engine:** Incoming documents pass through a text chunking engine that splits large texts into 500-character chunks with a 50-character sliding window overlap.
- **1536-Dimensional Vector Embeddings:** Chunks are transformed into 1536-dimensional vector embeddings using OpenAI `text-embedding-3-small` / Gemini embedding models via tenant BYOK credentials.
- **Supabase pgvector RAG Table (`public.memory_store`):**
```sql
CREATE TABLE IF NOT EXISTS public.memory_store (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    document_name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    embedding extensions.vector(1536),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```
- **Tenant RLS Security:** All vector search queries evaluate `tenant_id = current_setting('app.current_tenant_id')` or `has_tenant_access(tenant_id)`.

---

### 7. MCP Hub & Tools Protocol (Hub-and-Spoke Integration)

![MCP Hub & Tools](public/docs/images/mcp_hub.png)

#### 🎯 Overview & Strategic Purpose
The **MCP Hub** acts as the secure, high-performance nerve center for all external tool connections using the Model Context Protocol (MCP Streamable HTTP JSON-RPC 2.0). It establishes a decentralized Hub-and-Spoke architecture with zero credential exposure.

#### ⚡ Comprehensive Feature Breakdown & Architecture
- **Zero Credential Exposure (KMS Envelope Encryption):** API keys, OAuth2 refresh tokens, and secrets are stored in `public.encrypted_secrets` using AWS KMS AES-256-GCM envelope encryption. Plaintext secrets are strictly scrubbed from browser bundles, LLM context, and logs.
- **SSRF URL Protection:** Custom tenant MCP servers must be HTTPS URLs. The gateway validates target hosts and blocks private RFC 1918 ranges (`10.x`, `172.16-31.x`, `192.168.x`), loopback (`127.x`, `localhost`), link-local (`169.254.x.x`), and AWS metadata IP addresses (`169.254.169.254`). Unsanboxed stdio code execution on platform servers is disabled.
- **Pre-Built Enterprise Spokes:**
  - **Google Workspace (Gmail & Calendar):** `gmail_send_message`, `gmail_fetch_threads`, `calendar_create_event`.
  - **Slack Communications:** `slack_post_message`, `slack_channels_list`.
  - **Tenant Supabase Spoke:** `supabase_query` executing read-only SQL queries against tenant-owned database tables.

---

### 8. Endpoints API & Live cURL Generator

![Endpoints API](public/docs/images/endpoints_api.png)

#### 🎯 Overview & Strategic Purpose
The **Endpoints API** enables seamless headless integration of the Context Control autonomous agent engine into external enterprise systems (`/api/v1/*`). All errors follow the RFC 9457 `application/problem+json` format.

#### ⚡ Core Exposed Routes
- `POST /api/v1/secrets`: Configures BYOK provider credentials with envelope encryption and live connection testing.
- `POST /api/v1/api-keys`: Mints CSPRNG platform API keys (`sk_live_...`) with SHA-256 hash storage.
- `GET /api/v1/jwks.json`: Public JWKS endpoint serving ES256 EC P-256 public keys for client token verification.
- `POST /api/v1/schedule_task`: Schedules an asynchronous task via AWS EventBridge Scheduler and SQS queues.
- `POST /api/webhooks/stripe`: Idempotent Stripe webhook receiver with event ID deduping and plan entitlement updates.

---

### 9. Test Simulator & Time-Travel Sandbox

![Test Simulator](public/docs/images/test_simulator.png)

#### 🎯 Overview & Strategic Purpose
The **Test Simulator** is an isolated developer playground designed specifically to evaluate complex multi-agent graph state transitions, test fallback escalation matrices, and debug scheduled tasks safely without mutating production database tables or firing real API requests.

#### ⚡ Comprehensive Feature Breakdown
- **Time-Travel Clock Fast-Forwarding:** Developers can input a virtual target time, allowing the simulator engine to execute deferred EventBridge and SQS scheduled tasks as if the target date had arrived.
- **Synthetic Fault Injection:** Toggle simulated HTTP 429 rate limits or HTTP 500 server errors to verify that fallback policy matrices (`edgeCasePolicies`) route state machines to backup escalation edges.

---

### 10. Platform MCP Controller (Streamable HTTP)

![Platform MCP Controller](public/docs/images/platform_mcp.png)

#### 🎯 Overview & Strategic Purpose
The **Platform MCP Controller** allows external developer environments—such as Claude Desktop, Cursor IDE, and local CLI agents—to connect *inward* to administer the tenant workspace over Model Context Protocol Streamable HTTP (`/api/mcp/platform`).

#### ⚡ Configuration Snippets
**Generated Cursor IDE Configuration (`.cursor/mcp.json`):**
```json
{
  "mcpServers": {
    "context-control-platform": {
      "url": "https://app.contextcontrol.io/api/mcp/platform",
      "headers": {
        "Authorization": "Bearer sk_live_YOUR_PLATFORM_API_KEY_HERE"
      }
    }
  }
}
```

---

### 11. API Keys & BYOK Security Vault

![API Keys & Security](public/docs/images/api_keys.png)

#### 🎯 Overview & Strategic Purpose
The **API Keys & Security Vault** forms the cryptographic foundation of the platform's multi-tenant architecture:
- **KMS AES-256-GCM Envelope Encryption:** Provider secrets are encrypted with a per-tenant data key generated by AWS KMS, using `tenant_id:provider` as authenticated additional data (AAD).
- **CSPRNG Platform API Keys:** Mints API keys with SHA-256 hash storage (`mcp_api_keys` table). The raw key is shown only once.
- **Asymmetric ES256 Client Tokens:** Mints short-lived client JWTs signed with EC P-256 and verified via public JWKS endpoint (`/api/v1/jwks.json`).
- **Role-Aware RLS Policies:** Restricts table access using `public.has_tenant_access(tenant_id)` and `public.has_tenant_role(tenant_id, allowed_roles)`. Sensitive secret columns (`key_hash`, `encrypted_payload`) have explicit SELECT access revoked from client roles.

---

## 🏗️ Managed Technical Infrastructure (Under the Hood)

- **Next.js 15 Full-Stack UI & API:** React 19 App Router layer deployed on AWS Amplify Hosting.
- **AWS Compute & Queue Infrastructure:** Worker Lambdas, SQS standard queues, EventBridge Scheduler `at()` one-time schedules, KMS envelope encryption.
- **Supabase PostgreSQL & `pgvector`:** Control plane database hosting `checkpoints`, `run_events` (Supabase Realtime), `memory_store` (pgvector), `encrypted_secrets`, and `entitlements`.
- **ElevenLabs & Twilio Telephony:** Low-latency conversational voice synthesis and PSTN calling behind feature flag (`ENABLE_VOICE_CALLS`) and TCPA compliance attestation.

---

## 🚀 Quickstart & Local Development

1. **Clone & Install Dependencies:**
   ```bash
   git clone https://github.com/quetzal-rivas/Multitenant-saas-agentic-platform.git
   cd Multitenant-saas-agentic-platform
   npm install
   ```

2. **Environment Configuration:**
   Copy `.env.example` to `.env.local` and configure required environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. **Database Migration:**
   Apply Supabase Postgres migrations:
   ```bash
   npx supabase db push
   ```

4. **Run Local Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

5. **Run Test Suite & Typecheck:**
   ```bash
   npm test
   npm run build
   ```

---

## 📜 License

Distributed under the MIT License.

