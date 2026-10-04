Source: app/docs/page.tsx (route: /docs?section=platform-mcp)

Developer API & Testing Tools · Section 12
# Platform MCP Controller (Stdio/SSE)
Connect external host applications (Claude Desktop, Cursor, local IDEs) to your tenant workspace via MCP.
UI Screenshot Preview
### 1. Overview & Strategic Purpose
The **Platform MCP Controller** flips the standard Hub-and-Spoke model inside out. Rather than the platform connecting outward to third-party tools, the Platform MCP allows external developer environments—such as Claude Desktop, Cursor IDE, Windsurf IDE, and local CLI agents—to connect *inward* to the tenant workspace.
By exposing a standardized Model Context Protocol (MCP 2024-11-05 JSON-RPC 2.0) server endpoint (`/api/mcp/platform`), your local desktop AI assistants instantly gain administrative control over the cloud platform. They can schedule deferred jobs, manage multi-agent topologies, and query secure cloud databases directly from your local IDE prompt.
### 2. Key Capabilities & Architecture
* **11 Direct Administrative Controllers:** Exposes highly privileged tools including `create_agent_profile`, `contextcontrol_schedule_task`, `trigger_task_now`, and `inspect_database_schema`.
* **Dual Transport Adapters:** Connect over persistent HTTP streams (SSE) or a lightweight Stdio wrapper script for local desktop apps.
* **Automated Client Configuration Generator:** The UI automatically generates copy-and-paste JSON configurations tailored specifically for popular clients (Cursor, Claude Desktop), pre-injected with the tenant's workspace ID and API tokens.
### 3. Step-by-Step UI How-To-Use Guide
* Navigate to **Platform MCP** in the workspace sidebar under the *Developer* section.
* Select your target client application tab (*Claude Desktop*, *Cursor*, *Windsurf*, or *cURL*).
* Review the list of the 11 exposed direct controller tools.
* Click **Copy Config JSON**.
* Paste the generated configuration snippet into your local client's MCP configuration file (e.g., `.cursor/mcp.json` in your repository root).
* Restart your client application and begin controlling the cloud platform from your IDE.