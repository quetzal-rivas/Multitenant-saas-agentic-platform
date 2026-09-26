import { SkillItem, SkillCategory, SkillSource } from './types';

/**
 * Platform & Community Skills Registry
 * Model Context Protocol (MCP) & Context Control Agent Skills
 */

const INITIAL_SKILLS: SkillItem[] = [
  // ==========================================
  // PLATFORM OFFICIAL SKILLS (High Precision)
  // ==========================================
  {
    id: 'skill-context-guard',
    name: 'Context Token Budget Guard',
    slug: 'context-budget-guard',
    category: 'context',
    source: 'platform',
    author: {
      name: 'Context Control Core',
      handle: 'context-control',
      verified: true,
    },
    version: '2.4.0',
    tags: ['token-optimization', 'budget', 'latency', 'caching'],
    tokenEstimate: 140,
    description: 'Ensures tools and context injections never overflow LLM window limits, automatically optimizing token density.',
    systemPromptAddendum: `## Context Token Budget Directive
- Monitor incoming token budget. If output payload exceeds allotted window, synthesize and compress tabular or repetitive data.
- Prioritize high-entropy context over boilerplate metadata.
- When summarizing tool results, retain exact identifiers, IDs, and numeric metrics while truncating descriptive filler.`,
    downloads: 14200,
    rating: 4.95,
    stars: 320,
    isInLibrary: true,
    isEnabled: true,
    compatibility: ['Claude 3.7', 'GPT-4o', 'Gemini 2.5/3.5', 'Cursor'],
    createdAt: '2026-08-15T00:00:00Z',
    updatedAt: '2026-09-20T12:00:00Z',
  },
  {
    id: 'skill-safe-execution',
    name: 'Safe Tool Execution Policy',
    slug: 'safe-tool-policy',
    category: 'security',
    source: 'platform',
    author: {
      name: 'Security Ops Team',
      handle: 'secops',
      verified: true,
    },
    version: '1.8.2',
    tags: ['guardrail', 'side-effects', 'safety', 'human-in-the-loop'],
    tokenEstimate: 165,
    description: 'Demands explicit human verification and impact preview before executing irreversible mutations across third-party tools.',
    systemPromptAddendum: `## Safe Tool Execution & Confirmation Policy
- CRITICAL: Any tool invocation that creates, modifies, or deletes external state (e.g. database DROP/UPDATE, GitHub repository commit/merge, email sending, message broadcasting) MUST declare estimated impact.
- Present the target resource, parameters, and irreversible consequences clearly to the user before running side-effecting operations.`,
    downloads: 9800,
    rating: 4.98,
    stars: 410,
    isInLibrary: true,
    isEnabled: true,
    compatibility: ['Claude 3.7', 'GPT-4o', 'Gemini 2.5/3.5', 'Cursor'],
    createdAt: '2026-08-20T00:00:00Z',
    updatedAt: '2026-09-18T10:00:00Z',
  },
  {
    id: 'skill-crm-enrichment',
    name: 'Enterprise CRM Data Grounding',
    slug: 'crm-enrichment',
    category: 'enterprise',
    source: 'platform',
    author: {
      name: 'Enterprise Architecture',
      handle: 'enterprise-core',
      verified: true,
    },
    version: '2.1.0',
    tags: ['crm', 'sla', 'multi-tenant', 'contracts'],
    tokenEstimate: 190,
    description: 'Automatically enriches company profiles, tenant SLAs, and user subscription tiers alongside tool calls.',
    systemPromptAddendum: `## Enterprise Tenant Grounding Directive
- Always inspect the resolved tenant contract tier (e.g., Enterprise SLA 99.99%, Startup, Free) when formulating answers.
- Tailor support tone and response urgency according to the contract's defined escalation matrix.
- Quote verified contract entitlement terms when customer queries touch on billing or feature access.`,
    downloads: 6400,
    rating: 4.88,
    stars: 185,
    isInLibrary: true,
    isEnabled: true,
    compatibility: ['Claude 3.7', 'GPT-4o', 'Gemini 2.5/3.5'],
    createdAt: '2026-08-22T00:00:00Z',
    updatedAt: '2026-09-15T08:00:00Z',
  },
  {
    id: 'skill-git-code-analysis',
    name: 'Architectural Code Inspector',
    slug: 'git-code-inspector',
    category: 'coding',
    source: 'platform',
    author: {
      name: 'Developer Experience',
      handle: 'devex',
      verified: true,
    },
    version: '3.0.1',
    tags: ['ast', 'code-review', 'typescript', 'architecture'],
    tokenEstimate: 210,
    description: 'Inspects AST structures, file-relative paths, and repo conventions before proposing code or reviewing PRs.',
    systemPromptAddendum: `## Architectural Code Quality Directive
- When suggesting code alterations, specify target file paths relative to the project root.
- Ensure strict TypeScript typing without using fallback 'any'.
- Preserve existing coding conventions, indentations, and naming patterns.
- Do not introduce unrequested external dependencies or mutate configuration scripts unexpectedly.`,
    requiredTools: ['github_search_code', 'github_get_pull_request'],
    downloads: 12100,
    rating: 4.96,
    stars: 520,
    isInLibrary: false,
    isEnabled: false,
    compatibility: ['Claude 3.7', 'GPT-4o', 'Gemini 2.5/3.5', 'Cursor'],
    createdAt: '2026-08-10T00:00:00Z',
    updatedAt: '2026-09-19T14:00:00Z',
  },
  {
    id: 'skill-pii-redactor',
    name: 'PII & Credential Sanitizer',
    slug: 'pii-sanitizer',
    category: 'security',
    source: 'platform',
    author: {
      name: 'Security Ops Team',
      handle: 'secops',
      verified: true,
    },
    version: '1.5.0',
    tags: ['privacy', 'gdpr', 'pii-masking', 'credentials'],
    tokenEstimate: 175,
    description: 'Intercepts prompt and tool outputs to mask passwords, private keys, credit cards, and personal contact identifiers.',
    systemPromptAddendum: `## PII & Credential Sanitization
- Never output raw API secrets, private keys, SSH tokens, passwords, or credit card numbers in responses.
- Replace detected sensitive data with masked placeholders like [REDACTED_API_KEY] or [CUSTOMER_SSN_HASHED].
- Warn the user if they inadvertently submit raw credentials in their prompt.`,
    downloads: 8700,
    rating: 4.94,
    stars: 290,
    isInLibrary: false,
    isEnabled: false,
    compatibility: ['Claude 3.7', 'GPT-4o', 'Gemini 2.5/3.5', 'Cursor'],
    createdAt: '2026-08-25T00:00:00Z',
    updatedAt: '2026-09-12T16:00:00Z',
  },
  {
    id: 'skill-sql-guardrail',
    name: 'PostgreSQL Read Guard & Optimizer',
    slug: 'sql-read-guard',
    category: 'data',
    source: 'platform',
    author: {
      name: 'Data Platform',
      handle: 'datateam',
      verified: true,
    },
    version: '2.0.4',
    tags: ['sql', 'postgres', 'read-only', 'query-optimization'],
    tokenEstimate: 195,
    description: 'Enforces strictly read-only SELECT clauses, automatic pagination limits, and index alignment on database queries.',
    systemPromptAddendum: `## Database Query Safety Directives
- Formulate SELECT queries ONLY. Never generate ALTER, DROP, DELETE, TRUNCATE, or UPDATE queries unless user has administrative role explicitly unlocked.
- Always append a sensible LIMIT (default: 50, maximum: 500) and avoid unbounded Cartesian joins.
- Use explicit column names instead of SELECT * where schema information is known.`,
    requiredTools: ['postgres_execute_read_query', 'postgres_describe_table'],
    downloads: 7300,
    rating: 4.91,
    stars: 215,
    isInLibrary: false,
    isEnabled: false,
    compatibility: ['Claude 3.7', 'GPT-4o', 'Gemini 2.5/3.5'],
    createdAt: '2026-08-28T00:00:00Z',
    updatedAt: '2026-09-17T11:00:00Z',
  },
  {
    id: 'skill-tree-of-thought',
    name: 'Tree-of-Thought Deep Problem Solver',
    slug: 'tree-of-thought',
    category: 'reasoning',
    source: 'platform',
    author: {
      name: 'Context Control Core',
      handle: 'context-control',
      verified: true,
    },
    version: '1.2.0',
    tags: ['reasoning', 'deliberation', 'algorithms', 'planning'],
    tokenEstimate: 230,
    description: 'Guides the model through hypothesis generation, multi-path tree branching, and pruning to solve high-complexity edge cases.',
    systemPromptAddendum: `## Tree-of-Thought Deliberation Strategy
- For complex ambiguous problems, mentally explore 2 to 3 distinct architectural hypotheses.
- Explicitly rate the trade-offs (scalability, failure modes, complexity) of each approach.
- State why the selected path dominates alternative branches before presenting the implementation.`,
    downloads: 11200,
    rating: 4.97,
    stars: 480,
    isInLibrary: false,
    isEnabled: false,
    compatibility: ['Claude 3.7', 'GPT-4o', 'Gemini 2.5/3.5'],
    createdAt: '2026-08-30T00:00:00Z',
    updatedAt: '2026-09-14T09:00:00Z',
  },
  {
    id: 'skill-json-enforcer',
    name: 'Strict Schema JSON Enforcer',
    slug: 'json-schema-enforcer',
    category: 'coding',
    source: 'platform',
    author: {
      name: 'Developer Experience',
      handle: 'devex',
      verified: true,
    },
    version: '1.4.1',
    tags: ['json', 'structured-output', 'schema-validation', 'api'],
    tokenEstimate: 130,
    description: 'Forces tool or agent responses to strictly output valid JSON adhering to given schemas, omitting conversational prose.',
    systemPromptAddendum: `## Pure JSON Output Enforcer
- When instructed to provide structured output, return valid RFC 8259 JSON ONLY.
- Do NOT wrap response in markdown backticks (\`\`\`json) if raw parse is requested.
- Ensure all required keys are present and types strictly conform to the declared contract.`,
    downloads: 15600,
    rating: 4.99,
    stars: 610,
    isInLibrary: true,
    isEnabled: true,
    compatibility: ['Claude 3.7', 'GPT-4o', 'Gemini 2.5/3.5', 'Cursor'],
    createdAt: '2026-08-12T00:00:00Z',
    updatedAt: '2026-09-20T17:00:00Z',
  },

  // ==========================================
  // COMMUNITY VERIFIED SKILLS
  // ==========================================
  {
    id: 'comm-github-pr-sentinel',
    name: 'GitHub PR Review Sentinel',
    slug: 'github-pr-sentinel',
    category: 'coding',
    source: 'community',
    author: {
      name: 'OctoAgent Labs',
      handle: 'octo_agent',
      verified: true,
    },
    version: '2.1.4',
    tags: ['github', 'pull-request', 'code-review', 'ci-cd'],
    tokenEstimate: 240,
    description: 'Automated PR reviewer inspecting diff changes, test coverage, potential breaking API changes, and semantic commits.',
    systemPromptAddendum: `## Pull Request Review Sentinel
- Review pull request diffs focusing on:
  1. Regression risks and potential null pointer/undefined dereferences.
  2. Edge cases in asynchronous error handling.
  3. API contract backwards-compatibility.
- Group remarks under [Blocking], [Nitpick], and [Praise].`,
    requiredTools: ['github_get_pull_request', 'github_search_code'],
    downloads: 4890,
    rating: 4.92,
    stars: 340,
    isInLibrary: true,
    isEnabled: true,
    compatibility: ['Claude 3.7', 'GPT-4o', 'Cursor'],
    createdAt: '2026-09-02T00:00:00Z',
    updatedAt: '2026-09-18T15:00:00Z',
  },
  {
    id: 'comm-notion-transpiler',
    name: 'Notion to Markdown Transpiler',
    slug: 'notion-to-markdown',
    category: 'productivity',
    source: 'community',
    author: {
      name: 'Sarah Chen',
      handle: 'sarah_k',
      verified: true,
    },
    version: '1.7.0',
    tags: ['notion', 'markdown', 'knowledge-base', 'formatting'],
    tokenEstimate: 160,
    description: 'Parses nested Notion database blocks, callouts, and toggle lists into clean Github-flavored markdown with frontmatter.',
    systemPromptAddendum: `## Notion Block Transpilation
- Convert Notion callout boxes into standard GFM blockquotes with emoji badges.
- Render Notion toggle lists as HTML <details><summary> tags.
- Extract page properties into YAML frontmatter at top of documents.`,
    requiredTools: ['notion_search_pages', 'notion_get_page_content'],
    downloads: 3820,
    rating: 4.86,
    stars: 210,
    isInLibrary: false,
    isEnabled: false,
    compatibility: ['Claude 3.7', 'GPT-4o', 'Gemini 2.5/3.5'],
    createdAt: '2026-09-05T00:00:00Z',
    updatedAt: '2026-09-19T08:00:00Z',
  },
  {
    id: 'comm-fastapi-generator',
    name: 'FastAPI Spec & Route Generator',
    slug: 'fastapi-generator',
    category: 'coding',
    source: 'community',
    author: {
      name: 'Daniela Alvarez',
      handle: 'daniela_py',
      verified: true,
    },
    version: '1.3.0',
    tags: ['python', 'fastapi', 'pydantic', 'rest-api'],
    tokenEstimate: 210,
    description: 'Generates idiomatic FastAPI routes using Pydantic v2 BaseModels, async dependency injection, and proper status codes.',
    systemPromptAddendum: `## FastAPI Production Standards
- Use Pydantic v2 with ConfigDict.
- Declare endpoint dependency injection via Annotated[T, Depends(...)].
- Always provide explicit response_model and status_code declarations.`,
    downloads: 2450,
    rating: 4.88,
    stars: 180,
    isInLibrary: false,
    isEnabled: false,
    compatibility: ['Claude 3.7', 'GPT-4o', 'Cursor'],
    createdAt: '2026-09-08T00:00:00Z',
    updatedAt: '2026-09-17T12:00:00Z',
  },
  {
    id: 'comm-slack-sentiment',
    name: 'Slack Incident & Sentiment Monitor',
    slug: 'slack-incident-monitor',
    category: 'agentic',
    source: 'community',
    author: {
      name: 'IncidentOps Labs',
      handle: 'incident_ops',
      verified: false,
    },
    version: '1.1.2',
    tags: ['slack', 'incident-response', 'sentiment', 'triage'],
    tokenEstimate: 185,
    description: 'Evaluates team channel messages for outage alerts, escalation patterns, and priority customer grievances.',
    systemPromptAddendum: `## Incident Triage Protocol
- Monitor keywords: "down", "outage", "500", "latency spike", "blocking release".
- Categorize severity into SEV-1, SEV-2, or SEV-3.
- Draft proactive incident channel summaries with time-stamped blast radiuses.`,
    requiredTools: ['slack_search_messages', 'slack_post_message'],
    downloads: 1350,
    rating: 4.75,
    stars: 95,
    isInLibrary: false,
    isEnabled: false,
    compatibility: ['Claude 3.7', 'GPT-4o', 'Gemini 2.5/3.5'],
    createdAt: '2026-09-10T00:00:00Z',
    updatedAt: '2026-09-16T19:00:00Z',
  },
  {
    id: 'comm-compliance-audit',
    name: 'Regulatory GDPR & Data Lineage Stamp',
    slug: 'gdpr-lineage-stamp',
    category: 'enterprise',
    source: 'community',
    author: {
      name: 'LegalTech Vanguard',
      handle: 'legal_tech',
      verified: true,
    },
    version: '2.0.0',
    tags: ['compliance', 'gdpr', 'data-lineage', 'audit-trail'],
    tokenEstimate: 220,
    description: 'Appends cryptographically verifiable data provenance, retention flags, and residency verification on sensitive records.',
    systemPromptAddendum: `## GDPR Data Governance Directives
- Explicitly record data origin timestamp, source repository, and authorized purpose for every data retrieval.
- Confirm EU-US Data Privacy Framework residency requirements when cross-referencing customer identifiers.`,
    downloads: 920,
    rating: 4.89,
    stars: 84,
    isInLibrary: false,
    isEnabled: false,
    compatibility: ['Claude 3.7', 'GPT-4o'],
    createdAt: '2026-09-11T00:00:00Z',
    updatedAt: '2026-09-15T14:00:00Z',
  },
];

