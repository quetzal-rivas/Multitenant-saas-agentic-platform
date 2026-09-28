# Context Control Multitenant SaaS Agentic Platform

An enterprise-grade, multi-tenant SaaS platform for autonomous AI agent teams, persistent conversation threads, scheduled deferred task execution, and Hub-and-Spoke Model Context Protocol (MCP) tool integration.

The platform completely abstracts away cloud infrastructure (AWS Lambda, BullMQ Redis queues, EventBridge schedulers, and Supabase `pgvector` databases) into an intuitive, high-performance UI dashboard for tenants.

---

## 🌟 Comprehensive Tenant Capabilities

- 🤖 **Agent & Team Studio:** Interactive Agent Session Studio and visual Team Builder with LangGraph hierarchical supervisor routing.
- 💬 **Persistent Threads & Voice AI Engine:** Supabase PostgreSQL conversation state checkpointing paired with **ElevenLabs Conversational Voice AI** and **Twilio Phone Telephony**.
- 📅 **Deferred Task Calendar View:** BullMQ & AWS EventBridge powered target-time job scheduling with live calendar visualization and countdown triggers.
- 🔌 **MCP Tool Hub & Gateway:** Pre-built Hub-and-Spoke tool connections (Gmail, Slack, Google Calendar, Cloudflare, Supabase Vector, and Custom MCPs) with zero credential leakage.
- 🧠 **Context Profiles & RAG Knowledge:** Token-budgeted context compiler, system instruction profiles, tenant brand voice enforcement, and `pgvector` 1536d semantic memory stores.
- ⚡ **Endpoints API & Live cURL Generator:** Dedicated tenant REST API endpoints (`/api/v1/*`) and interactive cURL request builder.
- 🛡️ **Multi-Tenant BYOK Vault:** AES-256-GCM encrypted credential storage and hardware-level Row-Level Security (RLS) database isolation.

---

## 📱 SaaS Tenant Workspace User Guide

---

### 1. Agent Session Studio (Single Agent)

![Agent Session Studio](public/docs/images/agent_studio.png)

#### 🎯 Overview & Strategic Purpose
The **Agent Session Studio** serves as the primary real-time operational interface for single autonomous agents. It bridges high-level tenant prompt inputs with dynamic LLM reasoning, live tool call execution, and token-budgeted context resolution. Rather than relying on simple stateless chat widgets, the Agent Studio provides full visibility into the agent's internal thought process, active context profile parameters, and intermediate tool execution outputs.

#### ⚡ Comprehensive Feature Breakdown & Architecture
- **Real-Time Thought & Tool Execution Streaming:** As the agent evaluates user instructions, every intermediate reasoning step, JSON schema validation, and tool call payload is streamed live to the UI interface. Tenants can expand individual execution cards to inspect raw tool arguments (e.g. searching Gmail threads or querying CRM databases) and response status codes.
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
- **Hierarchical Routing Topologies:** Incorporates LangGraph-style state machine routing patterns (`supervisor_router`, `sequential_pipeline`, `consensus`). The supervisor agent evaluates incoming user turns and routes control to worker nodes based on their assigned operational roles and tool whitelists.
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
- **ElevenLabs Speech Synthesis Integration:** Outbound voice calls utilize ElevenLabs low-latency conversational speech synthesis models, delivering natural human-like voice tone, emotion inflection, and custom accent selection.
- **Twilio Telephony & PSTN Trunking:** Manages direct phone call dispatch and phone number provisioning via Twilio. Supports automated outbound calling for urgent escalations, appointment reminders, and lead follow-ups.
- **Real-Time Audio & Text Transcript Logs:** Automatically transcribes voice call conversations into text transcripts and stores call recordings. Tenants can review full transcripts, play back call audio, and analyze caller sentiment directly in the UI.
- **Multi-Tenant RLS Isolation:** All thread records and call transcripts enforce strict tenant isolation via Postgres session variable `app.current_tenant_id`.

#### 📖 Step-by-Step UI How-To-Use Guide
1. Select **Conversations** from the left navigation menu under *Workspace*.
2. Browse the thread list or use the search bar to filter by thread ID, customer contact name, or date range.
3. Click any thread row to view its full conversation history, inspect LLM reasoning steps, and review tool call payloads.
4. **To Dispatch a Live Voice Call:**
   - Click the **Trigger Voice Call** button at the top of the view.
   - Enter the target recipient phone number in E.164 format (e.g. `+15554389021`).
   - Select the **Voice Agent Persona** and voice style (e.g. *Professional Female*, *Executive Male*).
   - Enter the **Call Script / Operational Goal** (e.g. *"Verify invoice #4029 and confirm payment approval"*).
   - Click **Dispatch Call**.
5. Monitor call status indicators (*Initiating*, *Ringing*, *In Progress*, *Completed*).
6. Once completed, click the **Audio Transcript** button to review the full text transcript and listen to the call audio recording.

---

### 4. Task Calendar & Deferred Queue View (BullMQ & EventBridge)

![Task Calendar View](public/docs/images/task_calendar.png)

