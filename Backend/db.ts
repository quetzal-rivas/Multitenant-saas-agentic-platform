/**
 * Backend/db.ts - State Logging & Supabase Postgres Persistence
 * 
 * Logs task status (scheduled/queued/running/completed/failed/escalated)
 * to a durable store mimicking Supabase Postgres tables:
 * - `tasks`: Primary scheduled task definitions and configurations
 * - `task_executions`: Historical execution traces and node transitions
 * - `task_logs`: Real-time streaming log lines per node step
 * - `fallback_events`: Recorded escalation instances when primary tools fail
 */

import fs from 'fs';
import path from 'path';

export type TaskStatus = 
  | 'SCHEDULED' 
  | 'QUEUED' 
  | 'RUNNING' 
  | 'COMPLETED' 
  | 'FAILED' 
  | 'ESCALATED' 
  | 'CANCELLED';

export interface FallbackPolicy {
  on_failure: 'escalate' | 'retry' | 'abort';
  fallback_tool: string; // e.g. 'elevenlabs_trigger_call'
  escalation_instructions: string; // e.g. "Trigger an immediate voice call to alert the team lead"
  contact_overrides?: Record<string, string>; // e.g. { "boss": "+1 (555) 234-5678", "client": "ceo@venture.com" }
  max_retries?: number;
}

export interface ReasoningStep {
  node: 'intake_and_plan' | 'execute_primary_action' | 'verify_outcome' | 'escalate_and_fallback' | 'complete_task';
  action: string;
  status: 'SUCCESS' | 'FAILED' | 'INFO';
  timestamp: string;
  details?: Record<string, any>;
}

export interface TaskExecutionResult {
  started_at: string;
  completed_at?: string;
  primary_tool_used?: string;
  primary_tool_status?: 'SUCCESS' | 'FAILED';
  primary_tool_output?: string;
  primary_error?: string;
  escalation_triggered: boolean;
  fallback_tool_used?: string;
  fallback_tool_output?: string;
  reasoning_steps: ReasoningStep[];
  final_summary?: string;
}

export interface ScheduledTask {
  id: string;
  title: string;
  instructions: string;
  scheduled_at: string; // ISO timestamp for deferred execution
  created_at: string;
  updated_at: string;
  status: TaskStatus;
  allowed_tools: string[];
  fallback_policy: FallbackPolicy;
  tenant_id: string;
  simulate_failure?: boolean; // Demo flag to trigger escalation
  is_simulation?: boolean; // Isolation flag: true for sandboxed simulator runs
  calendar_event_id?: string; // Associated calendar slot
  category?: 'email' | 'voice' | 'calendar' | 'maintenance' | 'audit';
  execution_result?: TaskExecutionResult;
}

// In-memory cache + persistent WAL file path
const STORAGE_DIR = path.join(process.cwd(), 'data');
const STORAGE_FILE = path.join(STORAGE_DIR, 'durable_tasks.json');

// Default initial tasks to populate user workspace with rich real examples
const INITIAL_TASKS: ScheduledTask[] = [
  {
    id: 'task_exec_weekly_summary',
    title: 'Executive Weekly Briefing via Gmail',
    instructions: 'Fetch key metric highlights from team channels, compile into an executive summary markdown, and send to boss via Gmail.',
    scheduled_at: new Date(Date.now() + 1000 * 60 * 15).toISOString(), // 15 mins in future
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    status: 'SCHEDULED',
    allowed_tools: ['gmail_send_message', 'calendar_list_events', 'elevenlabs_trigger_call'],
    fallback_policy: {
      on_failure: 'escalate',
      fallback_tool: 'elevenlabs_trigger_call',
      escalation_instructions: 'If email delivery fails or bounces, immediately call boss phone to deliver a 30-second audio summary.',
      contact_overrides: {
        boss: '+1 (555) 438-9021',
        email: 'vp.operations@acme-global.internal',
      },
      max_retries: 1,
    },
    tenant_id: 'tenant_enterprise_corp',
    category: 'email',
    simulate_failure: false,
  },
  {
    id: 'task_exec_database_checkpoint',
    title: 'Off-Peak Database Wal Archival',
    instructions: 'Trigger checkpoint snapshot on primary cluster and notify Slack devops-alerts channel.',
    scheduled_at: new Date(Date.now() + 1000 * 60 * 60 * 3).toISOString(), // 3 hours in future
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    status: 'SCHEDULED',
    allowed_tools: ['slack_post_message', 'elevenlabs_trigger_call'],
    fallback_policy: {
      on_failure: 'escalate',
      fallback_tool: 'elevenlabs_trigger_call',
      escalation_instructions: 'Page on-call engineer via voice call if snapshot is delayed beyond 60 seconds.',
      contact_overrides: {
        on_call: '+1 (555) 912-3344',
      },
      max_retries: 2,
    },
    tenant_id: 'tenant_enterprise_corp',
    category: 'maintenance',
    simulate_failure: false,
  },
  {
    id: 'task_exec_prior_completed_sync',
    title: 'Customer Onboarding Calendar Sync',
    instructions: 'Schedule technical kickoff meeting with Enterprise Client and invite Solutions Architect.',
    scheduled_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 118).toISOString(),
    status: 'COMPLETED',
    allowed_tools: ['calendar_create_event', 'gmail_send_message'],
    fallback_policy: {
      on_failure: 'escalate',
      fallback_tool: 'elevenlabs_trigger_call',
      escalation_instructions: 'Call account executive if meeting slot conflicts.',
      contact_overrides: {
        ae: '+1 (555) 778-1200',
      },
    },
    tenant_id: 'tenant_enterprise_corp',
    category: 'calendar',
    execution_result: {
      started_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      completed_at: new Date(Date.now() - 1000 * 60 * 118).toISOString(),
      primary_tool_used: 'calendar_create_event',
      primary_tool_status: 'SUCCESS',
      primary_tool_output: 'Calendar event created: "Enterprise Technical Kickoff" for tomorrow at 10:00 AM PST with 4 attendees.',
      escalation_triggered: false,
      reasoning_steps: [
        {
          node: 'intake_and_plan',
          action: 'Parsed scheduled task requirements and resolved calendar availability',
          status: 'SUCCESS',
          timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
        },
        {
          node: 'execute_primary_action',
          action: 'Invoked calendar_create_event via MCP stdio client',
          status: 'SUCCESS',
          timestamp: new Date(Date.now() - 1000 * 60 * 119).toISOString(),
        },
        {
          node: 'verify_outcome',
          action: 'Confirmed event ID ev_829312 is confirmed and invites sent',
          status: 'SUCCESS',
          timestamp: new Date(Date.now() - 1000 * 60 * 118).toISOString(),
        },
        {
          node: 'complete_task',
          action: 'Task finalized successfully without escalation',
          status: 'SUCCESS',
          timestamp: new Date(Date.now() - 1000 * 60 * 118).toISOString(),
        },
      ],
      final_summary: 'Calendar kickoff successfully booked on calendar with zero conflict.',
    },
  },
];

