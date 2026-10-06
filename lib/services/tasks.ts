import type { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import type { cancelTaskArgs, getTaskArgs, listTasksArgs, scheduleTaskArgs } from '@/lib/mcp/tool-catalog';
import { heartbeatScheduleSchema, nextRun, previewRuns, type HeartbeatSchedule } from '@/lib/agent/heartbeat-schedule';
import { assertActiveProfile } from './profiles';
import { getTeam } from './teams';
import { ServiceError, pageInfo } from './errors';

/**
 * Scheduled tasks: work a team runs at a time (one-off) or on a schedule (repeating).
 * When due, the minute tick starts an agent run for the task's team (see
 * lib/services/scheduled-tasks.ts). The tenant always comes from the caller.
 */

export const TASK_COLUMNS =
  'id, tenant_id, title, description, status, target_time, metadata, created_at, updated_at, team_id, session_id, schedule, next_run_at, paused, max_retries, retry_delay_minutes, attempt, escalate_to_board, escalation_team_id, last_run_at, last_status, last_error, last_result, last_run_id, run_count';

type Ctx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode' | 'apiKeyId'> & { teamId?: string | null };
type Row = Record<string, any>;

/** Task as returned to clients (no tenant id). */
export function presentTask(t: Row): Row & { instructions: string | null; repeating: boolean } {
  const { tenant_id: _t, ...rest } = t;
  return { ...rest, instructions: t.description, repeating: !!t.schedule };
}

async function loadTask(ctx: Ctx, id: string): Promise<Row> {
  const { data, error } = await getSupabaseAdminClient()
    .from('supervisor_tasks')
    .select(TASK_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (error) throw new Error(`Could not load task: ${error.message}`);
  if (!data) throw new ServiceError('Task not found in this organization. Call contextcontrol_list_tasks to see valid ids.', 'NOT_FOUND');
  return data;
}

export async function listTasks(ctx: Ctx, args: z.infer<typeof listTasksArgs>) {
  const limit = args.limit || 20;
  const offset = args.offset || 0;
  let query = getSupabaseAdminClient()
    .from('supervisor_tasks')
    .select(TASK_COLUMNS, { count: 'exact' })
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (args.status) query = query.eq('status', args.status);
  const { data, error, count } = await query;
  if (error) throw new Error(`Could not list scheduled tasks: ${error.message}`);
  return { tasks: (data || []).map(presentTask), ...pageInfo(count, offset, (data || []).length) };
}

export async function getTask(ctx: Ctx, args: z.infer<typeof getTaskArgs>) {
  return { task: presentTask(await loadTask(ctx, args.task_id)) };
}

/** Next due time for a task definition, or a clear error. */
function firstRun(targetTime: string | undefined, schedule: HeartbeatSchedule | undefined, now = new Date()): Date {
  if (schedule) return nextRun(schedule, now, now);
  const at = new Date(targetTime!);
  if (Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) {
    throw new ServiceError(`target_time must be in the future (server time is ${now.toISOString()}).`, 'INVALID');
  }
  return at;
}

export async function scheduleTask(ctx: Ctx, args: z.infer<typeof scheduleTaskArgs>) {
  const teamId = args.team_id ?? ctx.teamId ?? null;
  if (!teamId) throw new ServiceError('team_id is required: pick the team that should run this task (contextcontrol tools inside a team run default to that team).', 'INVALID');
  await getTeam(ctx, teamId); // must exist in this organization
  if (args.profile_id) await assertActiveProfile(ctx, args.profile_id);
  const schedule = args.schedule ? heartbeatScheduleSchema.parse(args.schedule) : undefined;
  const next = firstRun(args.target_time, schedule);

  const { data, error } = await getSupabaseAdminClient()
    .from('supervisor_tasks')
    .insert({
      tenant_id: ctx.tenantId,
      title: args.title,
      description: args.instructions,
      status: 'scheduled',
      target_time: (args.target_time ? new Date(args.target_time) : next).toISOString(),
      team_id: teamId,
      schedule: schedule ?? null,
      next_run_at: next.toISOString(),
      max_retries: args.max_retries ?? 2,
      retry_delay_minutes: 5,
      escalate_to_board: args.escalate_to_board ?? true,
      paused: false,
      attempt: 0,
      run_count: 0,
      metadata: {
        source: ctx.teamId ? `team:${ctx.teamId}` : ctx.authMode === 'api_key' ? 'platform_mcp' : ctx.authMode,
        profile_id: args.profile_id || null,
        created_by: ctx.userId,
      },
      updated_at: new Date().toISOString(),
    })
    .select(TASK_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not create scheduled task: ${error?.message || 'no task returned'}`);
  return { task: presentTask(data) };
}

export async function cancelTask(ctx: Ctx, args: z.infer<typeof cancelTaskArgs>) {
  const task = await loadTask(ctx, args.task_id);
  if (['completed', 'cancelled'].includes(task.status)) {
    throw new ServiceError(`The task is already ${task.status}. Call contextcontrol_get_task to check its status.`, 'CONFLICT');
  }
  const { data, error } = await getSupabaseAdminClient()
    .from('supervisor_tasks')
    .update({ status: 'cancelled', next_run_at: null, updated_at: new Date().toISOString() })
    .eq('id', task.id)
    .eq('tenant_id', ctx.tenantId)
    .select(TASK_COLUMNS)
    .maybeSingle();
  if (error || !data) throw new Error(`Could not cancel task: ${error?.message}`);
  return { task: presentTask(data) };
}

export interface TaskPatch {
  title?: string;
  instructions?: string;
  team_id?: string;
  target_time?: string | null;
  schedule?: HeartbeatSchedule | null;
  max_retries?: number;
  retry_delay_minutes?: number;
  escalate_to_board?: boolean;
  escalation_team_id?: string | null;
}

/** Edit a task; changing when it runs re-plans its next run. Finished tasks can be re-armed by giving a new time. */
export async function updateTask(ctx: Ctx, id: string, patch: TaskPatch) {
  const task = await loadTask(ctx, id);
  if (patch.team_id) await getTeam(ctx, patch.team_id);
  if (patch.escalation_team_id) await getTeam(ctx, patch.escalation_team_id);
  const fields: Row = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) fields.title = patch.title;
  if (patch.instructions !== undefined) fields.description = patch.instructions;
  if (patch.team_id !== undefined) fields.team_id = patch.team_id;
  if (patch.max_retries !== undefined) fields.max_retries = patch.max_retries;
  if (patch.retry_delay_minutes !== undefined) fields.retry_delay_minutes = patch.retry_delay_minutes;
  if (patch.escalate_to_board !== undefined) fields.escalate_to_board = patch.escalate_to_board;
  if (patch.escalation_team_id !== undefined) fields.escalation_team_id = patch.escalation_team_id;
  if (patch.schedule !== undefined || patch.target_time !== undefined) {
    const schedule = patch.schedule === undefined ? task.schedule : patch.schedule ? heartbeatScheduleSchema.parse(patch.schedule) : null;
    const target = patch.target_time === undefined ? task.target_time : patch.target_time;
    if (!schedule && !target) throw new ServiceError('Give a time (one-off) or a schedule (repeating).', 'INVALID');
    const next = firstRun(schedule ? undefined : target, schedule ?? undefined);
    Object.assign(fields, {
      schedule: schedule ?? null,
      target_time: (schedule ? next : new Date(target)).toISOString(),
      next_run_at: task.paused ? null : next.toISOString(),
      status: 'scheduled',
      attempt: 0,
    });
  }
  const { data, error } = await getSupabaseAdminClient()
    .from('supervisor_tasks')
    .update(fields)
    .eq('id', task.id)
    .eq('tenant_id', ctx.tenantId)
    .select(TASK_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not update task: ${error?.message}`);
  return { task: presentTask(data) };
}

export async function setTaskPaused(ctx: Ctx, id: string, paused: boolean) {
  const task = await loadTask(ctx, id);
  if (task.status !== 'scheduled') throw new ServiceError(`Only scheduled tasks can be ${paused ? 'paused' : 'resumed'} (this one is ${task.status}).`, 'CONFLICT');
  let next: string | null = null;
  if (!paused) {
    next = (task.schedule ? nextRun(task.schedule, new Date()) : new Date(Math.max(Date.now() + 60_000, new Date(task.target_time).getTime()))).toISOString();
  }
  const { data } = await getSupabaseAdminClient()
    .from('supervisor_tasks')
    .update({ paused, next_run_at: next, updated_at: new Date().toISOString() })
    .eq('id', task.id)
    .eq('tenant_id', ctx.tenantId)
    .select(TASK_COLUMNS)
    .single();
  return { task: presentTask(data!) };
}

/** Upcoming run times (repeating tasks: the next `count` occurrences). */
export function upcomingRuns(task: Row, count = 5, from = new Date()): string[] {
  if (task.paused || task.status !== 'scheduled') return [];
  if (task.schedule) return previewRuns(task.schedule, from, count).map((d) => d.toISOString());
  return task.next_run_at ? [task.next_run_at] : [];
}

export async function taskHistory(ctx: Ctx, id: string, limit = 20) {
  const task = await loadTask(ctx, id);
  const { data } = await getSupabaseAdminClient()
    .from('agent_runs')
    .select('id, status, progress, result, error, session_id, created_at, finished_at')
    .eq('task_id', task.id)
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return {
    runs: (data || []).map((r: Row) => ({
      run_id: r.id,
      status: r.status,
      session_id: r.session_id,
      started_at: r.created_at,
      finished_at: r.finished_at,
      steps: r.result?.usage?.steps ?? r.progress?.step ?? 0,
      tools: (r.result?.tool_executions || []).map((t: Row) => t.toolName),
      message: r.result?.message ?? null,
      error: r.error ?? null,
    })),
  };
}

/** Calendar/legacy shape used by older clients of GET /api/v1/tasks. */
export function toCalendarTask(t: Row) {
  return { ...presentTask(t), scheduled_at: t.next_run_at ?? t.target_time };
}
