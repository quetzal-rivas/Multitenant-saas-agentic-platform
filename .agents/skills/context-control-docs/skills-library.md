Source: app/docs/page.tsx (route: /docs?section=skills-library)

MCP Tools & Integrations · Section 09
# Skills Library Registry
Manage modular agent skills, domain-specific instructions, and specialized automation kits.
UI Screenshot Preview
### 1. Overview & Strategic Purpose
The **Skills Library** shifts autonomous agents from generalized chat assistants into highly specialized operational workers. While tools provide the "hands" to perform actions (like sending an email), **Skills** provide the "brain" (the multi-step heuristic instructions on *when* and *how* to use those tools).
By packaging complex standard operating procedures (SOPs) into modular `SKILL.md` markdown files, tenants can instantly upgrade agent capabilities. Instead of writing massive, fragile system prompts, administrators can dynamically toggle discrete skills on or off depending on the agent's assigned role in the team graph.
### 2. Key Capabilities & Architecture
* **`SKILL.md` Markdown Packaging:** Skills are defined using a structured Markdown syntax combining YAML frontmatter metadata and descriptive instruction blocks. This ensures skills are machine-readable and human-auditable.
* **Dynamic Context Injection:** The context compiler monitors the incoming user query against the `triggers` defined in the active agent's bound skills. If a trigger matches, the compiler dynamically injects that specific skill's instructions into the priority prompt context.
* **Pre-Built Enterprise Catalog:** The registry includes a curated catalog of standard skills ready for one-click deployment, such as CRM Lead Enrichment pipelines and PostgreSQL Performance Tuning heuristics.
### 3. Step-by-Step UI How-To-Use Guide
* Navigate to **Library** under the *Workspace* section.
* Browse the grid of available skill packages.
* **To Enable a Skill for an Agent:** Open the **Agent Studio** or **Team Builder**, scroll to **Bound Skills**, and select the desired skill from the dropdown menu to bind it to the agent's profile.
* **To Upload a Custom Skill (`SKILL.md`):** Click **Upload Custom Skill**, drag and drop your `.md` file containing the valid YAML frontmatter block, and the platform will parse and validate it.