#### 🎯 Overview & Strategic Purpose
The **Task Calendar** view provides a visual timeline and scheduling dashboard for deferred background agent tasks. Standard serverless web applications suffer from strict HTTP execution timeouts (10 to 60 seconds). The Task Calendar eliminates these limitations by offloading delayed agent jobs to a durable **BullMQ Redis Queue** and **AWS EventBridge Target-Time Scheduler**.

#### ⚡ Comprehensive Feature Breakdown & Architecture
- **Target-Time Countdown Triggers:** Enables tenants to schedule agent tasks to execute at exact future ISO 8601 timestamps (e.g. `at(2026-09-28T14:00:00Z)`). Single-use AWS EventBridge rules trigger background workers at the target time with zero idle compute costs.
- **BullMQ Redis Queue Durability:** Scheduled jobs are enqueued into BullMQ sorted sets and atomic Redis journals (`durable_queue_journal.json`). If a worker container recycles or restarts, all scheduled executions survive without job loss.
- **Interactive Monthly & Weekly Calendar Timelines:** Visual calendar view displays upcoming scheduled tasks, active execution countdown timers, and historical task outcomes.
- **Fallback & Edge-Case Policy Matrix:** Every scheduled task incorporates a configurable fallback matrix. If a primary tool action bounces during execution, the queue engine automatically triggers secondary actions, retries, or voice call escalations.
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
In modern enterprise LLM architectures, unmanaged prompt context leads directly to context window drift, non-deterministic model behavior, severe hallucination, and escalating API infrastructure costs. The **Context Profiles Engine** serves as a deterministic context compiler (`compileContext`) designed to solve these challenges. It standardizes system prompts, corporate brand voice, customer loyalty rules, working memory, and vector RAG fragments into tight, token-budgeted prompt payloads.

By establishing strict **Context Profiles**, tenant organizations can guarantee that their AI agents remain compliant with corporate brand guidelines, legal policies, and token allocation limits across every interaction channel—whether serving live customer support chats, executing background BullMQ tasks, or answering voice calls over PSTN phone lines.

#### ⚡ Comprehensive Feature Breakdown & Deep-Dive Architecture
- **Deterministic Context Compilation Pipeline:** The compiler executes a multi-stage pipeline defined in `lib/compiler.ts`. The pipeline evaluates and sequences context sources based on tenant-configured priority weights:
  1. `system_instructions` (Priority 100): Core operational boundaries, security guardrails, and role definitions.
  2. `agent_instructions` (Priority 90): Tactical directives, dialog strategy, and persona constraints.
  3. `tenant_context` (Priority 85): Enterprise organization metadata, active SLA tier, brand voice, and legal policies.
  4. `current_user` (Priority 80): User profile, account tenure, loyalty tier privileges, and saved preferences.
  5. `runtime_input` (Priority 75): Primary user prompt and incoming trigger webhook payloads.
  6. `relevant_knowledge` (Priority 70): Retrieval-Augmented Generation (RAG) snippets queried from Supabase `pgvector`.
  7. `long_term_memory` (Priority 65): Vectorized past user interaction memories and preference score records.
  8. `working_memory` (Priority 60): Ephemeral session state, active sub-goals, and pending concessions.
  9. `conversation` (Priority 50): Recent message thread history serialized from Supabase checkpoints.

- **Priority-Based Token Trimming Algorithm:** Standard token counters truncate messages arbitrarily from the top or bottom of the history stack, often destroying vital system instructions or user identity context. The platform's compiler utilizes a priority-aware trimming algorithm (`estimateTokens` based on a 3.8 characters-per-token heuristic):
  - The compiler calculates total prompt tokens across all enabled pipeline steps.
  - If total tokens exceed `maxTokensBudget` (e.g., 4,096 or 8,192 tokens), the compiler sorts steps by `priority` in descending order.
  - Lower-priority steps (such as older conversation turns or supplementary long-term memories) are trimmed or omitted first.
  - High-priority steps (`system_instructions`, `tenant_context`, `current_user`) are strictly preserved without truncation.

- **Contract Validation Matrix:** Profiles specify a data contract (`profile.contract.required`) enforcing required identity and input parameters (e.g., `tenant_id`, `user_id`, `conversation_id`, `query`). Before context assembly begins, the contract validator checks incoming payload keys. If required parameters are missing, the compiler flags validation failures in the resolution metadata, preventing incomplete context execution.

- **Tenant Brand Voice & Policy Injection:** Automatically injects tenant-specific corporate brand voice directives (e.g., *"Sophisticated, reassuring, concierge-level hospitality with zero aggressive pressure"*) and governance rules directly into system instructions, standardizing tone across all communication channels.

- **Multi-Format Compilation:** Supports rendering output context in formatted GitHub Flavored Markdown (for direct LLM ingestion) or structured JSON (`ResolveResponse` payload containing detailed source breakdown metrics, latency counters, and token counts).

#### 📖 Step-by-Step UI How-To-Use Guide
1. Navigate to **Profiles** from the workspace sidebar menu under the *Workspace* section.
2. View active profile blueprints (e.g., *Customer Support Lead*, *Sales Outbound Representative*, *Technical Auditor*).
3. **To Create or Modify a Context Profile:**
   - Click **Create Profile** or click an existing profile card to edit.
   - Enter the **Profile Name**, **Slug ID**, and **Description**.
   - In the **System Prompt Instructions** field, define core agent behavior, operational guardrails, and forbidden response patterns.
   - Specify **Brand Voice & Tone** guidelines (e.g. *Authoritative, concise, executive-focused*).
   - Define **Max Token Budget** (e.g., `4096`, `8192`, or `16384` tokens).
   - Configure **Pipeline Step Priorities** by adjusting priority sliders for System Instructions, Knowledge Base RAG, User Identity, and Conversation History.
