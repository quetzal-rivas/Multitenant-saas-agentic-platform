// ==============================================================================
// Database Persistence (src/db.ts) - Supabase PostgreSQL ephemeral_context
// Logs task state (scheduled, completed, failed, escalated)
// ==============================================================================

import { EphemeralContextRecord, TaskPayload, TaskStatus, NodeTraversalLog } from './types';

// In-Memory Seed & Fast-Persistence Store (Mirrors Supabase PostgreSQL ephemeral_context table)
class DatabaseManager {
  private records: Map<string, EphemeralContextRecord> = new Map();

  constructor() {
    this.seedInitialTasks();
  }

  /**
   * Seed realistic upcoming tasks for September & October 2026
   */
  private seedInitialTasks() {
    const initialTasks: EphemeralContextRecord[] = [
      {
        id: 'ec-uuid-202',
        taskId: 'task-202',
        tenantId: 'tenant_enterprise_corp',
        teamId: 'team_sales_pipeline',
        teamName: 'Autonomous Sales & Executive Pipeline',
        assignedAgent: 'Executive Sales Closer',
        targetTime: '2026-09-10T18:00:00Z',
        primaryInstructions: 'Send summary report via email to boss.',
        toolsWhitelist: ['gmail'],
        edgeCasePolicies: {
          fallbackOnPrimaryFailure: 'escalate',
          escalationTool: 'elevenlabs',
          escalationInstructions: 'Trigger voice alert call if email fails.',
          contactOverrides: {
            boss: 'boss@example.com',
          },
          maxRetries: 2,
          notifyChannels: ['slack', 'email'],
        },
        status: 'escalated',
        executionResult: {
          primaryTool: 'gmail',
          primaryAttemptSuccess: false,
          error: 'SMTP Protocol Exception: 535-5.7.8 Authentication credentials expired or upstream gateway timeout',
        },
        edgeEscalationDetails: {
          escalationTool: 'elevenlabs',
          dispatchedAt: '2026-09-10T18:00:02Z',
          callSid: 'CA_84920485923',
          voicePrompt: 'Emergency escalation: Scheduled email task failed. Dispatching voice briefing to boss@example.com',
          callOutcome: 'completed_and_acknowledged',
          contactDialed: 'boss@example.com (Executive Direct Line)',
        },
        nodeTraversalHistory: [
          {
            node: 'ingest_task',
            enteredAt: '2026-09-10T18:00:00Z',
            completedAt: '2026-09-10T18:00:00Z',
            status: 'success',
            details: { payloadValidated: true, validator: 'Zod' },
          },
          {
            node: 'execute_primary_node',
            enteredAt: '2026-09-10T18:00:01Z',
            completedAt: '2026-09-10T18:00:01Z',
            status: 'failed',
            details: {
              tool: 'gmail',
              error: 'SMTP Protocol Exception: 535-5.7.8 Authentication credentials expired or upstream gateway timeout',
            },
          },
          {
            node: 'edge_escalation_node',
            enteredAt: '2026-09-10T18:00:02Z',
            completedAt: '2026-09-10T18:00:03Z',
            status: 'escalated',
            details: {
              fallbackStrategy: 'escalate',
              escalationTool: 'elevenlabs',
              status: 'Voice call answered by executive',
            },
          },
          {
            node: 'persist_ephemeral_context',
            enteredAt: '2026-09-10T18:00:03Z',
            completedAt: '2026-09-10T18:00:03Z',
            status: 'success',
            details: { table: 'public.ephemeral_context', persisted: true },
          },
        ],
        errorMessage: 'Primary Gmail delivery failed; successfully escalated to ElevenLabs voice dispatch',
        retryCount: 1,
        createdAt: '2026-09-08T14:30:00Z',
        updatedAt: '2026-09-10T18:00:03Z',
        executedAt: '2026-09-10T18:00:00Z',
      },
      {
        id: 'ec-uuid-203',
        taskId: 'task-203',
        tenantId: 'tenant_enterprise_corp',
        teamId: 'team_inbound_voice',
        teamName: 'Inbound Voice & Lead Booking Team',
        assignedAgent: 'Lead Qualification Agent',
        targetTime: '2026-09-23T15:30:00Z',
        primaryInstructions: 'Schedule follow-up demo call with Acquired Enterprise VP of Eng and send calendar invites.',
        toolsWhitelist: ['google_calendar', 'gmail'],
        edgeCasePolicies: {
          fallbackOnPrimaryFailure: 'escalate',
          escalationTool: 'elevenlabs',
          escalationInstructions: 'Trigger voice alert to on-duty sales lead if calendar overlap occurs.',
          contactOverrides: {
            sales_rep: 'marcus.vance@enterprise.com',
          },
          maxRetries: 2,
          notifyChannels: ['slack'],
        },
        status: 'scheduled',
        nodeTraversalHistory: [
          {
            node: 'ingest_task',
            enteredAt: '2026-09-22T08:10:00Z',
            completedAt: '2026-09-22T08:10:00Z',
            status: 'success',
            details: { queue: 'BullMQ:deferred-tasks-queue', delayMs: 112800000 },
          },
        ],
        retryCount: 0,
        createdAt: '2026-09-22T08:10:00Z',
        updatedAt: '2026-09-22T08:10:00Z',
      },
      {
        id: 'ec-uuid-204',
        taskId: 'task-204',
        tenantId: 'tenant_enterprise_corp',
        teamId: 'team_inbound_voice',
        teamName: 'Inbound Voice & Lead Booking Team',
        assignedAgent: 'Inbound Call Screener',
        targetTime: '2026-09-24T10:00:00Z',
        primaryInstructions: 'Deliver scheduled voice check-in and confirm booking terms for prospective client.',
        toolsWhitelist: ['elevenlabs'],
        edgeCasePolicies: {
          fallbackOnPrimaryFailure: 'retry',
          escalationTool: 'gmail',
          escalationInstructions: 'Send email summary if call goes to voicemail after 3 attempts.',
          contactOverrides: {},
          maxRetries: 3,
          notifyChannels: ['slack'],
        },
        status: 'scheduled',
        nodeTraversalHistory: [
          {
            node: 'ingest_task',
            enteredAt: '2026-09-22T09:00:00Z',
            completedAt: '2026-09-22T09:00:00Z',
            status: 'success',
          },
        ],
        retryCount: 0,
        createdAt: '2026-09-22T09:00:00Z',
        updatedAt: '2026-09-22T09:00:00Z',
      },
      {
        id: 'ec-uuid-205',
        taskId: 'task-205',
        tenantId: 'tenant_enterprise_corp',
        teamId: 'team_support_triage',
        teamName: 'Customer Support & SLA Escalation',
        assignedAgent: 'SLA Escalation Specialist',
        targetTime: '2026-09-25T14:00:00Z',
        primaryInstructions: 'Review pending Tier-3 database migration tickets and compile executive health audit.',
        toolsWhitelist: ['postgres', 'gmail'],
        edgeCasePolicies: {
          fallbackOnPrimaryFailure: 'escalate',
          escalationTool: 'elevenlabs',
          escalationInstructions: 'Call DevOps on-call engineer if SLA breach threshold exceeded.',
          contactOverrides: {
            devops_oncall: '+1 (415) 555-0199',
          },
          maxRetries: 1,
          notifyChannels: ['slack', 'pagerduty'],
        },
        status: 'scheduled',
        nodeTraversalHistory: [],
        retryCount: 0,
        createdAt: '2026-09-21T11:00:00Z',
        updatedAt: '2026-09-21T11:00:00Z',
      },
      {
        id: 'ec-uuid-206',
        taskId: 'task-206',
        tenantId: 'tenant_enterprise_corp',
        teamId: 'team_sales_pipeline',
        teamName: 'Autonomous Sales & Executive Pipeline',
        assignedAgent: 'Proposal Drafter',
        targetTime: '2026-09-28T16:00:00Z',
        primaryInstructions: 'Synchronize HubSpot deals and dispatch automated proposal contract revision.',
        toolsWhitelist: ['hubspot', 'gmail'],
        edgeCasePolicies: {
          fallbackOnPrimaryFailure: 'escalate',
          escalationTool: 'elevenlabs',
          escalationInstructions: 'Trigger voice alert if client signature token not delivered.',
          contactOverrides: {},
          maxRetries: 2,
          notifyChannels: ['email'],
        },
        status: 'scheduled',
        nodeTraversalHistory: [],
        retryCount: 0,
        createdAt: '2026-09-20T16:00:00Z',
        updatedAt: '2026-09-20T16:00:00Z',
      },
      {
        id: 'ec-uuid-207',
        taskId: 'task-207',
        tenantId: 'tenant_enterprise_corp',
        teamId: 'team_inbound_voice',
        teamName: 'Inbound Voice & Lead Booking Team',
        assignedAgent: 'Lead Qualification Agent',
        targetTime: '2026-10-02T11:30:00Z',
        primaryInstructions: 'Quarterly pipeline review and automated calendar invitation dispatch with Global Finance team.',
        toolsWhitelist: ['google_calendar', 'gmail'],
        edgeCasePolicies: {
          fallbackOnPrimaryFailure: 'escalate',
          escalationTool: 'elevenlabs',
          escalationInstructions: 'Trigger voice notification to Chief Revenue Officer.',
          contactOverrides: {
            cro: 'cro@enterprise.com',
          },
          maxRetries: 2,
          notifyChannels: ['slack'],
        },
        status: 'scheduled',
        nodeTraversalHistory: [],
        retryCount: 0,
        createdAt: '2026-09-22T10:00:00Z',
        updatedAt: '2026-09-22T10:00:00Z',
      },
      {
        id: 'ec-uuid-208',
        taskId: 'task-208',
        tenantId: 'tenant_enterprise_corp',
        teamId: 'team_support_triage',
        teamName: 'Customer Support & SLA Escalation',
        assignedAgent: 'Incident Dispatcher',
        targetTime: '2026-09-21T09:00:00Z',
        primaryInstructions: 'Run automated end-of-week health verification and dispatch status to Slack & Gmail.',
        toolsWhitelist: ['gmail'],
        edgeCasePolicies: {
          fallbackOnPrimaryFailure: 'escalate',
          escalationTool: 'elevenlabs',
          escalationInstructions: 'Voice call engineering lead if status report delivery fails.',
          contactOverrides: {},
          maxRetries: 2,
          notifyChannels: ['slack'],
        },
        status: 'completed',
        executionResult: {
          status: 'delivered',
          messageId: 'msg_9843912',
          summary: 'Status report delivered successfully without requiring edge escalation.',
        },
        nodeTraversalHistory: [
          {
            node: 'ingest_task',
            enteredAt: '2026-09-21T09:00:00Z',
            completedAt: '2026-09-21T09:00:00Z',
            status: 'success',
          },
          {
            node: 'execute_primary_node',
            enteredAt: '2026-09-21T09:00:01Z',
            completedAt: '2026-09-21T09:00:02Z',
            status: 'success',
            details: { tool: 'gmail', sent: true },
          },
          {
            node: 'persist_ephemeral_context',
            enteredAt: '2026-09-21T09:00:02Z',
            completedAt: '2026-09-21T09:00:02Z',
            status: 'success',
          },
        ],
        retryCount: 0,
        createdAt: '2026-09-19T10:00:00Z',
        updatedAt: '2026-09-21T09:00:02Z',
        executedAt: '2026-09-21T09:00:00Z',
      },
    ];

    for (const t of initialTasks) {
      this.records.set(t.taskId, t);
    }
  }

