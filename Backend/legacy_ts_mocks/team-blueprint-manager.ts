/**
 * Team Blueprint Manager (Supabase PostgreSQL + Dynamic LangGraph Runtime)
 * Handles relational storage of Profiles (The Teams) and Profile Workers (The Members)
 * Manages dynamic Thread Instances spawned per session.
 */

export interface ProfileWorkerBlueprint {
  id: string;
  profileId?: string;
  name: string; // e.g. "CRM Specialist", "Billing Clerk"
  role: string; // e.g. "Lead Enrichment & CRM Operations"
  systemPrompt?: string; // Instructions for this specific worker
  mcpTools: string[]; // Allowed pre-authenticated tools / skills e.g. ['crm.add_lead', 'crm.tag_contact']
  skills?: string[]; // Assigned capability skills
  mcpProfileId?: string; // Assigned MCP Server Profile (e.g. "mcp-profile-sales")
  contextProfileSlug?: string; // Assigned Context Control Profile (e.g. "sales-agent")
  avatarIcon?: string;
}

export interface ProfileTeamBlueprint {
  id: string; // UUID or slug
  tenantId: string;
  name: string; // e.g. "Front Desk Automation Team"
  supervisorPrompt?: string; // Custom rules for the router / corporate instructions
  supervisorSkills?: string[]; // Assigned skills for supervisor node
  supervisorMcpProfileId?: string; // Assigned MCP Server Profile for supervisor
  supervisorContextProfileSlug?: string; // Assigned Context Control Profile for supervisor
  routingStrategy?: 'supervisor_router' | 'sequential_pipeline' | 'consensus';
  workers: ProfileWorkerBlueprint[];
  createdAt: string;
  updatedAt: string;
}

export interface ThreadInstance {
  id: string;
  threadId: string; // e.g. "fresh_chat_session_889"
  tenantId: string;
  profileId: string;
  title: string;
  createdAt: string;
  lastActiveAt: string;
  messageCount?: number;
}

export interface AuthenticatedMcpTool {
  id: string;
  name: string;
  displayName: string;
  description: string;
  spoke: 'hubspot' | 'stripe' | 'google_workspace' | 'github' | 'slack' | 'notion' | 'postgres';
  category: string;
  parameters: Record<string, any>;
  requiresAuth: boolean;
}