4. **To Test Context Compilation:**
   - Click the **Live Compiler Sandbox** drawer.
   - Input sample user identity attributes and query strings.
   - Click **Compile Context**.
   - Review the compiled prompt preview, token budget usage gauge, and step-by-step latency breakdown.
5. Click **Save Profile Blueprint** to deploy the profile across the Agent Studio, Team Builder, and REST API.

#### 💻 Developer API & Code Specifications
Tenants can resolve context programmatically via the REST API endpoint `/api/v1/context/resolve`:

```bash
curl -X POST "https://d1ct23sivfa3uv.amplifyapp.com/api/v1/context/resolve" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: tenant_enterprise_corp" \
  -d '{
    "profile_id": "profile_customer_support",
    "identity": {
      "tenant_id": "tenant_123",
      "user_id": "user_456",
      "conversation_id": "conv_8910"
    },
    "input": {
      "query": "What concessions can we offer for annual membership renewals?"
    },
    "options": {
      "format": "json",
      "max_tokens": 8192
    }
  }'
```

```json
{
  "profile": "customer_support",
  "version": "1.4.0",
  "context": {
    "format": "json",
    "structured": {
      "sections": [
        {
          "section": "System Instructions",
          "priority": 100,
          "tokens": 240,
          "content": "Adhere strictly to system boundaries..."
        }
      ]
    }
  },
  "metadata": {
    "token_count": 1840,
    "max_tokens_budget": 8192,
    "sources": ["instructions", "tenant", "user", "rag", "memory"],
    "resolution_time_ms": 12,
    "contract_validation": {
      "valid": true,
      "missing_required": [],
      "provided": ["tenant_id", "user_id", "query"]
    }
  }
}
```

---

### 6. Knowledge Base Ingestion & pgvector RAG Engine

![Knowledge Sources](public/docs/images/sources.png)

#### 🎯 Overview & Strategic Purpose
The **Knowledge Base Ingestion & RAG Engine** equips agents with enterprise-wide long-term memory and factual knowledge retrieval. LLMs trained on static pre-training data suffer from knowledge cutoff dates and cannot access internal corporate documents, customer SOPs, or private product knowledge. 

By integrating a high-performance Retrieval-Augmented Generation (RAG) pipeline backed by Supabase `pgvector`, the platform allows agents to dynamically search, retrieve, and synthesize factual document fragments in real-time during chat sessions, voice calls, and scheduled background tasks.

#### ⚡ Comprehensive Feature Breakdown & Deep-Dive Architecture
- **Multi-Source Document Ingestion Pipeline:** Supports seamless ingestion across multiple content formats:
  - **File Uploads:** PDF documents, plain text files (`.txt`), and Markdown manuals (`.md`).
  - **Web Scraping & URL Crawler:** Automatically fetches web page HTML, strips clutter, extracts core semantic text, and converts content into clean markdown.
  - **Database Records:** Direct ingestion of customer CRM tables and operational knowledge objects.

- **Automated Text Chunking & Overlap Strategy:** Incoming documents pass through a text chunking engine that splits large texts into optimized passages (500 tokens per chunk with a 50-token sliding window overlap). Overlapping guarantees that key context spanning sentence boundaries is preserved across adjacent chunks.

- **Supabase pgvector Embedding Store:** Chunks are transformed into 1536-dimensional vector embeddings using OpenAI `text-embedding-3-small` / Gemini embedding models. Vector embeddings are stored in Supabase PostgreSQL under `public.memory_store`:

```sql
CREATE TABLE IF NOT EXISTS public.memory_store (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    thread_id VARCHAR(128) NOT NULL,
    profile_id VARCHAR(64),
    content TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

- **Cosine Distance Vector Indexing:** Fast vector similarity search is powered by an HNSW / IVFFlat cosine similarity index (`idx_memory_store_tenant_thread`):

```sql
SELECT id, content, metadata, 1 - (embedding <=> $1) AS similarity_score
FROM public.memory_store
WHERE tenant_id = current_setting('app.current_tenant_id')::uuid
  AND 1 - (embedding <=> $1) >= 0.70
ORDER BY similarity_score DESC
LIMIT 5;
```

- **Hardware-Level Tenant RLS Security:** Vector similarity queries enforce strict PostgreSQL Row-Level Security (RLS). Cross-tenant data leaks are physically impossible at the database engine level because queries evaluate `tenant_id = current_setting('app.current_tenant_id')`.

- **Semantic Search Sandbox:** Includes a built-in search testing tool allowing tenant administrators to input natural language queries, execute real-time similarity vector searches, inspect match confidence scores, and preview raw text fragments.

#### 📖 Step-by-Step UI How-To-Use Guide
1. Select **Sources** from the workspace sidebar menu under *Workspace*.
2. Review the list of active knowledge sources, indexed document counts, total vector embeddings, and last sync timestamps.
3. **To Ingest a New Knowledge Source:**
   - Click **Ingest New Source** in the top right corner.
   - Choose **File Upload** or **URL Web Crawler**.
   - If *File Upload*: Drag and drop PDF, TXT, or MD files into the dropzone.
   - If *URL Web Crawler*: Enter target website URLs (e.g. `https://docs.company.com/sop`).
   - Select target **Knowledge Category** (e.g. *Legal & Compliance*, *Product Specifications*, *Customer SOPs*).
   - Click **Process & Embed**.