  /**
   * Save or insert task into ephemeral_context table
   */
  public async saveTask(payload: TaskPayload): Promise<EphemeralContextRecord> {
    const existing = this.records.get(payload.taskId);
    const now = new Date().toISOString();

    const record: EphemeralContextRecord = {
      id: existing?.id || `ec-${Math.random().toString(36).substring(2, 11)}`,
      taskId: payload.taskId,
      tenantId: payload.tenantId || 'tenant_enterprise_corp',
      teamId: payload.teamId || 'team_inbound_voice',
      teamName: this.getTeamName(payload.teamId),
      assignedAgent: payload.assignedAgent || 'Lead Qualification Agent',
      targetTime: payload.targetTime,
      primaryInstructions: payload.primaryInstructions,
      toolsWhitelist: payload.toolsWhitelist,
      edgeCasePolicies: payload.edgeCasePolicies,
      status: existing?.status || 'scheduled',
      executionResult: existing?.executionResult || null,
      edgeEscalationDetails: existing?.edgeEscalationDetails || null,
      nodeTraversalHistory: existing?.nodeTraversalHistory || [
        {
          node: 'ingest_task',
          enteredAt: now,
          completedAt: now,
          status: 'success',
          details: { validated: true, toolCount: payload.toolsWhitelist.length },
        },
      ],
      errorMessage: existing?.errorMessage || null,
      retryCount: existing?.retryCount || 0,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      executedAt: existing?.executedAt || null,
    };

    this.records.set(payload.taskId, record);
    return record;
  }