// Master catalog of pre-authenticated tools available through the proprietary MCP Gateway
export const PLATFORM_MCP_TOOLS_CATALOG: AuthenticatedMcpTool[] = [
  // HubSpot CRM Spoke
  {
    id: 'crm.search_contact',
    name: 'crm.search_contact',
    displayName: 'Search Contact',
    description: 'Lookup HubSpot CRM leads, prospects, and company accounts by query or email.',
    spoke: 'hubspot',
    category: 'CRM & Pipeline',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    requiresAuth: true,
  },
  {
    id: 'crm.add_lead',
    name: 'crm.add_lead',
    displayName: 'Add CRM Lead',
    description: 'Create a new prospect lead record in HubSpot with company attribution and tags.',
    spoke: 'hubspot',
    category: 'CRM & Pipeline',
    parameters: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' }, company: { type: 'string' } }, required: ['name', 'email'] },
    requiresAuth: true,
  },
  {
    id: 'crm.tag_contact',
    name: 'crm.tag_contact',
    displayName: 'Tag Contact Record',
    description: 'Apply high-priority, churn-risk, or deal tags to an existing contact profile.',
    spoke: 'hubspot',
    category: 'CRM & Pipeline',
    parameters: { type: 'object', properties: { contact_id: { type: 'string' }, tags: { type: 'array' } }, required: ['contact_id', 'tags'] },
    requiresAuth: true,
  },
  {
    id: 'crm.update_deal_stage',
    name: 'crm.update_deal_stage',
    displayName: 'Update Deal Stage',
    description: 'Advance deal stage, expected revenue, and close probability in the sales pipeline.',
    spoke: 'hubspot',
    category: 'CRM & Pipeline',
    parameters: { type: 'object', properties: { deal_id: { type: 'string' }, stage: { type: 'string' } }, required: ['deal_id', 'stage'] },
    requiresAuth: true,
  },

  // Stripe & Billing Spoke
  {
    id: 'stripe.get_invoice',
    name: 'stripe.get_invoice',
    displayName: 'Get Customer Invoice',
    description: 'Retrieve line items, payment status, and due dates for a customer billing invoice.',
    spoke: 'stripe',
    category: 'Billing & Payments',
    parameters: { type: 'object', properties: { invoice_id: { type: 'string' } }, required: ['invoice_id'] },
    requiresAuth: true,
  },
  {
    id: 'stripe.pay',
    name: 'stripe.pay',
    displayName: 'Process Payment Intent',
    description: 'Execute payment transaction against an authorized corporate payment method.',
    spoke: 'stripe',
    category: 'Billing & Payments',
    parameters: { type: 'object', properties: { customer_id: { type: 'string' }, amount_cents: { type: 'number' } }, required: ['customer_id', 'amount_cents'] },
    requiresAuth: true,
  },
  {
    id: 'stripe.refund_status',
    name: 'stripe.refund_status',
    displayName: 'Check Refund Status',
    description: 'Audit whether a dispute or refund has been settled with the acquiring bank.',
    spoke: 'stripe',
    category: 'Billing & Payments',
    parameters: { type: 'object', properties: { charge_id: { type: 'string' } }, required: ['charge_id'] },
    requiresAuth: true,
  },

  // PostgreSQL Spoke (Supavisor)
  {
    id: 'postgres.describe_table',
    name: 'postgres.describe_table',
    displayName: 'Describe Table Schema',
    description: 'Inspect table columns, types, indexes, and foreign keys via Supavisor pooler.',
    spoke: 'postgres',
    category: 'Database & Storage',
    parameters: { type: 'object', properties: { table_name: { type: 'string' } }, required: ['table_name'] },
    requiresAuth: true,
  },
  {
    id: 'postgres.execute_read_query',
    name: 'postgres.execute_read_query',
    displayName: 'Execute Read Query',
    description: 'Execute high-speed read-only SQL queries with tenant isolation filters.',
    spoke: 'postgres',
    category: 'Database & Storage',
    parameters: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] },
    requiresAuth: true,
  },

  // Slack Spoke
  {
    id: 'slack.post_incident_alert',
    name: 'slack.post_incident_alert',
    displayName: 'Post Incident Alert',
    description: 'Send formatted operational alert notifications to designated Slack channels.',
    spoke: 'slack',
    category: 'Communication',
    parameters: { type: 'object', properties: { channel: { type: 'string' }, message: { type: 'string' } }, required: ['channel', 'message'] },
    requiresAuth: true,
  },

  // Notion Spoke
  {
    id: 'notion.search_pages',
    name: 'notion.search_pages',
    displayName: 'Search Knowledge Base',
    description: 'Search internal SOPs, technical escalation runbooks, and product FAQs.',
    spoke: 'notion',
    category: 'Knowledge Base',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    requiresAuth: true,
  },

  // Google Workspace Spoke
  {
    id: 'gmail.send_draft',
    name: 'gmail.send_draft',
    displayName: 'Create Gmail Draft',
    description: 'Prepare executive follow-up and confirmation email drafts in Gmail.',
    spoke: 'google_workspace',
    category: 'Communication',
    parameters: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'subject', 'body'] },
    requiresAuth: true,
  },

  // GitHub Spoke
  {
    id: 'github.search_repositories',
    name: 'github.search_repositories',
    displayName: 'Search GitHub Repos',
    description: 'Query code repositories, PR commits, and architecture documentation in GitHub.',
    spoke: 'github',
    category: 'Developer Tools',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    requiresAuth: true,
  },
];

class TeamBlueprintManager {
  private profiles: Map<string, ProfileTeamBlueprint> = new Map();
  private threadInstances: Map<string, ThreadInstance> = new Map();

  constructor() {
    this.seedDefaultBlueprints();
  }

