import os
import re

def clean_html(text):
    # Handle bold tags
    text = re.sub(r'<strong[^>]*>', '**', text)
    text = re.sub(r'</strong>', '**', text)
    
    # Handle spans and divs (just remove tags, keep inner text)
    text = re.sub(r'<span[^>]*>', '', text)
    text = re.sub(r'</span>', '', text)
    text = re.sub(r'<div[^>]*>', '\n', text)
    text = re.sub(r'</div>', '\n', text)
    
    # Handle links
    text = re.sub(r'<a href="([^"]+)"[^>]*>(.*?)</a>', r'[\2](\1)', text)
    text = re.sub(r'<Link href="([^"]+)"[^>]*>(.*?)</Link>', r'[\2](\1)', text)
    
    # Code blocks
    # E.g. <pre className="..."><code>...</code></pre>
    text = re.sub(r'<pre[^>]*>\s*<code[^>]*>(.*?)</code>\s*</pre>', r'```\n\1\n```', text, flags=re.DOTALL)
    text = re.sub(r'<code[^>]*>(.*?)</code>', r'`\1`', text)
    
    # Lists
    text = re.sub(r'<ul[^>]*>', '\n', text)
    text = re.sub(r'</ul>', '\n', text)
    text = re.sub(r'<li[^>]*>', '* ', text)
    text = re.sub(r'</li>', '\n', text)
    
    # Headers
    text = re.sub(r'<h1[^>]*>(.*?)</h1>', r'# \1\n', text)
    text = re.sub(r'<h2[^>]*>(.*?)</h2>', r'## \1\n', text)
    text = re.sub(r'<h3[^>]*>(.*?)</h3>', r'### \1\n', text)
    
    # Paragraphs
    text = re.sub(r'<p[^>]*>(.*?)</p>', r'\n\1\n', text, flags=re.DOTALL)
    
    # Remove any remaining tags like <Bot /> or <PhoneCall />
    text = re.sub(r'<[A-Za-z0-9]+[^>]*/>', '', text)
    
    # Remove remaining open/close tags (rudimentary)
    text = re.sub(r'<[^>]+>', '', text)
    
    # Unescape common entities
    text = text.replace('&nbsp;', ' ')
    text = text.replace('&amp;', '&')
    text = text.replace('&lt;', '<')
    text = text.replace('&gt;', '>')
    text = text.replace('&quot;', '"')
    
    # Handle JS expressions roughly
    text = re.sub(r'\{\s*`([^`]+)`\s*\}', r'\1', text)
    
    # Clean up empty lines
    lines = [line.strip() for line in text.split('\n')]
    return '\n'.join(line for line in lines if line)

def parse_docs():
    with open('app/docs/page.tsx', 'r') as f:
        content = f.read()
    
    # Split into components
    components = re.findall(r'function (Doc[A-Za-z0-9_]+)\([^)]*\)\s*{(.*?)\n}\n\n', content + '\n\n', re.DOTALL)
    
    if not components:
        components = re.findall(r'function (Doc[A-Za-z0-9_]+)\([^)]*\)\s*{(.*?)\n}(?=\nfunction |\Z)', content, re.DOTALL)

    skill_dir = '.agents/skills/context-control-docs'
    os.makedirs(skill_dir, exist_ok=True)
    
    routes = []
    
    # We also need a mapping from component name to ID if possible
    id_map = {
        'DocTenantOverview': 'overview',
        'DocAgentStudio': 'agent-studio',
        'DocTeamBuilder': 'team-builder',
        'DocConversations': 'conversations',
        'DocVoiceAgent': 'voice-agent',
        'DocTaskCalendar': 'task-calendar',
        'DocContextProfiles': 'context-profiles',
        'DocKnowledgeSources': 'knowledge-sources',
        'DocMcpHub': 'mcp-hub',
        'DocSkillsLibrary': 'skills-library',
        'DocEndpointsApi': 'endpoints-api',
        'DocTestSimulator': 'test-simulator',
        'DocPlatformMcp': 'platform-mcp',
        'DocSecurityVault': 'security-vault'
    }
    
    index_lines = ["# Documentation Index\n"]
    
    for comp_name, comp_body in components:
        if comp_name == 'DocumentationPage':
            continue
            
        section_id = id_map.get(comp_name, comp_name.lower())
        
        # Extract return statement
        return_match = re.search(r'return\s*\((.*?)\);?\s*$', comp_body, re.DOTALL)
        if return_match:
            jsx = return_match.group(1)
        else:
            jsx = comp_body
            
        md_text = clean_html(jsx)
        
        # Determine title from the first header
        title_match = re.search(r'# (.*)', md_text)
        title = title_match.group(1) if title_match else comp_name
        
        filename = f"{section_id}.md"
        filepath = os.path.join(skill_dir, filename)
        
        with open(filepath, 'w') as f:
            f.write(f"Source: app/docs/page.tsx (route: /docs?section={section_id})\n\n")
            f.write(md_text)
            
        routes.append({'topic': title, 'id': section_id, 'file': filename})
        index_lines.append(f"- **{title}**: [`{filename}`]({filename}) (route: /docs?section={section_id})")
        
    with open(os.path.join(skill_dir, 'index.md'), 'w') as f:
        f.write('\n'.join(index_lines))
        
    # Write SKILL.md
    skill_content = f"""---
name: context-control-docs
description: Use when the user asks about Context Control setup, AI agents, MCP, telephony, API, deployment, or configuration.
---

# Context Control documentation

Snapshot of the docs generated from app/docs/page.tsx. Live site: /docs

## How to use
Read only the file that matches the question. Cite the `Source:` route when answering. If nothing matches, read `index.md`, then search this folder for keywords before saying the docs do not cover it.

## Routing
| Question is about | Read |
|---|---|
"""
    for r in routes:
        skill_content += f"| {r['topic']} | {r['file']} |\n"
        
    skill_content += """
## Freshness
This is a copy. If the answer could depend on recent changes, say the docs snapshot may be out of date and point to the live page.
"""
    with open(os.path.join(skill_dir, 'SKILL.md'), 'w') as f:
        f.write(skill_content)
        
    print(f"Extracted {len(routes)} topics.")

if __name__ == '__main__':
    parse_docs()