class SkillManagerStore {
  private skills: SkillItem[] = [...INITIAL_SKILLS];

  public getAllSkills(): SkillItem[] {
    return this.skills;
  }

  public getLibrarySkills(): SkillItem[] {
    return this.skills.filter((s) => s.isInLibrary);
  }

  public getSkillById(id: string): SkillItem | undefined {
    return this.skills.find((s) => s.id === id || s.slug === id);
  }

  public addSkillToLibrary(id: string): SkillItem | null {
    const skill = this.skills.find((s) => s.id === id);
    if (!skill) return null;
    skill.isInLibrary = true;
    skill.isEnabled = true;
    return skill;
  }

  public removeSkillFromLibrary(id: string): SkillItem | null {
    const skill = this.skills.find((s) => s.id === id);
    if (!skill) return null;
    skill.isInLibrary = false;
    skill.isEnabled = false;
    return skill;
  }

  public toggleSkillEnabled(id: string): SkillItem | null {
    const skill = this.skills.find((s) => s.id === id);
    if (!skill) return null;
    skill.isEnabled = !skill.isEnabled;
    return skill;
  }

  public createCustomSkill(data: {
    name: string;
    slug?: string;
    category?: SkillCategory;
    description: string;
    systemPromptAddendum: string;
    version?: string;
    tags?: string[];
    requiredTools?: string[];
    authorName?: string;
  }): SkillItem {
    const id = `custom-skill-${Date.now().toString(36)}`;
    const slug =
      data.slug ||
      data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    const tokenEstimate = Math.max(50, Math.round(data.systemPromptAddendum.length / 3.8));

    const newSkill: SkillItem = {
      id,
      name: data.name,
      slug,
      category: data.category || 'agentic',
      source: 'custom',
      author: {
        name: data.authorName || 'Current Workspace (You)',
        handle: 'local-author',
        verified: true,
      },
      version: data.version || '1.0.0',
      tags: data.tags || ['custom', 'user-created'],
      tokenEstimate,
      description: data.description,
      systemPromptAddendum: data.systemPromptAddendum,
      requiredTools: data.requiredTools || [],
      downloads: 1,
      rating: 5.0,
      stars: 1,
      isInLibrary: true,
      isEnabled: true,
      compatibility: ['Claude 3.7', 'GPT-4o', 'Gemini 2.5/3.5', 'Cursor'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.skills.unshift(newSkill);
    return newSkill;
  }

  public importSkillFromManifest(manifestStr: string): SkillItem {
    let parsed: any;
    try {
      parsed = JSON.parse(manifestStr);
    } catch {
      // Try parsing markdown frontmatter if not pure JSON
      parsed = this.parseMarkdownManifest(manifestStr);
    }

    if (!parsed.name || typeof parsed.name !== 'string') {
      throw new Error('Skill manifest must include a valid "name" field.');
    }

    if (!parsed.systemPromptAddendum && !parsed.prompt && !parsed.instructions) {
      throw new Error('Skill manifest must include instructions or a "systemPromptAddendum".');
    }

    return this.createCustomSkill({
      name: parsed.name,
      slug: parsed.slug,
      category: parsed.category,
      description: parsed.description || 'Imported agent skill manifest',
      systemPromptAddendum: parsed.systemPromptAddendum || parsed.prompt || parsed.instructions,
      version: parsed.version || '1.0.0',
      tags: Array.isArray(parsed.tags) ? parsed.tags : ['imported', 'custom'],
      requiredTools: Array.isArray(parsed.requiredTools) ? parsed.requiredTools : [],
      authorName: parsed.author?.name || parsed.author || 'Imported Skill',
    });
  }

  private parseMarkdownManifest(mdContent: string): any {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = mdContent.match(frontmatterRegex);

    if (match) {
      const yamlLines = match[1].split('\n');
      const meta: Record<string, any> = {};
      yamlLines.forEach((line) => {
        const [k, ...v] = line.split(':');
        if (k && v.length) {
          const key = k.trim();
          const val = v.join(':').trim().replace(/^['"](.*)['"]$/, '$1');
          if (key === 'tags' && val.startsWith('[')) {
            try {
              meta[key] = JSON.parse(val);
            } catch {
              meta[key] = val.split(',').map((t) => t.trim());
            }
          } else {
            meta[key] = val;
          }
        }
      });
      return {
        ...meta,
        systemPromptAddendum: match[2].trim(),
      };
    }

    // Fallback: extract title from first line # Title
    const lines = mdContent.split('\n');
    const firstHeader = lines.find((l) => l.startsWith('# '));
    const name = firstHeader ? firstHeader.replace('# ', '').trim() : 'Custom Markdown Skill';

    return {
      name,
      description: 'Custom agent capability imported from Markdown file',
      systemPromptAddendum: mdContent.trim(),
    };
  }

  public deleteCustomSkill(id: string): boolean {
    const idx = this.skills.findIndex((s) => s.id === id && s.source === 'custom');
    if (idx !== -1) {
      this.skills.splice(idx, 1);
      return true;
    }
    return false;
  }

  public getStats() {
    const inLibrary = this.skills.filter((s) => s.isInLibrary);
    const totalTokensInLibrary = inLibrary.reduce((sum, s) => sum + s.tokenEstimate, 0);

    return {
      totalSkills: this.skills.length,
      inLibraryCount: inLibrary.length,
      platformCount: this.skills.filter((s) => s.source === 'platform').length,
      communityCount: this.skills.filter((s) => s.source === 'community').length,
      customCount: this.skills.filter((s) => s.source === 'custom').length,
      totalTokensInLibrary,
    };
  }
}

// Global Singleton
const globalForSkills = globalThis as unknown as { skillManager?: SkillManagerStore };
export const SkillManager = globalForSkills.skillManager || new SkillManagerStore();
if (process.env.NODE_ENV !== 'production') {
  globalForSkills.skillManager = SkillManager;
}