  /**
   * Get task by taskId
   */
  public async getTask(taskId: string): Promise<EphemeralContextRecord | null> {
    return this.records.get(taskId) || null;
  }

  /**
   * List all tasks with filtering
   */
  public async listTasks(filters?: {
    agent?: string;
    teamId?: string;
    status?: TaskStatus | 'all';
    search?: string;
    month?: string; // YYYY-MM
    includeSimulation?: boolean;
  }): Promise<EphemeralContextRecord[]> {
    let list = Array.from(this.records.values());

    // By default, filter out simulation tasks to preserve production data analytics
    if (!filters?.includeSimulation) {
      list = list.filter((t) => !t.isSimulation);
    }

    if (filters?.agent && filters.agent !== 'all') {
      list = list.filter((t) => t.assignedAgent.toLowerCase() === filters.agent!.toLowerCase());
    }

    if (filters?.teamId && filters.teamId !== 'all') {
      list = list.filter((t) => t.teamId === filters.teamId);
    }

    if (filters?.status && (filters.status as string) !== 'all') {
      list = list.filter((t) => t.status === filters.status);
    }

    if (filters?.month) {
      list = list.filter((t) => t.targetTime.startsWith(filters.month!));
    }

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (t) =>
          t.taskId.toLowerCase().includes(q) ||
          t.primaryInstructions.toLowerCase().includes(q) ||
          t.assignedAgent.toLowerCase().includes(q) ||
          (t.teamName && t.teamName.toLowerCase().includes(q))
      );
    }

    // Sort by targetTime ascending
    return list.sort((a, b) => new Date(a.targetTime).getTime() - new Date(b.targetTime).getTime());
  }

  /**
   * Update task state and append node traversal
   */
  public async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    updates: Partial<EphemeralContextRecord> = {},
    newNodeLog?: NodeTraversalLog
  ): Promise<EphemeralContextRecord | null> {
    const record = this.records.get(taskId);
    if (!record) return null;

    const now = new Date().toISOString();
    record.status = status;
    record.updatedAt = now;

    if (updates.executionResult !== undefined) record.executionResult = updates.executionResult;
    if (updates.edgeEscalationDetails !== undefined)
      record.edgeEscalationDetails = updates.edgeEscalationDetails;
    if (updates.errorMessage !== undefined) record.errorMessage = updates.errorMessage;
    if (updates.executedAt !== undefined) record.executedAt = updates.executedAt;
    if (updates.retryCount !== undefined) record.retryCount = updates.retryCount;

    if (newNodeLog) {
      record.nodeTraversalHistory.push(newNodeLog);
    }

    this.records.set(taskId, record);
    return record;
  }

  /**
   * Delete task
   */
  public async deleteTask(taskId: string): Promise<boolean> {
    return this.records.delete(taskId);
  }

  private getTeamName(teamId?: string): string {
    switch (teamId) {
      case 'team_inbound_voice':
        return 'Inbound Voice & Lead Booking Team';
      case 'team_sales_pipeline':
        return 'Autonomous Sales & Executive Pipeline';
      case 'team_support_triage':
        return 'Customer Support & SLA Escalation';
      default:
        return 'Multi-Agent Operations Team';
    }
  }
}

export const taskDb = new DatabaseManager();
