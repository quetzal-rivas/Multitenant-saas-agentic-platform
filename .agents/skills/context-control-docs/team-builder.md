Source: app/docs/page.tsx (route: /docs?section=team-builder)

Autonomous Agent Workspace · Section 02
# Team Builder (Multi-Agent Supervisor Graphs)
Visual team builder for constructing hierarchical multi-agent graphs with supervisor delegation and worker node scoping.
UI Screenshot Preview
### 1. Overview & Strategic Purpose
The **Team Builder** allows tenants to construct collaborative multi-agent teams using hierarchical supervisor topologies. Complex business workflows often exceed the capabilities of a single monolithic agent persona. The Team Builder solves this by establishing a central **Supervisor Agent** that acts as an intelligent router, decomposing incoming multi-step tasks and delegating sub-tasks to specialized worker agents (e.g. *Research Specialist*, *Copywriter*, *Billing Auditor*, *Incident Dispatcher*).
### 2. Key Capabilities & Architecture
* **Hierarchical Routing Topologies:** Incorporates LangGraph-style state machine routing patterns (`supervisor_router`, `sequential_pipeline`, `consensus`). The supervisor agent evaluates incoming user turns and routes control to worker nodes based on their assigned operational roles and tool whitelists.
* **Specialized Worker Node Assignment:** Tenants can create and attach an unlimited number of worker nodes to a team blueprint. Each worker node receives dedicated system instructions, an avatar icon, and a strictly scoped whitelist of allowed MCP tools (e.g. restricting a Billing Clerk to Stripe tools while granting a Copywriter access to Gmail and Slack).
* **Conditional Fallback & Escalation Matrix:** Every team blueprint incorporates an automated fallback policy matrix (`edgeCasePolicies`). If a primary worker's tool action fails (such as an email delivery bounce or CRM API rate limit), the state graph automatically traverses conditional edges to trigger high-priority fallback actions, including automated ElevenLabs Voice Calls or Slack emergency alerts.
* **Visual Topology Tree:** Interactive canvas displays the team structure, routing strategies, active worker nodes, allocated MCP tools, and assigned capability skills.
### 3. Step-by-Step UI How-To-Use Guide
* Open **Team Builder** from the sidebar menu.
* Click **Create New Team** or click an existing blueprint card (e.g. *Front Desk Automation Team*, *Night Audit Team*).
* In the team configuration modal:
* Enter the **Team Name** and select the **Routing Strategy** (*Supervisor Router*, *Sequential Pipeline*, or *Consensus*).
* Write the **Supervisor Prompt** specifying corporate routing rules (e.g., *"Route billing and invoice inquiries to the Billing Clerk; route technical bugs to the Database Auditor"*).
* Click **Add Worker Node** to attach specialist agents:
* Specify the **Worker Name** (e.g., *CRM Specialist*) and **Role** (e.g., *Lead Enrichment*).
* Input dedicated **System Instructions** for the worker.
* Select whitelisted **MCP Tools** from the tool selector drawer (e.g. `crm.add_lead`, `slack_post_message`).
* Click **Deploy Team Graph** to make the multi-agent team blueprint available for live studio sessions, API endpoints, and scheduled deferred calendar tasks.