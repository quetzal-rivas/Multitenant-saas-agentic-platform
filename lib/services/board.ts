import type { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import type {
  boardClaimArgs,
  boardCompleteArgs,
  boardFailArgs,
  boardGetArgs,
  boardHandoverArgs,
  boardListArgs,
  boardNoteArgs,
  boardPostArgs,
  boardReleaseArgs,
  boardRenewArgs,
  boardRequestHandoverArgs,
} from '@/lib/mcp/tool-catalog';
import { ServiceError, pageInfo } from './errors';

/**
 * Supervisor Board: per-organization tasks that teams claim with time-limited leases.
 * A claim whose lease has passed counts as claimable again; that is computed when
 * tasks are read or claimed, so no background job is needed. Every claim uses
 * compare-and-set, so two callers can never hold the same task.
 *
 * In agent runs a claim belongs to the run (`claim_run_id`), so two runs of the same
 * team cannot both act on it. When a run ends its claims are parked (run id cleared)
 * and any later run of that team may resume them. Work is never silently discarded:
 * holders leave progress notes, hand tasks over on request, and a result submitted
 * after losing the task is kept as a late result for the next holder.
 */

export type BoardCtx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode' | 'apiKeyId'> & {
  teamId?: string | null;
  runId?: string | null;
};

export const DEFAULT_LEASE_MINUTES = 30;
/** Boards are small; list views load at most this many matching tasks. */
const LIST_CAP = 500;
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

const TASK_COLUMNS =
  'id, title, description, priority, labels, status, assigned_team_id, posted_by, posted_by_team_id, claimed_by, claimed_by_team_id, claimed_at, lease_expires_at, attempts, result, result_data, failure_reason, due_at, completed_at, created_at, updated_at, claim_run_id, handoff_note, handover_requested_by, handover_requested_by_team_id, handover_requested_at, late_result, late_result_by';

type Row = Record<string, any>;

/** Who is acting: the team in a team run, else the API key, else the signed-in user. */
export function boardActor(ctx: BoardCtx): string {
  if (ctx.teamId) return `team:${ctx.teamId}`;
  if (ctx.authMode === 'api_key' && ctx.apiKeyId) return `api_key:${ctx.apiKeyId}`;
  if (ctx.authMode === 'session') return `user:${ctx.userId}`;
  return `system:${ctx.userId}`;
}

function leaseExpired(task: Row, now = new Date()): boolean {
  return task.status === 'claimed' && !!task.lease_expires_at && new Date(task.lease_expires_at) <= now;
}

/** Claimed by this actor but no run is working on it (its run ended): the actor may resume it. */
function parkedFor(task: Row, actor?: string): boolean {
  return !!actor && task.status === 'claimed' && task.claimed_by === actor && !task.claim_run_id;
}

/**
 * Task plus derived fields agents and the UI rely on. With `actor`, `claimable` also
 * covers tasks parked for that actor (resumable).
 */
export function present(task: Row, now = new Date(), actor?: string): Row & { lease_expired: boolean; claimable: boolean } {
  const expired = leaseExpired(task, now);
  return { ...task, lease_expired: expired, claimable: task.status === 'open' || expired || parkedFor(task, actor) };
}

function minutesFromNow(minutes: number, now = new Date()): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

async function logEvent(ctx: BoardCtx, taskId: string, event: string, actor: string, note?: string | null) {
  await getSupabaseAdminClient()
    .from('board_task_events')
    .insert({ task_id: taskId, tenant_id: ctx.tenantId, event, actor, note: note ?? null });
}