class DatabaseManager {
  private tasks: Map<string, ScheduledTask> = new Map();

  constructor() {
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
      }

      if (fs.existsSync(STORAGE_FILE)) {
        const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
        const parsed: ScheduledTask[] = JSON.parse(raw);
        for (const t of parsed) {
          this.tasks.set(t.id, t);
        }
      } else {
        // Populate default demo tasks
        for (const t of INITIAL_TASKS) {
          this.tasks.set(t.id, t);
        }
        this.saveToFile();
      }
    } catch (err) {
      console.warn('[db.ts] Failed to load durable file storage, initializing in-memory store:', err);
      for (const t of INITIAL_TASKS) {
        this.tasks.set(t.id, t);
      }
    }
  }

  private saveToFile() {
    try {
      if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
      }
      const data = Array.from(this.tasks.values());
      fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[db.ts] Error persisting tasks to disk:', err);
    }
  }

  // Retrieve all tasks (filters out is_simulation tasks by default to protect production telemetry views)
  public getAllTasks(tenantId?: string, includeSimulation: boolean = false): ScheduledTask[] {
    let list = Array.from(this.tasks.values());
    if (!includeSimulation) {
      list = list.filter((t) => !t.is_simulation);
    }
    if (tenantId) {
      list = list.filter((t) => !t.tenant_id || t.tenant_id === tenantId);
    }
    return list.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }

  // Get task by ID
  public getTaskById(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId);
  }

  public getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId);
  }

  // Create/Upsert scheduled task
  public saveTask(task: ScheduledTask): ScheduledTask {
    task.updated_at = new Date().toISOString();
    this.tasks.set(task.id, task);
    this.saveToFile();
    return task;
  }

  // Update status and optional execution log
  public updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    executionResultUpdate?: Partial<TaskExecutionResult>
  ): ScheduledTask | undefined {
    const existing = this.tasks.get(taskId);
    if (!existing) return undefined;

    existing.status = status;
    existing.updated_at = new Date().toISOString();

    if (executionResultUpdate) {
      existing.execution_result = {
        started_at: existing.execution_result?.started_at || new Date().toISOString(),
        escalation_triggered: false,
        reasoning_steps: existing.execution_result?.reasoning_steps || [],
        ...existing.execution_result,
        ...executionResultUpdate,
      };
    }

    this.tasks.set(taskId, existing);
    this.saveToFile();
    return existing;
  }

  // Add step to reasoning log
  public appendReasoningStep(taskId: string, step: ReasoningStep): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    if (!task.execution_result) {
      task.execution_result = {
        started_at: new Date().toISOString(),
        escalation_triggered: false,
        reasoning_steps: [],
      };
    }

    task.execution_result.reasoning_steps.push(step);
    task.updated_at = new Date().toISOString();
    this.tasks.set(taskId, task);
    this.saveToFile();
  }

  // Delete task
  public deleteTask(taskId: string): boolean {
    const res = this.tasks.delete(taskId);
    if (res) this.saveToFile();
    return res;
  }

  // Reset demo tasks
  public resetToDefaults(): ScheduledTask[] {
    this.tasks.clear();
    for (const t of INITIAL_TASKS) {
      this.tasks.set(t.id, { ...t });
    }
    this.saveToFile();
    return this.getAllTasks();
  }
}

export const db = new DatabaseManager();