  private seedDefaultBlueprints() {
    const tenantId = 'tenant_enterprise_corp';

    // 1. Front Desk Automation Team (Matches User Blueprint)
    const frontDeskId = 'team_front_desk_automation';
    this.profiles.set(frontDeskId, {
      id: frontDeskId,
      tenantId,
      name: 'Front Desk Automation Team',
      supervisorPrompt: 'You are the corporate supervisor router for the front desk. Route caller identity verification and lead updates to the CRM Specialist first. If the caller asks about invoices, balances, or payments, route to the Billing Clerk. Ensure strict validation before authorizing payments.',
      routingStrategy: 'supervisor_router',
      createdAt: '2026-09-01T08:00:00Z',
      updatedAt: '2026-09-22T08:00:00Z',
      workers: [
        {
          id: 'wkr_crm_spec_01',
          profileId: frontDeskId,
          name: 'CRM Specialist',
          role: 'Lead Enrichment & CRM Operations',
          systemPrompt: 'You are the CRM Specialist. You handle caller identification, contact record creation, lead enrichment, and tagging. Query HubSpot before updating.',
          mcpTools: ['crm.search_contact', 'crm.add_lead', 'crm.tag_contact'],
          avatarIcon: 'user-check',
        },
        {
          id: 'wkr_billing_01',
          profileId: frontDeskId,
          name: 'Billing Clerk',
          role: 'Invoicing & Stripe Audit',
          systemPrompt: 'You audit invoices, verify billing statements, and check payment intents. Never void or charge a transaction without explicit confirmation.',
          mcpTools: ['stripe.get_invoice', 'stripe.pay', 'stripe.refund_status'],
          avatarIcon: 'credit-card',
        },
        {
          id: 'wkr_comms_01',
          profileId: frontDeskId,
          name: 'Follow-Up Specialist',
          role: 'Email & Schedule Dispatch',
          systemPrompt: 'You draft executive summaries and confirmation emails to callers summarizing decisions made during the conversation.',
          mcpTools: ['gmail.send_draft'],
          avatarIcon: 'mail',
        },
      ],
    });

    // 2. Night Audit Team
    const nightAuditId = 'team_night_audit_ops';
    this.profiles.set(nightAuditId, {
      id: nightAuditId,
      tenantId,
      name: 'Night Audit Team',
      supervisorPrompt: 'You are the nocturnal operations supervisor. Orchestrate automated data consistency checks across PostgreSQL replicas and verify incident SLAs. Escalate high latencies or deadlocks directly to the on-call Slack channel.',
      routingStrategy: 'supervisor_router',
      createdAt: '2026-09-05T00:00:00Z',
      updatedAt: '2026-09-22T08:00:00Z',
      workers: [
        {
          id: 'wkr_db_audit_01',
          profileId: nightAuditId,
          name: 'Database Auditor',
          role: 'PostgreSQL Consistency Inspector',
          systemPrompt: 'Inspect read replicas, active transaction locks, and query execution times via Supavisor pooler. Strictly execute read-only queries.',
          mcpTools: ['postgres.describe_table', 'postgres.execute_read_query'],
          avatarIcon: 'database',
        },
        {
          id: 'wkr_pager_01',
          profileId: nightAuditId,
          name: 'Incident Dispatcher',
          role: 'Ops Alert & Escalations',
          systemPrompt: 'Post structured incident warnings and nocturnal digest summaries to internal Slack operations channels.',
          mcpTools: ['slack.post_incident_alert'],
          avatarIcon: 'bell',
        },
      ],
    });

    // 3. Customer Support & Growth Team
    const customerTeamId = 'team_customer_support_growth';
    this.profiles.set(customerTeamId, {
      id: customerTeamId,
      tenantId,
      name: 'Customer Support & Growth Team',
      supervisorPrompt: 'Triage incoming customer inquiries. Route technical queries to the Knowledge Specialist to check Notion runbooks. Route renewal, enterprise expansion, or pricing questions to the Sales Expansion Closer.',
      routingStrategy: 'supervisor_router',
      createdAt: '2026-09-10T12:00:00Z',
      updatedAt: '2026-09-22T08:00:00Z',
      workers: [
        {
          id: 'wkr_kb_spec_01',
          profileId: customerTeamId,
          name: 'Knowledge Specialist',
          role: 'Technical Docs & SOP Search',
          systemPrompt: 'Search internal product documentation, FAQs, and incident resolution runbooks in Notion to answer customer queries with precision.',
          mcpTools: ['notion.search_pages', 'slack.post_incident_alert'],
          avatarIcon: 'book-open',
        },
        {
          id: 'wkr_sales_closer_01',
          profileId: customerTeamId,
          name: 'Sales Expansion Closer',
          role: 'Enterprise Deal Velocity',
          systemPrompt: 'Review customer CRM status and advance deals when renewal or upgrade interest is voiced.',
          mcpTools: ['crm.search_contact', 'crm.update_deal_stage', 'gmail.send_draft'],
          avatarIcon: 'trending-up',
        },
      ],
    });

    // Seed a few initial thread instances to show that Threads are distinct session instances
    this.seedInitialInstances(frontDeskId, nightAuditId, customerTeamId, tenantId);
  }

