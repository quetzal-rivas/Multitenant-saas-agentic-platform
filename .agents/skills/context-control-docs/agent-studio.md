Source: app/docs/page.tsx (route: /docs?section=agent-studio)

Autonomous Agent Workspace · Section 01
# Agent Session Studio (Single Agent)
Interactive operational studio for creating, testing, and conversing with single autonomous agents in real-time.
{/* Embedded UI Screenshot */}
UI Screenshot Preview
### 1. Overview & Strategic Purpose
The **Agent Session Studio** serves as the primary real-time operational interface for single autonomous agents. It bridges high-level tenant prompt inputs with dynamic LLM reasoning, live tool call execution, and token-budgeted context resolution. Rather than relying on simple stateless chat widgets, the Agent Studio provides full visibility into the agent's internal thought process, active context profile parameters, and intermediate tool execution outputs.
### 2. Key Capabilities & Architecture
* **Real-Time Thought & Tool Execution Streaming:** As the agent evaluates user instructions, every intermediate reasoning step, JSON schema validation, and tool call payload is streamed live to the UI interface. Tenants can expand individual execution cards to inspect raw tool arguments (e.g. searching Gmail threads or querying CRM databases) and response status codes.
* **Dynamic Context Profile Toggling:** Tenants can dynamically select pre-configured Context Profiles from a header dropdown. Switching profiles instantly updates the agent's core system instructions, tenant brand voice, customer loyalty tier rules, and token allocation limits without restarting the chat session.
* **System Instruction Overrides:** Offers an inline developer drawer allowing tenants to inject temporary system instruction overrides on the fly. This enables testing specific edge-case prompts, tone adjustments, or constraint guardrails before committing them to a production profile blueprint.
* **Persistent State Checkpointing:** Every message, thought step, and tool call result is serialized into binary checkpoints stored in Supabase PostgreSQL (`public.checkpoints`). Sessions can be paused, resumed, or audited at any time with guaranteed state continuity.
* **Token Budget Monitoring:** Real-time token usage meter displays prompt tokens, completion tokens, and context window utilization, preventing unexpected API cost spikes.
### 3. Step-by-Step UI How-To-Use Guide
* Select **Agent Studio** from the left navigation menu under the *Workspace* section.
* In the top bar header, click the **Context Profile** dropdown selector to choose an active agent profile (e.g., *Customer Support Lead*, *Sales Outbound Representative*, or *Technical Auditor*).
* Type your operational instructions into the prompt input drawer at the bottom of the studio screen and press **Send** or `Enter`.
* Observe the live execution waterfall:
* Green accordion headers indicate successful tool calls (e.g. `gmail_fetch_threads`).
* Yellow headers highlight pending or executing actions.
* Red headers indicate caught errors or fallback triggers.
* Click on any tool call accordion card to view raw JSON parameters, response headers, and latency metrics.
* To test custom instructions, click **System Overrides**, modify the system prompt text, and submit a new message turn.