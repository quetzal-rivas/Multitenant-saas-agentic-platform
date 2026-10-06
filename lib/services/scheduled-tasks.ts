import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import { nextRun } from '@/lib/agent/heartbeat-schedule';
import { TASK_COLUMNS } from './tasks';
import { createTeamSession, getTeam } from './teams';
import { postBoardTask } from './board';
import { dispatchRun, executeRun, claimRun, startRun, workerConfigured } from './agent-runs';
import { ServiceError, isServiceError } from './errors';

/**
 * Executes scheduled tasks. The minute tick claims due tasks with compare-and-set on
 * next_run_at (so concurrent ticks never double-run), starts an agent run for the task's
 * team in the task's own instance, and the worker runs it. When the run ends,
 * onTaskRunFinished records the result, retries failures and finally escalates to the
 * Supervisor Board.
 */

type Row = Record<string, any>;
const MAX_TASKS_PER_TICK = 5;
const SKIP_RETRY_MS = 5 * 60_000;

/** Runs execute as the organization's scheduler (full platform scopes, no member). */
function schedulerCtx(tenantId: string): AuthContext {
  return { tenantId, userId: 'scheduler', role: 'system', scopes: ['*'], authMode: 'webhook_signature' };
}

async function updateTask(id: string, fields: Row) {
  await getSupabaseAdminClient().from('supervisor_tasks').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id);
}

/** Start one occurrence. Returns the run id, or null when it was skipped/failed to start. */
export async function startTaskRun(task: Row, opts: { manual?: boolean } = {}): Promise<string | null> {
  const ctx = schedulerCtx(task.tenant_id);
  try {
    if (!task.team_id) throw new ServiceError('This task has no team. Edit it and pick the team that should run it.', 'INVALID');
    const team = await getTeam(ctx, task.team_id);
    let sessionId: string = task.session_id;
    if (!sessionId) {
      sessionId = (await createTeamSession(ctx, team.id, `Task · ${task.title}`.slice(0, 120))).id;
      await updateTask(task.id, { session_id: sessionId });
    }
    const run = await startRun(ctx, sessionId, task.description || task.title, { origin: 'task', teamId: team.id, taskId: task.id });
    await updateTask(task.id, { last_run_at: new Date().toISOString(), last_run_id: run.id, run_count: (task.run_count ?? 0) + 1 });
    if (workerConfigured()) {
      await dispatchRun(run.id);
    } else {
      // No worker (local development): run it here to completion.
      const owner = `inline-task:${run.id}`;
      if (await claimRun(run.id, owner, 30 * 60_000)) await executeRun(run.id, { owner, deadlineAt: Date.now() + 25 * 60_000 });
    }
    return run.id;
  } catch (err) {
    const message = isServiceError(err) ? err.message : (err as Error)?.message || 'Could not start the task.';
    if (isServiceError(err) && err.code === 'CONFLICT' && /still working/.test(message)) {
      // The previous occurrence is still running: skip this one.
      await updateTask(task.id, {
        last_status: 'skipped',
        last_error: 'Skipped: the previous run was still in progress.',
        ...(task.schedule || opts.manual ? {} : { status: 'scheduled', next_run_at: new Date(Date.now() + SKIP_RETRY_MS).toISOString() }),
      });
      return null;
    }
    if (!isServiceError(err)) console.error('[scheduled-tasks] could not start', task.id, err);
    await handleFailure(task, message);
    return null;
  }
}

/** Called by the minute tick. */
export async function processDueTasks(now = new Date()): Promise<Array<{ task_id: string; run_id: string | null }>> {
  const db = getSupabaseAdminClient();
  const { data: due } = await db
    .from('supervisor_tasks')
    .select(TASK_COLUMNS)
    .eq('status', 'scheduled')
    .eq('paused', false)
    .lte('next_run_at', now.toISOString())
    .order('next_run_at', { ascending: true })
    .limit(MAX_TASKS_PER_TICK);
  const out: Array<{ task_id: string; run_id: string | null }> = [];
  for (const task of due || []) {
    const following = task.schedule ? nextRun(task.schedule, now, now).toISOString() : null;
    // Compare-and-set: only the tick that moves next_run_at runs this occurrence.
    const { data: claimed } = await db
      .from('supervisor_tasks')
      .update({ next_run_at: following, ...(task.schedule ? {} : { status: 'active' }), updated_at: now.toISOString() })
      .eq('id', task.id)
      .eq('status', 'scheduled')
      .eq('next_run_at', task.next_run_at)
      .select('id');
    if (!claimed?.length) continue;
    out.push({ task_id: task.id, run_id: await startTaskRun({ ...task, next_run_at: following }) });
  }
  return out;
}