  private seedInitialInstances(frontDeskId: string, nightAuditId: string, customerTeamId: string, tenantId: string) {
    const inst1 = 'fresh_chat_session_889';
    this.threadInstances.set(inst1, {
      id: 'inst_001',
      threadId: inst1,
      tenantId,
      profileId: frontDeskId,
      title: 'Caller Intake: Marcus Vance (Logistics Deal)',
      createdAt: '2026-09-22T08:30:00Z',
      lastActiveAt: '2026-09-22T09:45:00Z',
      messageCount: 4,
    });

    const inst2 = 'fresh_chat_session_890';
    this.threadInstances.set(inst2, {
      id: 'inst_002',
      threadId: inst2,
      tenantId,
      profileId: frontDeskId,
      title: 'Invoice Dispute: Acme Corp #INV-4921',
      createdAt: '2026-09-22T09:50:00Z',
      lastActiveAt: '2026-09-22T10:00:00Z',
      messageCount: 2,
    });

    const inst3 = 'audit_session_nightly_01';
    this.threadInstances.set(inst3, {
      id: 'inst_003',
      threadId: inst3,
      tenantId,
      profileId: nightAuditId,
      title: 'Nightly Supavisor Pool Health Check',
      createdAt: '2026-09-22T02:00:00Z',
      lastActiveAt: '2026-09-22T02:15:00Z',
      messageCount: 3,
    });
  }

  // --- Profile Blueprint Operations ---

  public getAllProfiles(tenantId: string = 'tenant_enterprise_corp'): ProfileTeamBlueprint[] {
    return Array.from(this.profiles.values()).filter((p) => p.tenantId === tenantId);
  }

  public listProfiles(tenantId?: string): ProfileTeamBlueprint[] {
    const list = Array.from(this.profiles.values());
    if (tenantId) {
      return list.filter((p) => p.tenantId === tenantId);
    }
    return list;
  }

  public getProfile(profileId: string): ProfileTeamBlueprint | undefined {
    return this.profiles.get(profileId);
  }

  public attachWorker(
    profileId: string,
    workerData: Omit<ProfileWorkerBlueprint, 'id' | 'profileId'>
  ): ProfileTeamBlueprint | undefined {
    const profile = this.profiles.get(profileId);
    if (!profile) return undefined;

    const workerId = `wkr_${Math.random().toString(36).substring(2, 8)}_${profile.workers.length + 1}`;
    const newWorker: ProfileWorkerBlueprint = {
      id: workerId,
      profileId,
      name: workerData.name,
      role: workerData.role,
      systemPrompt: workerData.systemPrompt || '',
      mcpTools: workerData.mcpTools || [],
      skills: workerData.skills || [],
      mcpProfileId: workerData.mcpProfileId,
      contextProfileSlug: workerData.contextProfileSlug,
      avatarIcon: workerData.avatarIcon || 'bot',
    };

    profile.workers.push(newWorker);
    profile.updatedAt = new Date().toISOString();
    this.profiles.set(profileId, profile);
    return profile;
  }

