# Multitenant SaaS Agentic Platform & Context Control Studio

An enterprise-grade, multi-tenant SaaS platform for autonomous AI agent teams, persistent conversation threads, scheduled deferred task execution, and Hub-and-Spoke Model Context Protocol (MCP) tool integration.

The platform completely abstracts away cloud infrastructure (AWS Lambda, BullMQ Redis queues, EventBridge schedulers, and Supabase `pgvector` databases) into an intuitive, high-performance UI dashboard for tenants.

---

## 🌟 Quick Overview: Core Tenant Capabilities

- 🤖 **Single & Team Agent Orchestration:** Interactive Agent Studio & visual Team Builder with LangGraph-style supervisor routing.
- 💬 **Persistent Threads & Voice Agents:** Supabase Postgres conversation state with **ElevenLabs Conversational Voice** and **Twilio Phone Calls**.
- 📅 **Deferred Task Calendar View:** BullMQ & AWS EventBridge powered target-time job scheduling with live calendar visualization.
- 🔌 **MCP Tool Hub:** Pre-built Hub-and-Spoke tool connections (Gmail, Slack, Google Calendar, Cloudflare, Supabase Vector, and Custom MCPs).
- 🧠 **Context Profiles & RAG Knowledge:** Token-budgeted context compiler, system instruction profiles, and `pgvector` semantic memory stores.
- ⚡ **Endpoints API & cURL Generator:** Dedicated tenant REST API endpoints (`/api/v1/*`) and interactive cURL request builder.
- 🛡️ **Multi-Tenant BYOK Vault:** AES-256-GCM encrypted credential storage and hardware-level Row-Level Security (RLS) database isolation.

---

## 📱 SaaS Tenant Workspace Guide

---

### 1. Agent Session Studio (Single Agent)

![Agent Session Studio](public/docs/images/agent_studio.png)

#### 🎯 Overview & Purpose
The **Agent Session Studio** is your primary interactive playground for deploying and conversing with single autonomous agents. It provides a real-time streaming interface where agents execute multi-step tool calls, manage token usage, and respond according to configured tenant context profiles.

#### ⚡ Key Capabilities & Integrations
- **Real-Time Streaming:** Inspect LLM thinking steps and live tool invocations as they execute.
- **Context Profile Selection:** Instantly switch agent personas, brand voices, and token budgets.
- **Direct System Overrides:** Test custom system instructions on the fly.
- **Persistent State:** Saves reasoning history to Supabase PostgreSQL checkpointer.

#### 📖 How to Use in the UI
1. Select **Agent Studio** from the left navigation bar under *Workspace*.
2. Choose an active **Context Profile** from the top dropdown selector.
3. Type your instructions in the prompt input field and press **Send** or `Enter`.
4. Monitor the execution accordion to view intermediate tool outputs and reasoning steps.

---

### 2. Team Builder (Multi-Agent Supervisor Graphs)

![Agent Team Builder](public/docs/images/team_builder.png)

#### 🎯 Overview & Purpose
The **Team Builder** allows tenants to configure collaborative multi-agent teams. Using hierarchical supervisor topologies, a central **Supervisor Agent** analyzes incoming instructions and dynamically delegates sub-tasks to specialized worker agents (e.g. Researcher, Copywriter, Data Analyst).

#### ⚡ Key Capabilities & Integrations
- **Hierarchical Routing:** Automatic routing based on specialized agent capabilities.
- **LangGraph State Loops:** Preserves shared memory state across agent transitions.
- **Fallback Policies:** Trigger high-priority voice escalations when primary tool actions fail.
- **Visual Topology Tree:** Inspect agent roles, allowed MCP tools, and delegation rules.

#### 📖 How to Use in the UI
1. Navigate to **Team Builder** in the sidebar.
2. Click **Create New Team** or edit an existing multi-agent template.
3. Define the **Supervisor Persona** and assign specialist **Worker Nodes**.
4. Grant specific MCP tool permissions to individual workers.
5. Click **Deploy Team** to make the graph available for sessions and deferred tasks.

---

### 3. Conversations & Live Voice Conference (Postgres Threads, ElevenLabs & Twilio)

![Conversations & Voice Calls](public/docs/images/conversations.png)

#### 🎯 Overview & Purpose
The **Conversations** module provides full visibility into all past and active agent execution threads. It houses the **Live Voice Conference** engine, allowing agents to conduct outbound and inbound telephone calls powered by **ElevenLabs Conversational AI** and **Twilio telephony**.

#### ⚡ Key Capabilities & Integrations
- **ElevenLabs Voice Integration:** Natural, low-latency conversational voice synthesis.
- **Twilio Phone Numbers:** Direct PSTN phone call dispatch and SMS notifications.
- **Postgres Persistent Threads:** Binary state checkpoints and complete audit logs stored in Supabase.
- **Audio Transcript Audit:** Search, filter, and inspect full text and audio recordings of call interactions.