4. Monitor live ingestion status: Text extraction -> Chunk generation -> Embedding creation -> Supabase index write.
5. **To Test Vector Retrieval:**
   - Click the **Semantic Search Sandbox** tab.
   - Type a query string (e.g., *"What is our refund policy for VIP members?"*).
   - Set the **Similarity Threshold** slider (e.g. `0.75`) and **Max Results** (`Top 5`).
   - Click **Run Vector Search** to inspect matching chunks and similarity percentages.

#### 💻 Developer API & Code Specifications
Developers can ingest documents programmatically via the REST API endpoint `/api/v1/sources`:

```bash
curl -X POST "https://d1ct23sivfa3uv.amplifyapp.com/api/v1/sources/ingest" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: tenant_enterprise_corp" \
  -d '{
    "source_type": "url",
    "url": "https://company.com/terms",
    "category": "legal_policies",
    "metadata": {
      "author": "Compliance Team",
      "version": "2026.1"
    }
  }'
```

```json
{
  "status": "success",
  "document_id": "doc_99182",
  "chunks_created": 14,
  "embeddings_stored": 14,
  "vector_dimensions": 1536,
  "index_name": "idx_memory_store_tenant_thread",
  "execution_time_ms": 1420
}
```

---

### 7. MCP Hub & Tools Protocol (Hub-and-Spoke Integration)

![MCP Hub & Tools](public/docs/images/mcp_hub.png)

#### 🎯 Overview & Strategic Purpose
The **MCP Hub** acts as the secure, high-performance nerve center for all external tool connections. By adopting the open standard **Model Context Protocol (MCP 2024-11-05 JSON-RPC 2.0)**, the platform establishes a decentralized Hub-and-Spoke architecture. This allows agents to interact with external enterprise systems (like Salesforce, Gmail, Slack, and cloud databases) without needing hardcoded REST API integrations for every service.

Crucially, the MCP Hub solves the "Zero-Trust Agent Tooling" problem. Instead of injecting raw API keys into the LLM's system prompt (which risks catastrophic credential leakage during prompt injection attacks), all API keys remain encrypted inside the `public.tenant_vault`. The MCP Gateway proxy intercepts tool calls, injects the decrypted credentials on the server side, executes the action against the spoke, and returns only the sanitized result back to the agent's context window.

#### ⚡ Comprehensive Feature Breakdown & Deep-Dive Architecture
- **Zero Credential Exposure (AES-256-GCM Vault):** The platform maintains a rigorous boundary between the LLM inference engine and the API execution layer. API keys, OAuth2 refresh tokens, and JWT secrets are stored in the PostgreSQL `public.tenant_vault` table using AES-256-GCM authenticated encryption. The LLM never sees these tokens.
- **Pre-Authenticated Enterprise Spokes:** The Hub includes a library of out-of-the-box, one-click enterprise spokes configured to execute standard operational playbooks:
  - **Google Workspace (Gmail):** `gmail_send_message` (dispatching outgoing client replies), `gmail_fetch_threads` (auditing customer email history).
  - **Slack Communications:** `slack_post_message` (general channel updates), `slack_post_incident_alert` (high-priority escalation pings).
  - **Google Calendar:** `calendar_list_events` (checking team availability), `calendar_create_event` (booking meetings).
  - **Cloudflare & Network:** `cloudflare_verify_token` (DNS validation), `supabase_vector_query` (cross-database RAG fetching).
- **Custom MCP Transports (Stdio & SSE):** Beyond the pre-built spokes, tenants can connect their own custom tool servers using two standardized transports:
  - **Stdio Transport:** Spawns local Node.js or Python subprocesses (e.g., `npx @modelcontextprotocol/server-postgres`) communicating via stdin/stdout.
  - **SSE (Server-Sent Events) HTTP Transport:** Connects to remote HTTP servers over persistent SSE streaming connections, allowing agent execution against VPC-isolated internal enterprise APIs.
- **Strict JSON Schema Validation:** Every tool registered in the Hub provides a rigid JSON Schema definition for its parameters. The compiler validates LLM tool outputs against this schema before execution. If validation fails, the Hub automatically generates a localized error response (e.g., *"Missing required property 'recipient_email'"*) and prompts the agent to self-correct its payload without crashing the session.

#### 📖 Step-by-Step UI How-To-Use Guide
1. Select **MCP Hub & Tools** from the sidebar menu under *Workspace*.
2. Browse the grid of available tool spokes.
3. **To Activate a Pre-Built Spoke (e.g. Gmail):**
   - Click the toggle switch in the upper-right corner of the Gmail spoke card.
   - Click **Configure Credentials** to open the secure BYOK (Bring Your Own Key) drawer.
   - Paste your OAuth Refresh Token or API Key. The UI masks this input and immediately encrypts it in the vault.
   - Click **Test Tool Connection** to dispatch a JSON-RPC `ping` command to the spoke server. A green success badge indicates the tool is operational.