  public createProfile(data: {
    tenantId?: string;
    name: string;
    supervisorPrompt?: string;
    supervisorSkills?: string[];
    supervisorMcpProfileId?: string;
    supervisorContextProfileSlug?: string;
    routingStrategy?: 'supervisor_router' | 'sequential_pipeline' | 'consensus';
    workers: Omit<ProfileWorkerBlueprint, 'id' | 'profileId'>[];
  }): ProfileTeamBlueprint {
    const tenantId = data.tenantId || 'tenant_enterprise_corp';
    const profileId = `team_${data.name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30)}_${Math.random().toString(36).substring(2, 6)}`;

    const workers: ProfileWorkerBlueprint[] = data.workers.map((w, idx) => ({
      id: `wkr_${Math.random().toString(36).substring(2, 8)}_${idx}`,
      profileId,
      name: w.name,
      role: w.role,
      systemPrompt: w.systemPrompt || '',
      mcpTools: w.mcpTools || w.skills || [],
      skills: w.skills || w.mcpTools || [],
      mcpProfileId: w.mcpProfileId,
      contextProfileSlug: w.contextProfileSlug,
      avatarIcon: w.avatarIcon || 'bot',
    }));

    const newProfile: ProfileTeamBlueprint = {
      id: profileId,
      tenantId,
      name: data.name,
      supervisorPrompt: data.supervisorPrompt || '',
      supervisorSkills: data.supervisorSkills || [],
      supervisorMcpProfileId: data.supervisorMcpProfileId,
      supervisorContextProfileSlug: data.supervisorContextProfileSlug,
      routingStrategy: data.routingStrategy || 'supervisor_router',
      workers,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.profiles.set(profileId, newProfile);
    return newProfile;
  }

  public updateProfile(
    profileId: string,
    updates: Partial<Omit<ProfileTeamBlueprint, 'id' | 'tenantId' | 'createdAt'>>
  ): ProfileTeamBlueprint | undefined {
    const existing = this.profiles.get(profileId);
    if (!existing) return undefined;

    const updated: ProfileTeamBlueprint = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.profiles.set(profileId, updated);
    return updated;
  }

  public deleteProfile(profileId: string): boolean {
    return this.profiles.delete(profileId);
  }

  // --- Dynamic Thread Instance Operations ---

  public spawnThreadInstance(
    profileId: string,
    tenantId: string = 'tenant_enterprise_corp',
    customTitle?: string
  ): ThreadInstance {
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const threadId = `fresh_chat_session_${randomSuffix}`;
    const instanceId = `inst_${Date.now()}`;
    const profile = this.getProfile(profileId);
    const profileName = profile ? profile.name : 'Custom Team';

    const newInstance: ThreadInstance = {
      id: instanceId,
      threadId,
      tenantId,
      profileId,
      title: customTitle || `New ${profileName} Session #${randomSuffix}`,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      messageCount: 0,
    };

    this.threadInstances.set(threadId, newInstance);
    return newInstance;
  }

  public getInstancesForProfile(profileId: string, tenantId: string = 'tenant_enterprise_corp'): ThreadInstance[] {
    return Array.from(this.threadInstances.values())
      .filter((inst) => inst.profileId === profileId && inst.tenantId === tenantId)
      .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime());
  }

  public getAllInstances(tenantId: string = 'tenant_enterprise_corp'): ThreadInstance[] {
    return Array.from(this.threadInstances.values())
      .filter((inst) => inst.tenantId === tenantId)
      .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime());
  }

  public getThreadInstance(threadId: string): ThreadInstance | undefined {
    return this.threadInstances.get(threadId);
  }

  public recordInstanceActivity(threadId: string, messageIncrement = 1) {
    const inst = this.threadInstances.get(threadId);
    if (inst) {
      inst.lastActiveAt = new Date().toISOString();
      inst.messageCount = (inst.messageCount || 0) + messageIncrement;
    }
  }

  // --- Pre-Authenticated MCP Tools for Tenant ---

  public getTenantAuthenticatedTools(tenantId: string = 'tenant_enterprise_corp'): AuthenticatedMcpTool[] {
    // In production, queries the tenant_vault table to verify active tokens.
    // For demo/full-stack runtime, returns all catalog tools with active spoke authorization.
    return PLATFORM_MCP_TOOLS_CATALOG;
  }
}

// Global Singleton Store
export const teamBlueprintManager = new TeamBlueprintManager();
