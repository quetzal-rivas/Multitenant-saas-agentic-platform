/**
 * PostgresSaver Checkpoint Manager (State Continuity & Audit Log)
 * Replicates LangGraph's binary checkpointing and sliding window memory
 * Tracks persona switches and tool executions on a single continuous thread_id
 */

export interface CheckpointRecord {
  checkpointId: string;
  threadId: string;
  tenantId: string;
  profileId: string;
  profileName: string;
  stepIndex: number;
  userMessage: string;
  assistantMessage: string;
  toolsExecuted: {
    toolName: string;
    serverProvider: string;
    arguments: Record<string, any>;
    output: any;
    latencyMs: number;
  }[];
  compiledToolsCount: number;
  compiledToolsNames: string[];
  metadata: {
    checkpointNs?: string;
    parentCheckpointId?: string;
    executionTimeMs: number;
    slidingWindowCount: number;
    hubVersion: string;
    isTeamBlueprint?: boolean;
    activeWorker?: string;
  };
  timestamp: string;
}

export class CheckpointManager {
  private threads: Map<string, CheckpointRecord[]> = new Map();

  constructor() {
    // Seed an initial thread demonstrating the multi-persona switching superpower!
    const defaultThreadId = 'session_enterprise_001';
    const defaultTenantId = 'tenant_enterprise_corp';

    this.threads.set(defaultThreadId, [
      {
        checkpointId: 'chk_1727000100_1',
        threadId: defaultThreadId,
        tenantId: defaultTenantId,
        profileId: 'sales_persona',
        profileName: 'Universal Sales & CRM Agent',
        stepIndex: 1,
        userMessage: 'What is the status of our top prospective lead from yesterday?',
        assistantMessage: 'Using the HubSpot CRM connection via the MCP Gateway, I searched our active pipeline for top enterprise leads. Found **Marcus Vance** (Vance Logistics Corp) - currently at *Qualified Lead* stage with an estimated $48,000 ARR deal.',
        toolsExecuted: [
          {
            toolName: 'hubspot_search_contact',
            serverProvider: 'hubspot',
            arguments: { query: 'lead status prospective' },
            output: { lead_id: 'hs_94821', name: 'Marcus Vance', company: 'Vance Logistics Corp', stage: 'Qualified', value: '$48,000 ARR' },
            latencyMs: 42.5,
          },
        ],
        compiledToolsCount: 3,
        compiledToolsNames: ['hubspot_search_contact', 'hubspot_update_deal_stage', 'gmail_send_draft'],
        metadata: {
          executionTimeMs: 142,
          slidingWindowCount: 1,
          hubVersion: 'mcp-gateway-v2.4',
        },
        timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      },
      {
        checkpointId: 'chk_1727000200_2',
        threadId: defaultThreadId,
        tenantId: defaultTenantId,
        profileId: 'sales_persona',
        profileName: 'Universal Sales & CRM Agent',
        stepIndex: 2,
        userMessage: 'Draft a follow up email thanking them for the initial demo.',
        assistantMessage: 'I have drafted the follow-up email in Gmail to Marcus Vance highlighting our deployment timeline and security review process.',
        toolsExecuted: [
          {
            toolName: 'gmail_send_draft',
            serverProvider: 'google_workspace',
            arguments: { to: 'm.vance@vancelogistics.com', subject: 'Next Steps - Enterprise Platform Demo Follow Up' },
            output: { draftId: 'draft_gm_9921', status: 'created', threadId: 'gm_th_4401' },
            latencyMs: 38.1,
          },
        ],
        compiledToolsCount: 3,
        compiledToolsNames: ['hubspot_search_contact', 'hubspot_update_deal_stage', 'gmail_send_draft'],
        metadata: {
          executionTimeMs: 110,
          slidingWindowCount: 2,
          hubVersion: 'mcp-gateway-v2.4',
        },
        timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
      },
    ]);
  }

  public getThreadCheckpoints(threadId: string): CheckpointRecord[] {
    return this.threads.get(threadId) || [];
  }

  public getLatestCheckpoint(threadId: string): CheckpointRecord | null {
    const list = this.threads.get(threadId) || [];
    return list.length > 0 ? list[list.length - 1] : null;
  }

  public appendCheckpoint(record: CheckpointRecord): void {
    const list = this.threads.get(record.threadId) || [];
    list.push(record);
    this.threads.set(record.threadId, list);
  }

  public getAllThreadIds(): { threadId: string; lastProfile: string; turnsCount: number; lastActive: string }[] {
    const result: { threadId: string; lastProfile: string; turnsCount: number; lastActive: string }[] = [];
    this.threads.forEach((checkpoints, threadId) => {
      const last = checkpoints[checkpoints.length - 1];
      result.push({
        threadId,
        lastProfile: last ? last.profileName : 'Unknown',
        turnsCount: checkpoints.length,
        lastActive: last ? last.timestamp : new Date().toISOString(),
      });
    });
    return result.sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());
  }

  public clearThread(threadId: string): void {
    this.threads.delete(threadId);
  }
}

// Global Singleton Checkpoint Manager
export const checkpointManagerStore = new CheckpointManager();
