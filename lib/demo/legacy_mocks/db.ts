/**
 * Backend/db.ts - State Logging & Supabase Postgres Persistence
 * 
 * Logs task status (scheduled/queued/running/completed/failed/escalated)
 * to a durable store backed by Supabase Postgres (`public.ephemeral_context` table)
 */

import fs from 'fs';
import path from 'path';
import { supabase } from './supabase';

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
  fallback_tool: string;
  escalation_instructions: string;
  contact_overrides?: Record<string, string>;
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
  scheduled_at: string;
  created_at: string;
  updated_at: string;
  status: TaskStatus;
  allowed_tools: string[];
  fallback_policy: FallbackPolicy;
  tenant_id: string;
  simulate_failure?: boolean;
  is_simulation?: boolean;
  calendar_event_id?: string;
  category?: 'email' | 'voice' | 'calendar' | 'maintenance' | 'audit';
  execution_result?: TaskExecutionResult;
}

const STORAGE_DIR = path.join(process.cwd(), 'data');
const STORAGE_FILE = path.join(STORAGE_DIR, 'durable_tasks.json');

const INITIAL_TASKS: ScheduledTask[] = [
  {
    id: 'task_exec_weekly_summary',
    title: 'Executive Weekly Briefing via Gmail',
    instructions: 'Fetch key metric highlights from team channels, compile into an executive summary markdown, and send to boss via Gmail.',
    scheduled_at: new Date(Date.now() + 1000 * 60 * 15).toISOString(),
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
    tenant_id: '00000000-0000-0000-0000-000000000001',
    category: 'email',
    simulate_failure: false,
  },
  {
    id: 'task_exec_database_checkpoint',
    title: 'Off-Peak Database Wal Archival',
    instructions: 'Trigger checkpoint snapshot on primary cluster and notify Slack devops-alerts channel.',
    scheduled_at: new Date(Date.now() + 1000 * 60 * 60 * 3).toISOString(),
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
    tenant_id: '00000000-0000-0000-0000-000000000001',
    category: 'maintenance',
    simulate_failure: false,
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
        for (const t of INITIAL_TASKS) {
          this.tasks.set(t.id, t);
        }
        this.saveToFile();
      }
    } catch (err) {
      console.warn('[db.ts] Failed to load local file storage, using defaults:', err);
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

  private syncTaskToSupabase(task: ScheduledTask) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(task.tenant_id);
    const tenantId = isUuid ? task.tenant_id : '00000000-0000-0000-0000-000000000001';

    const payload = {
      task_id: task.id,
      tenant_id: tenantId,
      assigned_agent: task.category || 'Lead Agent',
      target_time: task.scheduled_at,
      primary_instructions: task.instructions,
      tools_whitelist: task.allowed_tools || [],
      edge_case_policies: task.fallback_policy || {},
      status: task.status.toLowerCase(),
      execution_result: task.execution_result || null,
      updated_at: new Date().toISOString(),
    };

    (async () => {
      try {
        const { error } = await supabase
          .from('ephemeral_context')
          .upsert(payload, { onConflict: 'task_id' });
        if (error) console.warn('[db.ts] Supabase sync status:', error.message);
      } catch (err) {
        console.warn('[db.ts] Supabase sync error:', err);
      }
    })();
  }

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

  public getTaskById(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId);
  }

  public getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId);
  }

  public saveTask(task: ScheduledTask): ScheduledTask {
    task.updated_at = new Date().toISOString();
    this.tasks.set(task.id, task);
    this.saveToFile();
    this.syncTaskToSupabase(task);
    return task;
  }

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
    this.syncTaskToSupabase(existing);
    return existing;
  }

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
    this.syncTaskToSupabase(task);
  }

  public deleteTask(taskId: string): boolean {
    const res = this.tasks.delete(taskId);
    if (res) {
      this.saveToFile();
      (async () => {
        try {
          await supabase.from('ephemeral_context').delete().eq('task_id', taskId);
        } catch {}
      })();
    }
    return res;
  }

  public resetToDefaults(): ScheduledTask[] {
    this.tasks.clear();
    for (const t of INITIAL_TASKS) {
      this.tasks.set(t.id, { ...t });
      this.syncTaskToSupabase(t);
    }
    this.saveToFile();
    return this.getAllTasks();
  }
}

export const db = new DatabaseManager();
