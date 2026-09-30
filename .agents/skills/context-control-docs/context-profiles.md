Source: app/docs/page.tsx (route: /docs?section=context-profiles)

Context & Knowledge Engine · Section 06
# Context Profiles & Token Budgeting
Manage system instruction profiles, tenant brand voice, customer loyalty rules, and token budget policies.
UI Screenshot Preview
### 1. Overview & Strategic Purpose
In modern enterprise LLM architectures, unmanaged prompt context leads directly to context window drift, non-deterministic model behavior, severe hallucination, and escalating API infrastructure costs. The **Context Profiles Engine** serves as a deterministic context compiler (`compileContext`) designed to solve these challenges. It standardizes system prompts, corporate brand voice, customer loyalty rules, working memory, and vector RAG fragments into tight, token-budgeted prompt payloads.
By establishing strict Context Profiles, tenant organizations can guarantee that their AI agents remain compliant with corporate brand guidelines, legal policies, and token allocation limits across every interaction channel—whether serving live customer support chats, executing background BullMQ tasks, or answering voice calls over PSTN phone lines.
### 2. Key Capabilities & Architecture
* **Deterministic Context Compilation Pipeline:** The compiler evaluates and sequences context sources based on tenant-configured priority weights (e.g., `system_instructions` Priority 100, `agent_instructions` Priority 90, `tenant_context` Priority 85).
* **Priority-Based Token Trimming Algorithm:** Standard token counters truncate messages arbitrarily. The platform's compiler utilizes a priority-aware trimming algorithm (`estimateTokens` based on 3.8 chars/token). If total tokens exceed `maxTokensBudget`, lower-priority steps are progressively truncated while high-priority system instructions remain pristine.
* **Contract Validation Matrix:** Profiles specify a data contract (`profile.contract.required`) enforcing required identity and input parameters (e.g., `tenant_id`, `user_id`, `query`). Missing parameters trigger validation failures in the resolution metadata, preventing incomplete context execution.
* **Tenant Brand Voice & Policy Injection:** Automatically injects tenant-specific corporate brand voice directives directly into system instructions, standardizing tone across all communication channels.
### 3. Step-by-Step UI How-To-Use Guide
* Navigate to **Profiles** from the workspace sidebar menu under the *Workspace* section.
* Click **Create Profile** or select an existing blueprint (e.g., *Customer Support Lead*).
* In the **System Prompt Instructions** field, define core agent behavior and operational guardrails.
* Specify **Brand Voice & Tone** guidelines and define the **Max Token Budget** (e.g., `8192` tokens).
* Configure **Pipeline Step Priorities** by adjusting priority sliders for System Instructions, Knowledge Base RAG, User Identity, and Conversation History.
* Click the **Live Compiler Sandbox** drawer to test token trimming with sample input data.