async function loadTask(ctx: BoardCtx, taskId: string): Promise<Row> {
  const { data, error } = await getSupabaseAdminClient()
    .from('board_tasks')
    .select(TASK_COLUMNS)
    .eq('id', taskId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (error) throw new Error(`Could not load board task: ${error.message}`);
  if (!data) throw new ServiceError('Board task not found in this organization. Call contextcontrol_board_list_tasks to see valid ids.', 'NOT_FOUND');
  return data;
}

async function assertTeam(ctx: BoardCtx, teamId: string) {
  const { data } = await getSupabaseAdminClient()
    .from('agent_teams')
    .select('id')
    .eq('id', teamId)
    .eq('tenant_id', ctx.tenantId)
    .is('archived_at', null)
    .maybeSingle();
  if (!data) throw new ServiceError('assigned_team_id is not a team in this organization.', 'NOT_FOUND');
}

/** Apply a guarded update; returns the row, or null when the guard no longer matched. */
async function guardedUpdate(ctx: BoardCtx, taskId: string, guard: Record<string, string | null>, patch: Row): Promise<Row | null> {
  let query = getSupabaseAdminClient()
    .from('board_tasks')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('tenant_id', ctx.tenantId);
  for (const [column, value] of Object.entries(guard)) query = value === null ? query.is(column, null) : query.eq(column, value);
  const { data, error } = await query.select(TASK_COLUMNS);
  if (error) throw new Error(`Could not update board task: ${error.message}`);
  return data?.[0] ?? null;
}

const CLEAR_HANDOVER = { handover_requested_by: null, handover_requested_by_team_id: null, handover_requested_at: null };
const CLEAR_CLAIM = { claimed_by: null, claimed_by_team_id: null, claimed_at: null, lease_expires_at: null, claim_run_id: null, ...CLEAR_HANDOVER };

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listBoardTasks(ctx: BoardCtx, args: z.infer<typeof boardListArgs>) {
  const now = new Date();
  let query = getSupabaseAdminClient()
    .from('board_tasks')
    .select(TASK_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
    .limit(LIST_CAP);
  if (args.status && args.status !== 'claimable') query = query.eq('status', args.status);
  if (args.priority) query = query.eq('priority', args.priority);
  if (args.assigned_to_me) {
    if (!ctx.teamId) throw new ServiceError('assigned_to_me only works inside a team run.', 'INVALID');
    query = query.eq('assigned_team_id', ctx.teamId);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Could not list board tasks: ${error.message}`);

  const actor = boardActor(ctx);
  let rows = (data || []).map((t) => present(t, now, actor));
  if (args.label) rows = rows.filter((t) => (t.labels || []).includes(args.label));
  if (args.status === 'claimable') {
    // Claimable for *this* caller: not assigned to a different team (own parked claims included).
    rows = rows.filter((t) => t.claimable && (!t.assigned_team_id || t.assigned_team_id === ctx.teamId || t.claimed_by === actor));
  }
  const workQueue = args.status === 'claimable' || args.status === 'open';
  rows.sort((a, b) =>
    (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
    (workQueue ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at))
  );

  const limit = args.limit || 20;
  const offset = args.offset || 0;
  const tasks = rows.slice(offset, offset + limit);
  return { tasks, ...pageInfo(rows.length, offset, tasks.length) };
}

export async function getBoardTask(ctx: BoardCtx, args: z.infer<typeof boardGetArgs>) {
  const task = await loadTask(ctx, args.task_id);
  const { data: events } = await getSupabaseAdminClient()
    .from('board_task_events')
    .select('event, actor, note, created_at')
    .eq('task_id', args.task_id)
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: true });
  return { task: present(task, new Date(), boardActor(ctx)), events: events || [] };
}

// ---------------------------------------------------------------------------
// Agent actions
// ---------------------------------------------------------------------------

export async function postBoardTask(ctx: BoardCtx, args: z.infer<typeof boardPostArgs>) {
  if (args.assigned_team_id) await assertTeam(ctx, args.assigned_team_id);
  const actor = boardActor(ctx);
  const { data, error } = await getSupabaseAdminClient()
    .from('board_tasks')
    .insert({
      tenant_id: ctx.tenantId,
      title: args.title,
      description: args.description ?? null,
      priority: args.priority ?? 'normal',
      labels: args.labels ?? [],
      assigned_team_id: args.assigned_team_id ?? null,
      due_at: args.due_at ?? null,
      posted_by: actor,
      posted_by_team_id: ctx.teamId ?? null,
      status: 'open',
    })
    .select(TASK_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not post board task: ${error?.message}`);
  await logEvent(ctx, data.id, 'posted', actor);
  return { task: present(data) };
}

export async function claimBoardTask(ctx: BoardCtx, args: z.infer<typeof boardClaimArgs>) {
  const now = new Date();
  const actor = boardActor(ctx);
  const runId = ctx.runId ?? null;
  const task = await loadTask(ctx, args.task_id);
  const lease = minutesFromNow(args.lease_minutes ?? DEFAULT_LEASE_MINUTES, now);

  if (['done', 'failed', 'cancelled'].includes(task.status)) {
    throw new ServiceError(`Task is ${task.status} and cannot be claimed.`, 'CONFLICT');
  }

  // Our own claim: resume it if parked, otherwise explain who is working on it.
  if (task.status === 'claimed' && task.claimed_by === actor) {
    if ((task.claim_run_id ?? null) === runId) {
      throw new ServiceError('You already hold this task. Use contextcontrol_board_renew_lease to extend it.', 'CONFLICT');
    }
    if (task.claim_run_id && !leaseExpired(task, now)) {
      throw new ServiceError(
        `Another run of your team is working on this task until ${task.lease_expires_at}. Pick other work, or call contextcontrol_board_request_handover.`,
        'CONFLICT'
      );
    }
    const resumed = await guardedUpdate(
      ctx,
      task.id,
      { status: 'claimed', claimed_by: actor, claim_run_id: task.claim_run_id ?? null },
      { claim_run_id: runId, lease_expires_at: lease }
    );
    if (!resumed) throw new ServiceError('The task changed a moment ago. Fetch it again with contextcontrol_board_get_task.', 'CONFLICT');
    await logEvent(ctx, task.id, 'resumed', actor, `lease until ${lease}`);
    return { task: present(resumed, now, actor) };
  }

  if (task.assigned_team_id && task.assigned_team_id !== ctx.teamId) {
    throw new ServiceError('Task is assigned to another team. Call contextcontrol_board_list_tasks with status="claimable" for tasks you can take.', 'FORBIDDEN');
  }
  if (task.status === 'claimed' && !leaseExpired(task, now)) {
    throw new ServiceError(
      `Task is claimed by ${task.claimed_by} until ${task.lease_expires_at}. Call contextcontrol_board_list_tasks with status="claimable" for other work, or contextcontrol_board_request_handover to ask for it.`,
      'CONFLICT'
    );
  }

  const claim = {
    status: 'claimed',
    claimed_by: actor,
    claimed_by_team_id: ctx.teamId ?? null,
    claim_run_id: runId,
    claimed_at: now.toISOString(),
    lease_expires_at: lease,
    attempts: (task.attempts ?? 0) + 1,
    ...CLEAR_HANDOVER,
  };
  // Compare-and-set: only succeeds if nobody changed the task since we read it.
  const guard: Record<string, string> = task.status === 'open'
    ? { status: 'open' }
    : { status: 'claimed', lease_expires_at: String(task.lease_expires_at) };
  const updated = await guardedUpdate(ctx, task.id, guard, claim);
  if (!updated) throw new ServiceError('Someone claimed this task a moment ago. Pick another claimable task.', 'CONFLICT');

  if (task.status === 'claimed') await logEvent(ctx, task.id, 'lease_expired', task.claimed_by, 'Lease expired; task was reclaimed.');
  await logEvent(ctx, task.id, 'claimed', actor, `lease until ${lease}`);
  return { task: present(updated, now, actor) };
}

/** True when the caller (this actor and, in agent runs, this run or a parked claim) holds the task. */
function isHolder(ctx: BoardCtx, task: Row, actor: string): boolean {
  if (task.status !== 'claimed' || task.claimed_by !== actor) return false;
  return !task.claim_run_id || task.claim_run_id === (ctx.runId ?? null);
}

async function holderOnly(ctx: BoardCtx, taskId: string): Promise<{ task: Row; actor: string; guard: Record<string, string | null> }> {
  const actor = boardActor(ctx);
  const task = await loadTask(ctx, taskId);
  if (!isHolder(ctx, task, actor)) {
    if (task.status !== 'claimed') {
      throw new ServiceError(`Task is ${task.status}; claim it first with contextcontrol_board_claim_task.`, 'CONFLICT');
    }
    throw new ServiceError(
      task.claimed_by === actor
        ? 'Another run of your team holds this task. Call contextcontrol_board_request_handover, or pick other work.'
        : `Only the current holder (${task.claimed_by}) can do that. Call contextcontrol_board_request_handover to ask for it.`,
      'FORBIDDEN'
    );
  }
  return { task, actor, guard: { status: 'claimed', claimed_by: actor, claim_run_id: task.claim_run_id ?? null } };
}

const LOST = 'You no longer hold this task.';

export async function renewBoardLease(ctx: BoardCtx, args: z.infer<typeof boardRenewArgs>) {
  const { task, actor, guard } = await holderOnly(ctx, args.task_id);
  const lease = minutesFromNow(args.lease_minutes ?? DEFAULT_LEASE_MINUTES);
  const updated = await guardedUpdate(ctx, task.id, guard, {
    lease_expires_at: lease,
    claim_run_id: ctx.runId ?? null,
    ...(args.note ? { handoff_note: args.note } : {}),
  });
  if (!updated) throw new ServiceError(LOST, 'CONFLICT');
  await logEvent(ctx, task.id, 'renewed', actor, `lease until ${lease}`);
  if (args.note) await logEvent(ctx, task.id, 'note', actor, args.note);
  return { task: present(updated, new Date(), actor) };
}

export async function addBoardNote(ctx: BoardCtx, args: z.infer<typeof boardNoteArgs>) {
  const { task, actor, guard } = await holderOnly(ctx, args.task_id);
  const updated = await guardedUpdate(ctx, task.id, guard, { handoff_note: args.note, claim_run_id: ctx.runId ?? null });
  if (!updated) throw new ServiceError(LOST, 'CONFLICT');
  await logEvent(ctx, task.id, 'note', actor, args.note);
  return { task: present(updated, new Date(), actor) };
}

/** Whether this actor ever held the task (claimed or resumed it). */
async function everHeld(ctx: BoardCtx, taskId: string, actor: string): Promise<boolean> {
  const { data } = await getSupabaseAdminClient()
    .from('board_task_events')
    .select('event')
    .eq('task_id', taskId)
    .eq('tenant_id', ctx.tenantId)
    .eq('actor', actor);
  return (data || []).some((e: Row) => e.event === 'claimed' || e.event === 'resumed');
}

export async function completeBoardTask(ctx: BoardCtx, args: z.infer<typeof boardCompleteArgs>) {
  const actor = boardActor(ctx);
  const task = await loadTask(ctx, args.task_id);

  if (isHolder(ctx, task, actor)) {
    const updated = await guardedUpdate(ctx, task.id, { status: 'claimed', claimed_by: actor, claim_run_id: task.claim_run_id ?? null }, {
      status: 'done',
      result: args.result,
      result_data: args.result_data ?? null,
      completed_at: new Date().toISOString(),
      lease_expires_at: null,
      ...CLEAR_HANDOVER,
    });
    if (updated) {
      await logEvent(ctx, task.id, 'completed', actor);
      return { task: present(updated, new Date(), actor), late: false };
    }
  }

  if (task.status === 'claimed' && task.claimed_by === actor && task.claim_run_id && !leaseExpired(task)) {
    throw new ServiceError('Another run of your team holds this task and is still working on it. Pick other work.', 'CONFLICT');
  }
  // Not (or no longer) the holder. Keep the work rather than discarding it.
  if (!(await everHeld(ctx, task.id, actor))) {
    throw new ServiceError(`Only the current holder (${task.claimed_by ?? 'nobody'}) can complete this task. Claim it first.`, 'FORBIDDEN');
  }
  const current = await loadTask(ctx, task.id);
  if (['done', 'cancelled', 'failed'].includes(current.status)) {
    await logEvent(ctx, task.id, 'late_result', actor, args.result.slice(0, 4000));
    return {
      task: present(current, new Date(), actor),
      late: true,
      message: `${LOST} It is already ${current.status}; your result was recorded in the task history. Do not redo it.`,
    };
  }
  const updated = await guardedUpdate(ctx, task.id, { status: current.status }, { late_result: args.result, late_result_by: actor });
  if (!updated) throw new ServiceError('The task changed a moment ago. Try again.', 'CONFLICT');
  await logEvent(ctx, task.id, 'late_result', actor, args.result.slice(0, 4000));
  return {
    task: present(updated, new Date(), actor),
    late: true,
    message: `${LOST} Your result was saved as a late result; whoever holds the task next sees it and can complete with it. Do not redo it.`,
  };
}

export async function failBoardTask(ctx: BoardCtx, args: z.infer<typeof boardFailArgs>) {
  const { task, actor, guard } = await holderOnly(ctx, args.task_id);
  const patch = args.retry
    ? { status: 'open', failure_reason: args.reason, ...CLEAR_CLAIM }
    : { status: 'failed', failure_reason: args.reason, completed_at: new Date().toISOString(), lease_expires_at: null, ...CLEAR_HANDOVER };
  const updated = await guardedUpdate(ctx, task.id, guard, patch);
  if (!updated) throw new ServiceError(LOST, 'CONFLICT');
  await logEvent(ctx, task.id, 'failed', actor, args.retry ? `${args.reason} (back on the board)` : args.reason);
  return { task: present(updated) };
}

export async function releaseBoardTask(ctx: BoardCtx, args: z.infer<typeof boardReleaseArgs>) {
  const { task, actor, guard } = await holderOnly(ctx, args.task_id);
  const updated = await guardedUpdate(ctx, task.id, guard, {
    status: 'open',
    ...CLEAR_CLAIM,
    ...(args.note ? { handoff_note: args.note } : {}),
  });
  if (!updated) throw new ServiceError(LOST, 'CONFLICT');
  await logEvent(ctx, task.id, 'released', actor, args.note);
  return { task: present(updated) };
}

export async function requestBoardHandover(ctx: BoardCtx, args: z.infer<typeof boardRequestHandoverArgs>) {
  const now = new Date();
  const actor = boardActor(ctx);
  const task = await loadTask(ctx, args.task_id);
  if (task.status !== 'claimed') {
    throw new ServiceError(`Task is ${task.status}; nobody holds it.${task.status === 'open' ? ' Claim it directly with contextcontrol_board_claim_task.' : ''}`, 'CONFLICT');
  }
  if (leaseExpired(task, now)) throw new ServiceError('The lease has expired; claim it directly with contextcontrol_board_claim_task.', 'CONFLICT');
  if (isHolder(ctx, task, actor)) throw new ServiceError('You already hold this task.', 'CONFLICT');
  if (task.assigned_team_id && task.assigned_team_id !== ctx.teamId) {
    throw new ServiceError('Task is assigned to another team.', 'FORBIDDEN');
  }
  if (task.handover_requested_by && task.handover_requested_by !== actor) {
    throw new ServiceError(`${task.handover_requested_by} already asked for this task. Pick other work.`, 'CONFLICT');
  }
  const updated = await guardedUpdate(
    ctx,
    task.id,
    { status: 'claimed', claimed_by: task.claimed_by },
    { handover_requested_by: actor, handover_requested_by_team_id: ctx.teamId ?? null, handover_requested_at: now.toISOString() }
  );
  if (!updated) throw new ServiceError('The task changed a moment ago. Fetch it again.', 'CONFLICT');
  await logEvent(ctx, task.id, 'handover_requested', actor, args.reason);
  return {
    task: present(updated, now, actor),
    message: `Requested. ${task.claimed_by} sees the request on its next board call; otherwise the task becomes claimable at ${task.lease_expires_at}.`,
  };
}

export async function handoverBoardTask(ctx: BoardCtx, args: z.infer<typeof boardHandoverArgs>) {
  const { task, actor, guard } = await holderOnly(ctx, args.task_id);
  if (!task.handover_requested_by) {
    throw new ServiceError('Nobody asked for this task. Use contextcontrol_board_release_task with a note to give it back to the board.', 'CONFLICT');
  }
  const now = new Date();
  const updated = await guardedUpdate(ctx, task.id, guard, {
    claimed_by: task.handover_requested_by,
    claimed_by_team_id: task.handover_requested_by_team_id ?? null,
    claim_run_id: null, // parked for the requester: any of its runs resumes it with claim_task
    claimed_at: now.toISOString(),
    lease_expires_at: minutesFromNow(DEFAULT_LEASE_MINUTES, now),
    handoff_note: args.summary,
    ...CLEAR_HANDOVER,
  });
  if (!updated) throw new ServiceError(LOST, 'CONFLICT');
  await logEvent(ctx, task.id, 'handed_over', actor, `to ${task.handover_requested_by}: ${args.summary}`);
  return { task: present(updated, now, actor) };
}

/** Called when an agent run ends: its claims stay with the team but are parked for the next run. */
export async function parkRunClaims(tenantId: string, runId: string): Promise<void> {
  await getSupabaseAdminClient()
    .from('board_tasks')
    .update({ claim_run_id: null, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('status', 'claimed')
    .eq('claim_run_id', runId);
}

/** Free check (no LLM): does this team have anything to do on the board? */
export async function teamHasBoardWork(tenantId: string, teamId: string): Promise<boolean> {
  const ctx: BoardCtx = { tenantId, userId: 'system', authMode: 'session', teamId };
  const { total_count } = await listBoardTasks(ctx, { status: 'claimable', limit: 1 });
  if (total_count > 0) return true;
  // Tasks the team holds where someone is waiting for a handover.
  const { data } = await getSupabaseAdminClient()
    .from('board_tasks')
    .select('handover_requested_by')
    .eq('tenant_id', tenantId)
    .eq('status', 'claimed')
    .eq('claimed_by', `team:${teamId}`);
  return (data || []).some((t: Row) => !!t.handover_requested_by);
}

// ---------------------------------------------------------------------------
// Human management (UI)
// ---------------------------------------------------------------------------

export type BoardAdminAction =
  | { action: 'edit'; title?: string; description?: string | null; priority?: string; labels?: string[]; due_at?: string | null }
  | { action: 'assign'; assigned_team_id: string | null }
  | { action: 'cancel'; note?: string }
  | { action: 'reopen'; note?: string };

export async function manageBoardTask(ctx: BoardCtx, taskId: string, change: BoardAdminAction) {
  const actor = boardActor(ctx);
  const task = await loadTask(ctx, taskId);
  let patch: Row;
  let event: string;
  let note: string | undefined;

  switch (change.action) {
    case 'edit': {
      const { action: _a, ...fields } = change;
      patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (!Object.keys(patch).length) throw new ServiceError('Nothing to edit.', 'INVALID');
      event = 'edited';
      break;
    }
    case 'assign':
      if (change.assigned_team_id) await assertTeam(ctx, change.assigned_team_id);
      patch = { assigned_team_id: change.assigned_team_id };
      event = 'assigned';
      note = change.assigned_team_id ? `team:${change.assigned_team_id}` : 'any team';
      break;
    case 'cancel':
      if (task.status === 'done') throw new ServiceError('A completed task cannot be cancelled.', 'CONFLICT');
      patch = { status: 'cancelled', completed_at: new Date().toISOString(), lease_expires_at: null, claim_run_id: null, ...CLEAR_HANDOVER };
      event = 'cancelled';
      note = change.note;
      break;
    case 'reopen':
      if (task.status === 'open') throw new ServiceError('Task is already open.', 'CONFLICT');
      patch = { status: 'open', completed_at: null, result: null, result_data: null, ...CLEAR_CLAIM };
      event = 'reopened';
      note = change.note;
      break;
  }

  const updated = await guardedUpdate(ctx, task.id, { status: task.status }, patch);
  if (!updated) throw new ServiceError('The task changed while you were editing; refresh and try again.', 'CONFLICT');
  await logEvent(ctx, task.id, event, actor, note);
  return { task: present(updated) };
}
