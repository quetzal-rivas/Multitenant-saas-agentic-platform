import re

with open('app/docs/page.tsx', 'r') as f:
    content = f.read()

# Add Supervisor Board
content = content.replace(
    "{ id: 'team-builder', label: 'Team Builder (Multi-Agent Graphs)' },",
    "{ id: 'team-builder', label: 'Team Builder (Multi-Agent Graphs)' },\n        { id: 'supervisor-board', label: 'Supervisor Board (Agent Orchestration)' },"
)

# Add Function Studio
content = content.replace(
    "{ id: 'skills-library', label: 'Skills Library Registry' },",
    "{ id: 'skills-library', label: 'Skills Library Registry' },\n        { id: 'function-studio', label: 'Function Studio (Serverless Lambda Tools)' },"
)

# Add the render switch cases
switch_pattern = r'\{activeSection === \'team-builder\' && <DocTeamBuilder />\}'
switch_repl = "{activeSection === 'team-builder' && <DocTeamBuilder />}\n                  {activeSection === 'supervisor-board' && <DocSupervisorBoard />}"
content = content.replace(switch_pattern, switch_repl)

switch_pattern2 = r'\{activeSection === \'skills-library\' && <DocSkillsLibrary />\}'
switch_repl2 = "{activeSection === 'skills-library' && <DocSkillsLibrary />}\n                  {activeSection === 'function-studio' && <DocFunctionStudio />}"
content = content.replace(switch_pattern2, switch_repl2)

with open('app/docs/page.tsx', 'w') as f:
    f.write(content)