#### 📖 How to Use in the UI
1. Click **Conversations** on the left menu.
2. Select any thread to review step-by-step history, inputs, and outputs.
3. For voice operations, click **Trigger Voice Call**, enter the recipient phone number, and select the voice agent persona.
4. Monitor call status in real-time and review transcripts upon call completion.

---

### 4. Task Calendar & Deferred Queue View (BullMQ & EventBridge)

![Task Calendar View](public/docs/images/task_calendar.png)

#### 🎯 Overview & Purpose
The **Task Calendar** provides a visual timeline of scheduled and executed background agent jobs. It abstracts away serverless timeout limits by offloading delayed tasks to a durable **BullMQ Redis Queue** and **AWS EventBridge Target-Time Scheduler**.

#### ⚡ Key Capabilities & Integrations
- **Target-Time Scheduling:** Schedule agent workflows to run at exact future dates and times.
- **Calendar & List Views:** Toggle between timeline calendar views and tabular job execution lists.
- **Automatic Retries & Recovery:** Survives worker restarts with atomic Redis job journals.
- **Asynchronous Cancellation:** Easily cancel or reschedule pending future tasks.

#### 📖 How to Use in the UI
1. Select **Task Calendar** from the sidebar.
2. Click **Schedule Deferred Task**.
3. Enter the task prompt, target execution date/time, and select the target agent or team.
4. View the upcoming job on the calendar timeline or manage pending executions from the job table.

---

### 5. Context Profiles Engine

![Context Profiles](public/docs/images/profiles.png)

#### 🎯 Overview & Purpose
The **Context Profiles** view allows tenants to construct fine-tuned context profiles that govern agent behavior. Context profiles combine system instructions, tenant brand voice, customer loyalty tier rules, and token budget allocations.

#### ⚡ Key Capabilities & Integrations
- **Token Budget Allocation:** Enforce hard token limits with dynamic priority-based section trimming.
- **Brand Voice Injection:** Ensure all agents speak in your tenant's exact tone and style.
- **Multi-Persona Profiles:** Create custom profiles for Customer Support, Sales Outbound, Technical Audit, and Executive Summaries.

#### 📖 How to Use in the UI
1. Click **Profiles** in the navigation sidebar.
2. Select **Create Profile** or click an existing profile to edit.
3. Configure the System Prompt, Tone/Voice guidelines, and maximum Token Budget limit.
4. Save the profile to make it immediately selectable across the Agent Studio and API endpoints.

---

### 6. Knowledge Sources & Memory (RAG Ingestion & Supabase pgvector)

![Knowledge Sources](public/docs/images/sources.png)

#### 🎯 Overview & Purpose
The **Sources** dashboard manages tenant Retrieval-Augmented Generation (RAG) knowledge bases and long-term semantic memories stored in Supabase `pgvector`. Agents retrieve relevant knowledge snippets automatically during session turns.

#### ⚡ Key Capabilities & Integrations
- **Document & URL Ingestion:** Index PDFs, text documents, and website URLs.
- **Supabase pgvector:** High-dimensional vector embeddings with fast cosine similarity search.
- **Tenant Sandboxing:** Strict Row-Level Security (RLS) guarantees complete tenant memory isolation.

#### 📖 How to Use in the UI
1. Navigate to **Sources** under *Workspace*.
2. Click **Ingest Source** to upload a document or submit a website URL.
3. Test semantic queries in the search box to verify indexed memory fragments.

---

### 7. MCP Hub & Tools Protocol (Hub-and-Spoke Integration)

![MCP Hub & Tools](public/docs/images/mcp_hub.png)

#### 🎯 Overview & Purpose
The **MCP Hub** is your control panel for Model Context Protocol (MCP) tool integrations. It aggregates pre-authenticated tool spokes (Gmail, Slack, Google Calendar, Cloudflare, Supabase Vector) and allows tenants to connect custom stdio or SSE MCP servers.

#### ⚡ Key Capabilities & Integrations
- **Zero Credential Exposure:** API keys and OAuth tokens are stored in the BYOK vault and injected at the gateway level.
- **Pre-Built Spokes:** One-click integration for Gmail, Slack, Google Calendar, Cloudflare, and Supabase.
- **JSON Schema Validation:** Standardized input/output validation for all tool calls.

#### 📖 How to Use in the UI
1. Click **MCP Hub & Tools** in the left navigation menu.
2. Toggle active spokes on or off.
3. Enter required tenant API keys into the encrypted credential drawer.
4. Click **Test Tool Connection** to verify endpoint status.

---

### 8. Skills Library Registry

![Skills Library](public/docs/images/skills_library.png)

#### 🎯 Overview & Purpose
The **Library** view contains modular skill packages that can be attached to agents. Skills extend agent capabilities with domain-specific workflows, multi-step heuristics, and specialized API integrations.