/** Manual "Run now" (does not change the schedule). */
export async function runTaskNow(ctx: Pick<AuthContext, 'tenantId'>, taskId: string) {
  const { data: task } = await getSupabaseAdminClient().from('supervisor_tasks').select(TASK_COLUMNS).eq('id', taskId).eq('tenant_id', ctx.tenantId).maybeSingle();
  if (!task) throw new ServiceError('Task not found in this organization.', 'NOT_FOUND');
  if (task.status === 'cancelled') throw new ServiceError('The task is cancelled.', 'CONFLICT');
  const runId = await startTaskRun(task, { manual: true });
  if (!runId) {
    const { data: after } = await getSupabaseAdminClient().from('supervisor_tasks').select('last_error').eq('id', taskId).maybeSingle();
    throw new ServiceError(after?.last_error || 'The task could not be started.', 'CONFLICT');
  }
  return { run_id: runId };
}

async function handleFailure(task: Row, error: string) {
  const attempt = (task.attempt ?? 0) + 1;
  const now = Date.now();
  if (attempt <= (task.max_retries ?? 2)) {
    const retryAt = new Date(now + (task.retry_delay_minutes ?? 5) * 60_000);
    const next = task.schedule && task.next_run_at && new Date(task.next_run_at) < retryAt ? task.next_run_at : retryAt.toISOString();
    await updateTask(task.id, { attempt, status: 'scheduled', next_run_at: next, last_status: 'error', last_error: error.slice(0, 2000) });
    return;
  }
  // Out of retries.
  if (task.escalate_to_board) {
    try {
      await postBoardTask(
        { tenantId: task.tenant_id, userId: 'scheduler', authMode: 'webhook_signature' },
        {
          title: `Scheduled task failed: ${task.title}`.slice(0, 200),
          description: [
            `The scheduled task "${task.title}" failed ${attempt} time(s).`,
            `Last error: ${error}`,
            `Instructions: ${task.description || '(none)'}`,
            task.last_run_id ? `Last run: ${task.last_run_id}` : '',
            'Fix the cause, then use "Run now" in the Task Calendar.',
          ].filter(Boolean).join('\n\n').slice(0, 10_000),
          priority: 'urgent',
          labels: ['scheduled-task', 'escalation'],
          ...(task.escalation_team_id ? { assigned_team_id: task.escalation_team_id } : {}),
        }
      );
    } catch (err) {
      console.error('[scheduled-tasks] escalation failed', task.id, err);
    }
  }
  await updateTask(task.id, {
    attempt: 0,
    last_status: task.escalate_to_board ? 'escalated' : 'error',
    last_error: error.slice(0, 2000),
    // A repeating task keeps its schedule; a one-off task ends here.
    ...(task.schedule
      ? { status: 'scheduled' }
      : { status: task.escalate_to_board ? 'escalated' : 'failed', next_run_at: null }),
  });
}

/** Hook from agent-runs when a task's run ends. */
export async function onTaskRunFinished(run: Row, status: 'ok' | 'error', detail: string | null, message?: string | null) {
  if (!run.task_id) return;
  const { data: task } = await getSupabaseAdminClient().from('supervisor_tasks').select(TASK_COLUMNS).eq('id', run.task_id).maybeSingle();
  if (!task || task.status === 'cancelled') return;
  if (status === 'ok') {
    await updateTask(task.id, {
      attempt: 0,
      last_status: 'ok',
      last_error: null,
      last_result: (message || '').slice(0, 4000),
      ...(task.schedule ? { status: 'scheduled' } : { status: 'completed', next_run_at: null }),
    });
    return;
  }
  await handleFailure(task, detail || 'The run failed.');
}