4. **To Register a Custom MCP Server:**
   - Click **Add Custom MCP Server** at the top of the hub.
   - Define the **Server Name** and **Transport Protocol** (Stdio or SSE).
   - For Stdio: Provide the execution command (e.g. `npx -y @mcp/my-custom-server`).
   - For SSE: Provide the remote endpoint URL (e.g. `https://api.mycompany.internal/mcp`).
   - Save the configuration. The hub will automatically request a `list_tools` payload from the custom server and map the new tools into the agent's available inventory.

#### 💻 Developer API & Code Specifications
The MCP Gateway expects standard JSON-RPC 2.0 payloads for tool execution.

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "id": "req_847192",
  "params": {
    "name": "gmail_send_message",
    "arguments": {
      "to": "client@acmecorp.io",
      "subject": "Your Retention Concessions",
      "body": "Hi Sarah, we have successfully waived your 2026 assessment fee."
    }
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": "req_847192",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Message successfully dispatched via Gmail API. Thread ID: 18b48f9d8a3c."
      }
    ],
    "isError": false
  }
}
```

---

### 8. Skills Library Registry

![Skills Library](public/docs/images/skills_library.png)

#### 🎯 Overview & Strategic Purpose
The **Skills Library** shifts autonomous agents from generalized chat assistants into highly specialized operational workers. While tools provide the "hands" to perform actions (like sending an email), **Skills** provide the "brain" (the multi-step heuristic instructions on *when* and *how* to use those tools). 

By packaging complex standard operating procedures (SOPs) into modular `SKILL.md` markdown files, tenants can instantly upgrade agent capabilities. Instead of writing massive, fragile system prompts, administrators can dynamically toggle discrete skills on or off depending on the agent's assigned role in the team graph.

#### ⚡ Comprehensive Feature Breakdown & Deep-Dive Architecture
- **`SKILL.md` Markdown Packaging:** Skills are defined using a structured Markdown syntax combining YAML frontmatter metadata and descriptive instruction blocks. This dual-format ensures skills are both machine-readable (for the context compiler) and easily auditable by human operators.
  - **YAML Frontmatter:** Defines the skill's `name`, `description`, `version`, `required_mcp_tools`, and regex `triggers`.
  - **Instruction Body:** Contains the step-by-step heuristic logic the LLM must follow when executing the skill (e.g., *"Step 1: Fetch invoice status using `stripe_get_invoice`. Step 2: If unpaid, dispatch `slack_post_message` to the billing channel."*).
- **Dynamic Context Injection:** The context compiler (`lib/compiler.ts`) monitors the incoming user query against the `triggers` defined in the active agent's bound skills. If a trigger matches, the compiler dynamically injects that specific skill's instructions into the priority prompt context, maximizing token efficiency by excluding irrelevant SOPs.
- **Pre-Built Enterprise Catalog:** The registry includes a curated catalog of standard skills ready for one-click deployment, including:
  - *CRM Lead Enrichment Pipeline:* Automatically fetches company data via Clearbit and logs updates in HubSpot.
  - *PostgreSQL Performance Tuning:* Executes `EXPLAIN ANALYZE` on slow queries and recommends index creations.
  - *Security Audit Hardening:* Scans imported dependencies and checks for CVE vulnerabilities.

#### 📖 Step-by-Step UI How-To-Use Guide
1. Navigate to **Library** under the *Workspace* section.
2. Browse the grid of available skill packages. 
3. **To Enable a Skill for an Agent:**
   - Open the **Agent Studio** or **Team Builder**.
   - In the agent configuration drawer, scroll to **Bound Skills**.
   - Select the desired skill (e.g. *Database Query Optimizer*) from the dropdown menu to bind it to the agent's profile (`bound_skill_ids`).
4. **To Upload a Custom Skill (`SKILL.md`):**
   - In the Library view, click **Upload Custom Skill**.
   - Drag and drop your `.md` file containing the valid YAML frontmatter block.
   - The platform will parse the file, validate the required MCP tool dependencies, and add the skill card to your tenant registry.

#### 💻 Developer API & Code Specifications
An example of a valid `SKILL.md` package payload parsed by the registry:

```markdown
---
name: Stripe Billing Dispute Resolver
description: Standard operating procedure for handling customer chargebacks and invoice disputes.
version: 1.0.0
author: Finance Operations
triggers:
  - "chargeback"
  - "dispute"
  - "invoice incorrect"
required_mcp_tools:
  - stripe_get_dispute
  - stripe_issue_refund
  - slack_post_message
---

# Stripe Billing Dispute Resolver

