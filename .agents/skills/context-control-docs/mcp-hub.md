Source: app/docs/page.tsx (route: /docs?section=mcp-hub)

MCP Tools & Integrations · Section 08
# MCP Hub & Tools Protocol (Hub-and-Spoke)
Connect pre-built MCP spokes (Gmail, Slack, Google Calendar, Cloudflare, Supabase) and custom tool servers securely.
UI Screenshot Preview
### 1. Overview & Strategic Purpose
The **MCP Hub** acts as the secure, high-performance nerve center for all external tool connections. By adopting the open standard **Model Context Protocol (MCP 2024-11-05 JSON-RPC 2.0)**, the platform establishes a decentralized Hub-and-Spoke architecture. This allows agents to interact with external enterprise systems without needing hardcoded REST API integrations for every service.
Crucially, the MCP Hub solves the "Zero-Trust Agent Tooling" problem. Instead of injecting raw API keys into the LLM's system prompt (which risks catastrophic credential leakage during prompt injection attacks), all API keys remain encrypted inside the `public.tenant_vault`. The MCP Gateway proxy intercepts tool calls, injects the decrypted credentials on the server side, executes the action against the spoke, and returns only the sanitized result back to the agent's context window.
### 2. Key Capabilities & Architecture
* **Zero Credential Exposure (AES-256-GCM Vault):** API keys, OAuth2 refresh tokens, and JWT secrets are stored in the PostgreSQL `public.tenant_vault` table using AES-256-GCM authenticated encryption. The LLM never sees these tokens.
* **Pre-Authenticated Enterprise Spokes:** The Hub includes a library of out-of-the-box, one-click enterprise spokes configured to execute standard operational playbooks (e.g., Google Workspace for Gmail, Slack Communications, Google Calendar, Cloudflare).
* **Custom MCP Transports (Stdio & SSE):** Beyond pre-built spokes, tenants can connect their own custom tool servers using standardized transports (Stdio or SSE).
* **Strict JSON Schema Validation:** Every tool registered in the Hub provides a rigid JSON Schema definition for its parameters. The compiler validates LLM tool outputs against this schema before execution.
### 3. Step-by-Step UI How-To-Use Guide
* Select **MCP Hub & Tools** from the sidebar menu under *Workspace*.
* Browse the grid of available tool spokes.
* **To Activate a Pre-Built Spoke (e.g. Gmail):** Click the toggle switch, click **Configure Credentials** to open the secure BYOK drawer, paste your API Key, and click **Test Tool Connection**.
* **To Register a Custom MCP Server:** Click **Add Custom MCP Server**, define the **Server Name** and **Transport Protocol** (Stdio or SSE), and save the configuration.