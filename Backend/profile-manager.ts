import { McpServerProfile } from './types';

// In-memory MCP Server Profile store
let MCP_PROFILES: McpServerProfile[] = [
  {
    id: 'mcp-profile-dev',
    name: 'Full-Stack Developer MCP',
    slug: 'fullstack-dev',
    description: 'Empowers Claude or Cursor with GitHub repos, Postgres schema inspection, and live code reviewer context.',
    apiKey: 'mcp_live_sec_89f0293da82b1c4',
    tokenBudget: 8000,
    selectedToolNames: [
      'context_resolve_profile',
      'github_search_repositories',
      'github_create_issue',
      'github_get_pull_request',
      'github_search_code',
      'postgres_list_tables',
      'postgres_describe_table',
      'postgres_execute_read_query',
    ],
    selectedSkillNames: ['skill-git-code-analysis', 'skill-safe-execution'],
    boundContextProfileSlugs: ['code-reviewer'],
    createdAt: '2026-09-18T10:00:00Z',
    updatedAt: '2026-09-20T16:15:00Z',
    lastActive: '2 minutes ago',
  },
  {
    id: 'mcp-profile-sales',
    name: 'Universal Sales & CRM Agent',
    slug: 'universal-sales',
    description: 'Binds Google Workspace email/calendar with Context Control multi-tenant customer profiles and CRM data.',
    apiKey: 'mcp_live_sec_33c71a98e54b6d0',
    tokenBudget: 12000,
    selectedToolNames: [
      'context_resolve_profile',
      'context_get_contract',
      'google_drive_search',
      'google_gmail_send_draft',
      'google_calendar_list_events',
    ],
    selectedSkillNames: ['skill-crm-enrichment', 'skill-context-guard'],
    boundContextProfileSlugs: ['sales-agent', 'customer-support'],
    createdAt: '2026-09-19T11:30:00Z',
    updatedAt: '2026-09-21T09:40:00Z',
    lastActive: 'Just now',
  },
  {
    id: 'mcp-profile-exec',
    name: 'Executive Briefing Suite',
    slug: 'executive-suite',
    description: 'High-level synthesis pulling Google Docs, Calendar events, and Slack team channel summaries.',
    apiKey: 'mcp_live_sec_77a1029fe883d19',
    tokenBudget: 16000,
    selectedToolNames: [
      'google_drive_search',
      'google_calendar_list_events',
      'slack_search_messages',
      'context_resolve_profile',
    ],
    selectedSkillNames: ['skill-context-guard'],
    boundContextProfileSlugs: ['executive-briefing'],
    createdAt: '2026-09-20T08:15:00Z',
    updatedAt: '2026-09-21T07:10:00Z',
    lastActive: '1 hour ago',
  },
];

export class McpProfileManager {
  static listProfiles(): McpServerProfile[] {
    return [...MCP_PROFILES];
  }

  static getProfileBySlug(slug: string): McpServerProfile | undefined {
    return MCP_PROFILES.find((p) => p.slug === slug || p.id === slug);
  }

  static getProfileByApiKey(apiKey: string): McpServerProfile | undefined {
    return MCP_PROFILES.find((p) => p.apiKey === apiKey);
  }

  static createProfile(data: Omit<McpServerProfile, 'id' | 'createdAt' | 'updatedAt'>): McpServerProfile {
    const newProfile: McpServerProfile = {
      ...data,
      id: `mcp-profile-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastActive: 'Never',
    };
    MCP_PROFILES = [newProfile, ...MCP_PROFILES];
    return newProfile;
  }

  static updateProfile(id: string, updates: Partial<McpServerProfile>): McpServerProfile | null {
    const index = MCP_PROFILES.findIndex((p) => p.id === id || p.slug === id);
    if (index === -1) return null;

    MCP_PROFILES[index] = {
      ...MCP_PROFILES[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    return MCP_PROFILES[index];
  }

  static deleteProfile(id: string): boolean {
    const initialLen = MCP_PROFILES.length;
    MCP_PROFILES = MCP_PROFILES.filter((p) => p.id !== id && p.slug !== id);
    return MCP_PROFILES.length < initialLen;
  }
}