## Execution Heuristics
When a user asks about a disputed charge or an incorrect invoice, follow these steps exactly:
1. Extract the Invoice ID or Charge ID from the user query.
2. Execute `stripe_get_dispute` to retrieve the current dispute status.
3. If the dispute status is "needs_response", evaluate the concession matrix.
4. If the user is a Diamond Tier member, execute `stripe_issue_refund` immediately without human intervention.
5. If the user is below Diamond Tier, execute `slack_post_message` to the `#finance-escalations` channel and inform the user that the review is pending.
```

---

### 9. Endpoints API & Live cURL Generator

![Endpoints API](public/docs/images/endpoints_api.png)

#### 🎯 Overview & Strategic Purpose
The **Endpoints API** enables seamless headless integration of the Context Control autonomous agent engine into external enterprise systems. By utilizing the platform's RESTful API (`/api/v1/*`), tenants can embed autonomous capabilities directly into their own custom mobile apps, React web frontends, Zapier webhooks, and legacy CRM backend triggers.

To accelerate developer onboarding, the UI features an interactive, real-time **Live cURL Generator**. As developers adjust payload parameters in the visual form (such as selecting a target agent profile or modifying a scheduled execution time), the code snippet automatically regenerates in cURL, JavaScript (Fetch), Python (Requests), and Go.

#### ⚡ Comprehensive Feature Breakdown & Deep-Dive Architecture
- **Tenant API Gateway (`/api/v1/*`):** The core REST engine validates inbound requests using a strict multi-tenant authentication protocol. Every request must include the `x-tenant-id` header and a secure Bearer Authorization token signed by the tenant's BYOK vault.
- **Core Exposed Routes:**
  - `POST /api/v1/chat`: Synchronous blocking endpoint that submits a message to an agent profile and waits for the final response (ideal for simple chat interfaces).
  - `POST /api/v1/schedule_task`: Asynchronous endpoint that pushes a deferred task to the BullMQ Redis queue with a specific ISO 8601 `targetTime`.
  - `GET /api/v1/conversations`: Fetches the audit trail and state checkpoints for a specific persistent thread.
  - `POST /api/v1/context/resolve`: Triggers the dry-run Context Compiler without executing an LLM call, returning the raw token-budgeted prompt structure.
- **Interactive Snippet Hydration:** The UI dynamically pre-populates authorization headers (`x-tenant-id`) and variables matching the currently logged-in user's workspace session, ensuring that copied snippets work instantly when pasted into a local terminal.

#### 📖 Step-by-Step UI How-To-Use Guide
1. Click **Endpoints** in the sidebar navigation menu under the *Developer* section.
2. Use the left pane to select the target API route (e.g. `POST /api/v1/schedule_task`).
3. In the center form pane, adjust the request body parameters:
   - Select the target **Agent Blueprint**.
   - Input the **Execution Instructions**.
   - Use the date-picker to set the **Target Execution Time**.
4. Observe the right pane **Code Viewer** updating in real-time.
5. Select your preferred programming language from the top tabs (cURL, JS, Python, Go).
6. Click **Copy Snippet** or click **Execute Request** to fire the payload directly from the browser window and preview the JSON response payload.

#### 💻 Developer API & Code Specifications
**Python (Requests) Implementation Example for Scheduling a Task:**

```python
import requests
import json
from datetime import datetime, timedelta

url = "https://d1ct23sivfa3uv.amplifyapp.com/api/v1/schedule_task"

target_time = (datetime.utcnow() + timedelta(hours=24)).isoformat() + "Z"

payload = json.dumps({
  "agent_id": "profile_crm_specialist",
  "instructions": "Run the daily pipeline hygiene audit. Tag stale leads.",
  "target_time": target_time,
  "edge_policies": {
    "on_failure": "escalate_to_voice_call"
  }
})

headers = {
  'Content-Type': 'application/json',
  'x-tenant-id': 'tenant_enterprise_corp',
  'Authorization': 'Bearer sec_live_981273981273912'
}

response = requests.request("POST", url, headers=headers, data=payload)
print(response.json())
```


### 10. Test Simulator & Time-Travel Sandbox

![Test Simulator](public/docs/images/test_simulator.png)

#### 🎯 Overview & Strategic Purpose
The **Test Simulator** is an isolated developer playground designed specifically to evaluate complex multi-agent graph state transitions, test fallback escalation matrices, and debug BullMQ scheduled tasks safely without mutating production database tables or firing real API requests.

Because the Context Control platform relies heavily on autonomous, delayed background jobs (e.g., executing a billing audit 24 hours from now), waiting for actual time to pass to observe a bug is not feasible. The Simulator solves this with a "Time-Travel" clock overriding architecture, coupled with synthetic fault injection.

#### ⚡ Comprehensive Feature Breakdown & Deep-Dive Architecture
- **Time-Travel Clock Fast-Forwarding:** Developers can input a virtual target time, allowing the simulator engine to immediately flush and execute deferred BullMQ and EventBridge scheduled tasks as if the target date had arrived. This executes the entire LangGraph supervisor-to-worker tree in seconds instead of days.
- **Synthetic Fault Injection & Chaos Testing:** The single biggest risk in autonomous systems is how they handle tool execution failures (e.g., Gmail rate limits, Stripe API timeouts). The Sandbox allows administrators to toggle synthetic failures:
  - Mock `HTTP 429 Too Many Requests` on Gmail spoke calls.
  - Mock `HTTP 500 Internal Server Error` on Salesforce updates.
  By injecting these failures, tenants can verify that their `edgeCasePolicies` successfully catch the error and route the state machine to an escalation edge (such as triggering an ElevenLabs voice call to a human supervisor).
- **Execution Waterfall Tracing:** Once a simulation runs, the UI displays a detailed waterfall trace chart. It visualizes:
  - The node-to-node state transition path (e.g. `supervisor_router` -> `worker_billing` -> `escalation_alert`).
  - Total latency per step and LLM token usage breakdown.
  - The exact payload diffs mutated in the LangGraph state channel at each stage.
- **Isolated Memory Sandbox:** All simulated operations write to an ephemeral, in-memory state dictionary rather than committing persistent records to `public.checkpoints` or `public.ephemeral_context`.

#### 📖 Step-by-Step UI How-To-Use Guide
1. Select **Test Simulator** under the *Developer* section of the sidebar menu.
2. Under the **Scenario Setup** panel, select the target Agent Profile or Team Graph to evaluate.
3. Enter custom task input parameters (e.g., *"Simulate an overnight refund request for Client X"*).
4. **To Inject Faults:**
   - Scroll to the **Chaos Testing & Fault Injection** drawer.
   - Toggle **Simulate Primary Tool Failure**.
   - Select the target tool to fail (e.g. `stripe_issue_refund`) and choose the failure mode (*Timeout*, *Rate Limit*, *Auth Error*).
5. **To Time-Travel:**
   - Under the **Virtual Clock** section, set the simulated execution date to a future timestamp.
6. Click **Run Simulation**.
7. Analyze the output in the **Waterfall Step Inspector**, reviewing the exact prompt tokens used, the error catching mechanism in action, and the final state matrix.

#### 💻 Developer API & Code Specifications
Developers can trigger isolated simulations via the REST API endpoint `/api/v1/simulation`:

```bash
curl -X POST "https://d1ct23sivfa3uv.amplifyapp.com/api/v1/simulation/run" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: tenant_enterprise_corp" \
  -d '{
    "team_blueprint_id": "team_finance_audit",
    "virtual_timestamp": "2026-11-01T12:00:00Z",
    "inject_faults": [
      {
        "tool_name": "stripe_issue_refund",
        "error_code": "rate_limit_exceeded",
        "latency_ms": 3500
      }
    ],
    "initial_state": {
      "input_query": "Process all pending refunds for Q3."
    }
  }'
```

---

### 11. Platform MCP Controller (Stdio/SSE)

![Platform MCP Controller](public/docs/images/platform_mcp.png)

#### 🎯 Overview & Strategic Purpose
The **Platform MCP Controller** flips the standard Hub-and-Spoke model inside out. Rather than the platform connecting outward to third-party tools, the Platform MCP allows external developer environments—such as Claude Desktop, Cursor IDE, Windsurf IDE, and local CLI agents—to connect *inward* to the tenant workspace.

By exposing a standardized Model Context Protocol (MCP 2024-11-05 JSON-RPC 2.0) server endpoint (`/api/mcp/platform`), your local desktop AI assistants instantly gain administrative control over the cloud platform. They can schedule deferred jobs, manage multi-agent topologies, and query secure cloud databases directly from your local IDE prompt.

#### ⚡ Comprehensive Feature Breakdown & Deep-Dive Architecture
- **11 Direct Administrative Controllers:** The server exposes the following highly privileged platform tools:
  1. `create_agent_profile`: Mints a new Team Blueprint in the PostgreSQL profiles store.
  2. `attach_worker_to_profile`: Inserts specialized worker nodes with scoped MCP tool whitelists.
  3. `list_team_blueprints`: Queries all active agent topologies and routing rules.
  4. `schedule_deferred_task`: Pushes an asynchronous background task directly into the BullMQ queue.
  5. `cancel_deferred_task`: Removes a pending execution from the target-time schedule.
  6. `list_scheduled_tasks`: Retrieves active countdowns and queue statuses.
  7. `trigger_task_now`: Fast-forwards and executes a scheduled job immediately.
  8. `inspect_database_schema`: Retrieves live PostgreSQL table definitions and RLS policies.
  9. `query_database_table`: Executes safe read-only SQL commands against the tenant's isolated data rows.
  10. `view_tenant_vault_status`: Audits the health of active encrypted OAuth spoke connections.
  11. `update_tenant_spoke_auth`: Programmatically injects new encrypted tokens into the secure vault.
- **Dual Transport Adapters:** 
  - **SSE (Server-Sent Events) HTTP Transport:** Connects remote web-based clients over persistent HTTP streams.
  - **Stdio Transport:** A lightweight wrapper script allows local desktop apps (like Claude Desktop) to invoke the API over standard input/output pipes.
- **Automated Client Configuration Generator:** Manually mapping MCP server JSON configurations is error-prone. The UI automatically generates copy-and-paste configurations tailored specifically for popular clients (Cursor, Claude Desktop), pre-injected with the tenant's workspace ID and API tokens.

#### 📖 Step-by-Step UI How-To-Use Guide
1. Navigate to **Platform MCP** in the workspace sidebar under the *Developer* section.
2. Select your target client application tab (*Claude Desktop*, *Cursor*, *Windsurf*, or *cURL*).
3. Review the list of the 11 exposed direct controller tools.
4. Click **Copy Config JSON**.
5. Paste the generated configuration snippet into your local client's MCP configuration file:
   - For Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - For Cursor: `.cursor/mcp.json` in your repository root.
6. Restart your client application. You can now type *"Cursor, please schedule a deferred task on the cloud platform to run an audit tomorrow morning"* and the IDE will autonomously invoke the `schedule_deferred_task` tool.

#### 💻 Developer API & Code Specifications
**Generated Cursor IDE Configuration (`.cursor/mcp.json`):**

```json
{
  "mcpServers": {
    "context-control-platform": {
      "command": "node",
      "args": [
        "./node_modules/@modelcontextprotocol/server-platform/dist/index.js",
        "--tenant-id=tenant_enterprise_corp",
        "--api-key=sec_live_981273981273912"
      ]
    }
  }
}
```

---

### 12. API Keys & BYOK Security Vault

![API Keys & Security](public/docs/images/api_keys.png)

#### 🎯 Overview & Strategic Purpose
The **API Keys & BYOK (Bring Your Own Key) Security Vault** forms the cryptographic foundation of the platform's multi-tenant architecture. In an environment where autonomous agents act on behalf of enterprise organizations, credential leakage or cross-tenant data exposure represents an existential threat.

This module guarantees that all API tokens, database connection strings, and third-party OAuth credentials are encrypted at rest using military-grade AES-256-GCM authenticated encryption. Furthermore, it enforces hardware-level data isolation using PostgreSQL Row-Level Security (RLS), ensuring that even if an agent prompt goes rogue, it is physically impossible to query data belonging to another tenant.

#### ⚡ Comprehensive Feature Breakdown & Deep-Dive Architecture
- **AES-256-GCM Vault Encryption:** When a tenant enters an API key for a tool spoke (e.g., a Salesforce API key), the frontend sends it securely to the vault manager. The vault manager encrypts the plaintext using the `pgcrypto` extension and a master encryption key, storing only the encrypted ciphertext (`encrypted_access_token`) and a hashed `key_fingerprint`. Plaintext tokens are strictly scrubbed from LLM context windows and application logs.
- **Hardware-Level Row-Level Security (RLS):** Every table in the database (`tenants`, `tenant_vault`, `profiles`, `profile_workers`, `thread_instances`, `memory_store`, `checkpoints`, `ephemeral_context`) implements restrictive RLS policies. When a request hits the platform API, the server sets a local Postgres configuration parameter:
  ```sql
  SET LOCAL app.current_tenant_id = 'tenant_123';
  ```
  The database engine natively filters all `SELECT`, `INSERT`, `UPDATE`, and `DELETE` operations where `tenant_id != app.current_tenant_id`, guaranteeing absolute data isolation.
- **Short-Lived Client Token Minter:** To embed secure chat agent widgets into external websites (like a customer support portal), tenants cannot use their master API keys. The vault provides a short-lived token minter that generates HMAC-SHA256 signed JSON Web Tokens (JWTs) with granular scope restrictions and tight expiration windows (Time-To-Live).
- **Key Rotation & Auditing:** Provides full auditability of active keys, expiration timestamps, and rotation protocols.

#### 📖 Step-by-Step UI How-To-Use Guide
1. Navigate to **API Keys & Security Vault** under the *Workspace Settings* menu.
2. **To Manage the BYOK Vault:**
   - Review the list of active encrypted provider connections (e.g. Gmail OAuth, Stripe API).
   - Click the key fingerprint to view connection health and expiration timestamps.
   - Click **Rotate Credential** to securely override an existing token with a new key.
3. **To Generate Workspace API Keys:**
   - Click **Generate New API Key** in the API Access panel.
   - Assign a descriptive name (e.g., *CI/CD Pipeline Key*, *Local Cursor IDE Key*).
   - Select the desired permission scopes (*Read-Only*, *Task Scheduling*, *Full Admin*).
   - Copy the plaintext API key. (Note: This key will only be displayed once; if lost, it must be revoked and regenerated).
4. **To Mint a Short-Lived Client Token:**
   - Open the **Client Token Minter** drawer.
   - Specify the target agent profile ID and set the TTL (e.g., `3600` seconds / 1 hour).
   - Click **Mint Token** and copy the resulting JWT to embed in your external web application frontend.

#### 💻 Developer API & Code Specifications
**PostgreSQL RLS Policy Enforcement Example (`Backend/schema.sql`):**

```sql
-- Vault Policy (Zero-leakage enforcement)
ALTER TABLE public.tenant_vault ENABLE ROW LEVEL SECURITY;

CREATE POLICY vault_isolation_policy ON public.tenant_vault
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
```

---

## 🏗️ Managed Technical Infrastructure (Under the Hood)

While all daily operations are managed seamlessly through the UI workspace, the platform is backed by enterprise-grade cloud infrastructure:

- **Next.js 15 Full-Stack UI & API:** React 19 full-stack application layer deployed on AWS.
- **BullMQ & Redis Queue:** Durable background task queue engine handling delayed jobs and crash recovery journals.
- **AWS EventBridge Scheduler:** Serverless target-time trigger engine with automatic single-use schedule cleanup.
- **Supabase PostgreSQL & `pgvector`:** Durable state checkpointing (`PostgresSaver`) and vector memory store with hardware-level RLS policies.
- **ElevenLabs & Twilio Telephony:** Low-latency conversational voice synthesis engine integrated with direct PSTN phone call dispatch.

---

## 📜 License

Distributed under the MIT License.