#### ⚡ Key Capabilities & Integrations
- **Pre-Built Skill Kits:** Pre-configured skills for CRM lead enrichment, calendar management, and security audits.
- **Custom Skill Upload:** Import custom skill markdown (`SKILL.md`) definitions and scripts.
- **Agent Skill Assignment:** Grant or revoke skills per agent profile with a single toggle.

#### 📖 How to Use in the UI
1. Navigate to **Library** from the sidebar.
2. Browse available skill cards or click **Upload Custom Skill**.
3. Enable desired skills to make them accessible to your Agent Studio and Team Builder graphs.

---

### 9. Endpoints API & Live cURL Generator

![Endpoints API](public/docs/images/endpoints_api.png)

#### 🎯 Overview & Purpose
The **Endpoints** view provides complete documentation and a live cURL request generator for the tenant REST API (`/api/v1/*`). It enables headless integration into external webhooks, mobile apps, and SaaS backends.

#### ⚡ Key Capabilities & Integrations
- **Interactive cURL Generator:** Live payload builder for `/api/v1/tasks`, `/api/v1/schedule_task`, and `/api/v1/context/resolve`.
- **Copy-and-Paste Code Snippets:** Ready-to-use snippets in cURL, JavaScript, Python, and Go.
- **Tenant Auth Header:** Pre-populated with your tenant workspace API key.

#### 📖 How to Use in the UI
1. Click **Endpoints** under the *Workspace* section.
2. Select the target API route from the endpoint selector list.
3. Adjust request parameters in the UI form to automatically generate the cURL request.
4. Click **Copy cURL** or **Execute Request** to test directly in the browser.

---

### 10. Test Simulator & Time-Travel Sandbox

![Test Simulator](public/docs/images/test_simulator.png)

#### 🎯 Overview & Purpose
The **Test Simulator** is a sandbox testing environment designed to evaluate agent state machine graph transitions, edge-case failure handling, and scheduled task triggers without affecting production database state.

#### ⚡ Key Capabilities & Integrations
- **Time-Travel Simulation:** Fast-forward countdown timers to trigger scheduled deferred tasks immediately.
- **Tool Failure Injection:** Test conditional escalation graphs by simulating primary tool outages (e.g. Gmail rate limits).
- **Waterfall Step Trace:** Step-by-step state inspection with execution timings and payload diffs.

#### 📖 How to Use in the UI
1. Select **Test Simulator** from the *Developer* section of the sidebar.
2. Choose a test scenario or construct a mock task payload.
3. Click **Run Simulation** and inspect the step-by-step graph traversal waterfall.

---

### 11. Platform MCP Controller

![Platform MCP Controller](public/docs/images/platform_mcp.png)

#### 🎯 Overview & Purpose
The **Platform MCP** view manages external host connections (e.g. Claude Desktop, Cursor, IDE plugins) to your tenant workspace. It exposes a standardized MCP server endpoint (`/api/mcp/platform`).

#### ⚡ Key Capabilities & Integrations
- **Stdio & SSE Support:** Standardized transport protocols for desktop client connections.
- **Supervisor Control:** Allows external host applications to trigger tenant agent graphs and scheduled tasks.

#### 📖 How to Use in the UI
1. Navigate to **Platform MCP** in the sidebar.
2. Copy the generated MCP server configuration JSON.
3. Paste the configuration into your `claude_desktop_config.json` or local IDE settings.

---

### 12. API Keys & Security Vault

![API Keys & Security](public/docs/images/api_keys.png)

#### 🎯 Overview & Purpose
The **API Keys & Tokens** module manages workspace access keys and tenant BYOK credentials. All secrets are stored using AES-256-GCM encryption in the tenant vault and isolated using Supabase PostgreSQL Row-Level Security (RLS).

#### ⚡ Key Capabilities & Integrations
- **AES-256-GCM BYOK Vault:** Enforces zero plaintext storage for third-party OAuth tokens and secret keys.
- **Short-Lived Context Tokens:** Mint temporary tokens for client-side web widgets.
- **Row-Level Security (RLS):** Database-enforced isolation per tenant ID (`app.current_tenant_id`).

---

## 🏗️ Managed Technical Infrastructure (Under the Hood)

While all day-to-day operations are handled seamlessly through the UI dashboard, the platform is backed by enterprise cloud infrastructure:

- **Next.js 15 Full-Stack UI & API:** Serverless application layer deployed on AWS.
- **BullMQ & Redis Queue:** High-throughput delayed queue engine for background worker jobs.
- **AWS EventBridge Scheduler:** Serverless target-time trigger engine with automatic schedule cleanup.
- **Supabase PostgreSQL & `pgvector`:** Durable state checkpointing and vector memory store with strict RLS policies.
- **ElevenLabs & Twilio Telephony:** Low-latency conversational voice engine with direct phone calling.

---

## 📜 License

Distributed under the MIT License.
