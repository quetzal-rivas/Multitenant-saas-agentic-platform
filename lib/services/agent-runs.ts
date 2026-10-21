import crypto from 'crypto';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import { RunStopped, runTurn, type RunnerDeps, type SavedTurnState, type StepInfo, type TurnResult } from '@/lib/agent/session-runner';
import { emitRunEvent } from '@/lib/agent/supervisor-graph';
import { parkRunClaims } from './board';
import { getSession } from './agent-sessions';
import { resolveVoiceProfile } from './voice-profiles';
import { DEFAULT_REPLY_STYLE } from '@/lib/voice/profile-spec';
import { ServiceError } from './errors';
import { capped, orgAgentState, tokensUsedToday } from './agent-limits';

/**
 * Durable agent runs. A turn is stored as a run and executed in time-boxed slices by a
 * worker (the cc-agent-worker Lambda) or, without one, by the web request itself. State
 * is saved after every step, so a slice that runs out of time pauses and the next slice
 * continues exactly where it stopped. Leases (compare-and-set) keep one executor per run.
 */

export type RunCaller = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode' | 'apiKeyId' | 'scopes' | 'toolsWhitelist'>;
type Row = Record<string, any>;

/** Budget for a slice run inside a web request (the host cuts requests at ~30 s). */
export const INLINE_BUDGET_MS = 20_000;
/** Runs older than this are stopped; a run never waits forever. */
export const MAX_RUN_AGE_MS = 2 * 60 * 60_000;
const MAX_INVOCATIONS = 40;
const QUEUED_GRACE_MS = 60_000;

// ---------------------------------------------------------------------------
// Dispatch to the worker (injectable for tests)
// ---------------------------------------------------------------------------

type Dispatcher = (runId: string) => Promise<boolean>;
let dispatcherOverride: Dispatcher | null = null;
let lambdaClient: LambdaClient | null = null;

export function setRunDispatcherForTests(d: Dispatcher | null) {
  dispatcherOverride = d;
}

/** Tests: the LLM/secret fakes a worker slice uses (workers cannot receive them per call). */
let defaultDeps: RunnerDeps = {};
export function setDefaultRunnerDepsForTests(d: RunnerDeps | null) {
  defaultDeps = d ?? {};
}

export function workerConfigured(): boolean {
  return !!dispatcherOverride || !!process.env.AGENT_WORKER_FUNCTION;
}

/** Start the worker for a run (async invoke). Returns false when no worker is configured. */
export async function dispatchRun(runId: string): Promise<boolean> {
  if (dispatcherOverride) return dispatcherOverride(runId);
  return invokeWorker({ run_id: runId });
}

/** Async-invoke cc-agent-worker with any payload it understands. False when no worker is configured. */
export async function invokeWorker(payload: Record<string, unknown>): Promise<boolean> {
  const fn = process.env.AGENT_WORKER_FUNCTION;
  if (!fn) return false;
  lambdaClient ||= new LambdaClient({ region: process.env.AWS_REGION || 'us-east-2' });
  await lambdaClient.send(new InvokeCommand({ FunctionName: fn, InvocationType: 'Event', Payload: new TextEncoder().encode(JSON.stringify(payload)) }));
  return true;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const COLUMNS =
  'id, tenant_id, session_id, team_id, task_id, inbound_thread_id, room_id, origin, channel, voice, input_message, status, caller, state, progress, result, error, checkpoint_id, lease_owner, lease_expires_at, invocations, started_at, finished_at, created_at, updated_at, kind, external_ref, labels, client_ref, max_tokens, max_steps, max_duration_seconds, output_schema, tokens_used, usage_by_worker';

async function loadRun(runId: string): Promise<Row | null> {
  const { data } = await getSupabaseAdminClient().from('agent_runs').select(COLUMNS).eq('id', runId).maybeSingle();
  return data ?? null;
}

const isActive = (r: Row) => r.status === 'queued' || r.status === 'running';
function isStale(r: Row, now = Date.now()): boolean {
  if (r.status === 'queued') return !r.lease_owner && now - new Date(r.created_at).getTime() > QUEUED_GRACE_MS;
  return !r.lease_expires_at || new Date(r.lease_expires_at).getTime() <= now;
}

export interface StartRunOptions {
  origin?: 'chat' | 'heartbeat' | 'task' | 'inbound' | 'room';
  inboundThreadId?: string | null;
  roomId?: string | null;
  teamId?: string | null;
  taskId?: string | null;
  /** 'voice': the message was spoken and the reply will be; replies follow the voice profile's style. */
  channel?: 'text' | 'voice';
  voice?: Record<string, unknown> | null;
  /** Orchestration: idempotency key, labels, per-run limits (capped by the org), structured output. */
  clientRef?: string | null;
  labels?: Record<string, string> | null;
  maxTokens?: number | null;
  maxSteps?: number | null;
  maxDurationSeconds?: number | null;
  outputSchema?: Record<string, unknown> | null;
  /** 'external': executed outside the worker (e.g. a cloud coding agent); same run API. */
  kind?: 'internal' | 'external';
  externalRef?: Record<string, unknown> | null;
}

/** Strictly increasing timestamps so runs created in the same millisecond keep their order. */
let lastCreatedMs = 0;
function nextTimestamp(): string {
  lastCreatedMs = Math.max(Date.now(), lastCreatedMs + 1);
  return new Date(lastCreatedMs).toISOString();
}

/**
 * The only way to create a run. Limits (pause, concurrency, daily tokens) and
 * idempotency (client_ref) are checked atomically by the start_agent_run() function.
 * A reused run is returned with `reused: true`.
 */
export async function startRun(ctx: RunCaller, sessionId: string, message: string, opts: StartRunOptions = {}): Promise<Row> {
  const session = await getSession(ctx, sessionId);
  const db = getSupabaseAdminClient();
  // Runs abandoned long ago must not block the instance forever.
  const { data: existing } = await db.from('agent_runs').select('id, status, created_at').eq('session_id', session.id).eq('tenant_id', ctx.tenantId).in('status', ['queued', 'running']);
  for (const r of existing || []) {
    if (Date.now() - new Date(r.created_at).getTime() > MAX_RUN_AGE_MS) await finish(r.id, { status: 'error', error: 'Run timed out.' });
  }
  const { limits } = await orgAgentState(ctx.tenantId);
  const caller: RunCaller = {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    authMode: ctx.authMode,
    apiKeyId: ctx.apiKeyId,
    scopes: ctx.scopes,
    toolsWhitelist: ctx.toolsWhitelist,
  };
  const now = nextTimestamp();
  const row = {
    id: crypto.randomUUID(),
    tenant_id: ctx.tenantId,
    session_id: session.id,
    team_id: opts.teamId ?? session.team_id ?? null,
    origin: opts.origin ?? 'chat',
    task_id: opts.taskId ?? null,
    inbound_thread_id: opts.inboundThreadId ?? null,
    room_id: opts.roomId ?? null,
    channel: opts.channel ?? 'text',
    voice: opts.voice ?? null,
    input_message: message,
    status: 'queued',
    caller,
    state: null,
    progress: { step: 0, last_tool: null },
    result: null,
    error: null,
    invocations: 0,
    kind: opts.kind ?? 'internal',
    external_ref: opts.externalRef ?? null,
    labels: opts.labels ?? {},
    client_ref: opts.clientRef ?? null,
    max_tokens: capped(opts.maxTokens, limits.max_tokens_per_run),
    max_steps: capped(opts.maxSteps, limits.max_steps),
    max_duration_seconds: capped(opts.maxDurationSeconds, limits.max_duration_seconds),
    output_schema: opts.outputSchema ?? null,
    tokens_used: 0,
    usage_by_worker: {},
    created_at: now,
    updated_at: now,
  };
  const { data: res, error } = await db.rpc('start_agent_run', { p_run: row, p_max_concurrent: limits.max_concurrent_runs, p_max_tokens_day: limits.max_tokens_per_day });
  if (error) throw new Error(`Could not start the run: ${error.message}`);
  const outcome = res as { outcome: string; run_id?: string; active?: number; limit?: number; used?: number; paused_at?: string };
  switch (outcome?.outcome) {
    case 'created':
    case 'reused': {
      const run = await loadRun(outcome.run_id!);
      if (!run) throw new Error('The run disappeared right after it was created.');
      return outcome.outcome === 'reused' ? { ...run, reused: true } : run;
    }
    case 'paused':
      throw new ServiceError('Agent runs are paused for this organization. A person must resume them (Agent Studio → Resume runs).', 'CONFLICT');
    case 'concurrency':
      throw new ServiceError(`Concurrency limit reached: ${outcome.active} runs are active (limit ${outcome.limit}). Wait for one to finish and try again.`, 'CONFLICT');
    case 'daily_cap':
      throw new ServiceError(`Daily token cap reached for this organization (${outcome.used} of ${outcome.limit} tokens today, UTC).`, 'CONFLICT');
    case 'busy':
      throw new ServiceError('This instance is still working on a previous message. Wait for it to finish or cancel it.', 'CONFLICT');
    default:
      throw new Error(`Could not start the run: unexpected result ${JSON.stringify(res)}`);
  }
}

/** Take the run for one slice. Returns null when someone else holds it or it is finished. */
export async function claimRun(runId: string, owner: string, leaseMs: number): Promise<Row | null> {
  const run = await loadRun(runId);
  if (!run || !isActive(run)) return null;
  const now = Date.now();
  if (run.status === 'running' && run.lease_owner && !isStale(run, now)) return null;
  let query = getSupabaseAdminClient()
    .from('agent_runs')
    .update({
      status: 'running',
      lease_owner: owner,
      lease_expires_at: new Date(now + leaseMs).toISOString(),
      invocations: (run.invocations ?? 0) + 1,
      started_at: run.started_at ?? new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    })
    .eq('id', runId)
    .eq('status', run.status);
  // Compare-and-set on the lease we observed.
  query = run.lease_owner ? query.eq('lease_owner', run.lease_owner) : query.is('lease_owner', null);
  const { data } = await query.select(COLUMNS);
  return data?.[0] ?? null;
}

async function finish(runId: string, fields: Row, owner?: string) {
  let query = getSupabaseAdminClient()
    .from('agent_runs')
    .update({ ...fields, lease_owner: null, lease_expires_at: null, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', runId);
  if (owner) query = query.eq('lease_owner', owner);
  await query;
}

/** Tell whatever started the run (a heartbeat or a scheduled task) how it ended. */
async function onRunFinished(run: Row, status: 'ok' | 'error', detail: string | null, message?: string | null) {
  if (run.origin === 'room') {
    const { onRoomRunFinished } = await import('./rooms');
    await onRoomRunFinished(run, status, detail, message).catch((err) => console.error('[agent-runs] room hook failed', err));
    return;
  }
  if (run.origin === 'inbound') {
    const { onInboundRunFinished } = await import('./inbound');
    await onInboundRunFinished(run, status, detail, message).catch((err) => console.error('[agent-runs] inbound hook failed', err));
    return;
  }
  if (run.origin === 'task') {
    // Imported lazily: scheduled-tasks depends on this module.
    const { onTaskRunFinished } = await import('./scheduled-tasks');
    await onTaskRunFinished(run, status, detail, message).catch((err) => console.error('[agent-runs] task hook failed', err));
    return;
  }
  if (run.origin !== 'heartbeat' || !run.team_id) return;
  await getSupabaseAdminClient()
    .from('agent_teams')
    .update({ heartbeat_last_status: status, heartbeat_last_error: status === 'error' ? detail : null })
    .eq('id', run.team_id)
    .eq('tenant_id', run.tenant_id);
}

class LeaseLost extends Error {
  constructor() {
    super('lease lost');
    this.name = 'LeaseLost';
  }
}

const BOARD_LEASE_MS = 30 * 60_000;

/**
 * Before every model call of a run (supervisor and workers): enforce the run's limits and
 * the organization's pause and daily cap, notice cancellation, keep the run's Board
 * claims alive, record usage, and hand over pending orchestrator messages.
 */
function makeBeforeStep(run: Row, owner: string) {
  const db = getSupabaseAdminClient();
  return async (info: StepInfo): Promise<{ messages?: string[] }> => {
    const now = Date.now();
    const used = info.usage.totalTokens;
    // Record usage first so the daily total includes this run.
    const { data: current } = await db
      .from('agent_runs')
      .update({ tokens_used: used, usage_by_worker: info.usageByWorker, updated_at: new Date(now).toISOString() })
      .eq('id', run.id)
      .eq('lease_owner', owner)
      .select('status, started_at');
    if (!current?.length || current[0].status !== 'running') throw new LeaseLost(); // cancelled or taken over

    if (run.max_steps && info.usage.steps >= run.max_steps) throw new RunStopped(`Step limit of ${run.max_steps} reached.`);
    if (run.max_tokens && used >= run.max_tokens) throw new RunStopped(`Token budget of ${run.max_tokens} reached.`);
    const started = new Date(current[0].started_at ?? run.started_at ?? run.created_at).getTime();
    if (run.max_duration_seconds && now - started >= run.max_duration_seconds * 1000) throw new RunStopped(`Time limit of ${run.max_duration_seconds} s reached.`);
    const org = await orgAgentState(run.tenant_id);
    if (org.paused_at) throw new RunStopped('Agent runs were stopped for this organization.');
    if ((await tokensUsedToday(run.tenant_id)) >= org.limits.max_tokens_per_day) throw new RunStopped('Daily token cap reached for this organization (UTC day).');

    // Board claims held by this run stay leased while it is alive.
    await db.from('board_tasks').update({ lease_expires_at: new Date(now + BOARD_LEASE_MS).toISOString() }).eq('claim_run_id', run.id).eq('status', 'claimed');

    if (info.worker) return {};
    const { data: pending } = await db.from('agent_run_messages').select('id, text, sent_by').eq('run_id', run.id).is('consumed_at', null).order('created_at', { ascending: true }).limit(20);
    const messages: string[] = [];
    for (const m of pending || []) {
      const { data: took } = await db.from('agent_run_messages').update({ consumed_at: new Date().toISOString() }).eq('id', m.id).is('consumed_at', null).select('id');
      if (!took?.length) continue;
      messages.push(`Message from the orchestrator (${m.sent_by}): ${m.text}`);
      await emitRunEvent({ run_id: run.id, tenant_id: run.tenant_id, step_name: 'orchestrator_message', status: 'completed', event_type: 'orchestrator_message', payload: { message_id: m.id, sent_by: m.sent_by } }).catch(() => undefined);
    }
    return { messages };
  };
}

/** Before every tool call: a run that was cancelled or stopped must not act any more. */
function makeBeforeTool(run: Row, owner: string) {
  const db = getSupabaseAdminClient();
  return async () => {
    const { data } = await db.from('agent_runs').select('status, lease_owner').eq('id', run.id).maybeSingle();
    if (!data || data.status !== 'running' || data.lease_owner !== owner) throw new LeaseLost();
    if ((await orgAgentState(run.tenant_id)).paused_at) throw new RunStopped('Agent runs were stopped for this organization.');
  };
}

export type SliceOutcome =
  | { status: 'done'; result: TurnResult }
  | { status: 'paused' }
  | { status: 'error'; error: string }
  | { status: 'cancelled' | 'lost' };

/** Run one slice of a claimed run until it finishes or `deadlineAt` passes. */
export async function executeRun(runId: string, opts: { owner: string; deadlineAt: number; deps?: RunnerDeps; leaseMs?: number }): Promise<SliceOutcome> {
  const run = await loadRun(runId);
  if (!run || run.status !== 'running' || run.lease_owner !== opts.owner) return { status: 'lost' };
  const db = getSupabaseAdminClient();
  const leaseMs = opts.leaseMs ?? opts.deadlineAt - Date.now() + 60_000;

  const save = async (state: SavedTurnState, progress: { step: number; last_tool: string | null }) => {
    const { data } = await db
      .from('agent_runs')
      .update({ state, progress, lease_expires_at: new Date(Date.now() + leaseMs).toISOString(), updated_at: new Date().toISOString() })
      .eq('id', runId)
      .eq('status', 'running')
      .eq('lease_owner', opts.owner)
      .select('id');
    if (!data?.length) throw new LeaseLost();
  };

  try {
    const replyStyle =
      run.channel === 'voice'
        ? ((await resolveVoiceProfile({ tenantId: run.tenant_id }, run.session_id).catch(() => null))?.reply_style || DEFAULT_REPLY_STYLE)
        : null;
    const outcome = await runTurn(run.caller as RunCaller, run.session_id, run.input_message, opts.deps ?? defaultDeps, {
      runId: run.id,
      replyStyle,
      saved: (run.state as SavedTurnState) ?? null,
      deadlineAt: opts.deadlineAt,
      save,
      beforeStep: makeBeforeStep(run, opts.owner),
      beforeTool: makeBeforeTool(run, opts.owner),
      outputSchema: run.output_schema ?? null,
      // A live call is waiting on voice-channel runs.
      fast: run.channel === 'voice',
    });
    if (outcome === 'paused') {
      // Release the lease so the next slice can claim immediately.
      await db.from('agent_runs').update({ lease_owner: null, lease_expires_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', runId).eq('lease_owner', opts.owner);
      return { status: 'paused' };
    }
    const { transcript: _t, ...summary } = outcome;
    await finish(runId, { status: 'done', result: summary, checkpoint_id: outcome.checkpoint_id, progress: { step: outcome.usage.steps, last_tool: null }, tokens_used: outcome.usage.totalTokens }, opts.owner);
    await onRunFinished(run, 'ok', null, outcome.message);
    return { status: 'done', result: outcome };
  } catch (err) {
    if (err instanceof LeaseLost) {
      const current = await loadRun(runId);
      await parkRunClaims(run.tenant_id, runId).catch(() => undefined);
      return { status: current?.status === 'cancelled' ? 'cancelled' : 'lost' };
    }
    if (err instanceof RunStopped) {
      // Stopped by a limit or the kill switch: keep what the agent produced so far.
      await finish(runId, { status: 'error', error: err.reason, result: { message: err.partialText || null, stopped: true } }, opts.owner);
      await onRunFinished(run, 'error', err.reason, err.partialText);
      return { status: 'error', error: err.reason };
    }
    const message = (err as Error)?.message || 'The run failed.';
    await finish(runId, { status: 'error', error: message.slice(0, 2000) }, opts.owner);
    await onRunFinished(run, 'error', message.slice(0, 500));
    return { status: 'error', error: message };
  }
}

/** Without a worker, run a slice inside the current request. */
export async function driveInline(runId: string, budgetMs = INLINE_BUDGET_MS, deps?: RunnerDeps): Promise<SliceOutcome | null> {
  const owner = `inline:${crypto.randomUUID()}`;
  const claimed = await claimRun(runId, owner, budgetMs + 60_000);
  if (!claimed) return null;
  return executeRun(runId, { owner, deadlineAt: Date.now() + budgetMs, deps, leaseMs: budgetMs + 60_000 });
}

// ---------------------------------------------------------------------------
// Reads and control
// ---------------------------------------------------------------------------

export interface RunView {
  run_id: string;
  session_id: string;
  status: string;
  channel: 'text' | 'voice';
  progress: { step: number; last_tool: string | null };
  result: Omit<TurnResult, 'transcript'> | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

function view(r: Row): RunView {
  return {
    run_id: r.id,
    session_id: r.session_id,
    status: r.status,
    channel: r.channel ?? 'text',
    progress: r.progress || { step: 0, last_tool: null },
    result: r.result ?? null,
    error: r.error ?? null,
    created_at: r.created_at,
    finished_at: r.finished_at ?? null,
  };
}

export async function getRun(ctx: Pick<RunCaller, 'tenantId'>, runId: string): Promise<RunView> {
  const run = await loadRun(runId);
  if (!run || run.tenant_id !== ctx.tenantId) throw new ServiceError('Run not found in this organization.', 'NOT_FOUND');
  return view(run);
}

export async function cancelRun(ctx: Pick<RunCaller, 'tenantId'>, runId: string): Promise<RunView> {
  const run = await loadRun(runId);
  if (!run || run.tenant_id !== ctx.tenantId) throw new ServiceError('Run not found in this organization.', 'NOT_FOUND');
  if (isActive(run)) {
    await finish(runId, { status: 'cancelled', error: 'Cancelled.' });
    // Its Board claims go back to the team (the worker notices at its next step).
    await parkRunClaims(run.tenant_id, runId).catch(() => undefined);
  }
  return getRun(ctx, runId);
}

/** Leave a message for a running agent; it reads it before its next step. */
export async function messageRun(ctx: Pick<RunCaller, 'tenantId' | 'userId' | 'apiKeyId' | 'authMode'>, runId: string, text: string) {
  const run = await loadRun(runId);
  if (!run || run.tenant_id !== ctx.tenantId) throw new ServiceError('Run not found in this organization.', 'NOT_FOUND');
  if (!isActive(run)) throw new ServiceError(`The run already ended (${run.status}); start a new run instead.`, 'CONFLICT');
  const db = getSupabaseAdminClient();
  const { count } = await db.from('agent_run_messages').select('id', { count: 'exact' }).eq('run_id', runId).is('consumed_at', null).limit(1);
  if ((count ?? 0) >= 20) throw new ServiceError('Too many unread messages for this run (20). Wait for the agent to read them.', 'CONFLICT');
  const sentBy = ctx.apiKeyId ? `key:${ctx.apiKeyId}` : `user:${ctx.userId}`;
  const { data } = await db
    .from('agent_run_messages')
    .insert({ run_id: runId, tenant_id: ctx.tenantId, text: text.slice(0, 4000), sent_by: sentBy, created_at: new Date().toISOString() })
    .select('id, created_at')
    .single();
  return { message_id: data?.id, run_id: runId, status: run.status, note: 'The agent reads it before its next step.' };
}

const actorOf = (ctx: Pick<RunCaller, 'userId' | 'apiKeyId'>) => (ctx.apiKeyId ? `key:${ctx.apiKeyId}` : `user:${ctx.userId}`);

/**
 * Stop runs. scope 'mine': cancel the runs started by this key (or user), nothing else.
 * scope 'org': the kill switch: pause the organization (no new runs; running ones stop at
 * their next step; queued ones are cancelled). Tool calls already in progress finish.
 */
export async function stopRuns(ctx: Pick<RunCaller, 'tenantId' | 'userId' | 'apiKeyId' | 'authMode'>, scope: 'mine' | 'org') {
  const db = getSupabaseAdminClient();
  const actor = actorOf(ctx);
  const { data: active } = await db.from('agent_runs').select('id, status, caller').eq('tenant_id', ctx.tenantId).in('status', ['queued', 'running']);
  const mine = (r: Row) => (ctx.apiKeyId ? r.caller?.apiKeyId === ctx.apiKeyId : r.caller?.userId === ctx.userId && !r.caller?.apiKeyId);
  let cancelled = 0;
  let stopping = 0;
  if (scope === 'org') {
    await db.from('organizations').update({ agents_paused_at: new Date().toISOString(), agents_paused_by: actor }).eq('id', ctx.tenantId);
    await emitRunEvent({ run_id: 'org-control', tenant_id: ctx.tenantId, step_name: 'stop_all', status: 'completed', event_type: 'runs_stopped', payload: { by: actor, active: (active || []).length } }).catch(() => undefined);
  }
  for (const r of active || []) {
    if (scope === 'mine' && !mine(r)) continue;
    if (scope === 'mine' || r.status === 'queued') {
      await finish(r.id, { status: 'cancelled', error: scope === 'org' ? `Stopped: agent runs were paused by ${actor}.` : `Cancelled by ${actor}.` });
      await parkRunClaims(ctx.tenantId, r.id).catch(() => undefined);
      cancelled++;
    } else {
      stopping++; // running: stops at its next step (beforeStep sees the pause)
    }
  }
  return { scope, cancelled, stopping, paused: scope === 'org' };
}

export async function resumeRuns(ctx: Pick<RunCaller, 'tenantId' | 'userId' | 'apiKeyId' | 'authMode'>) {
  const db = getSupabaseAdminClient();
  await db.from('organizations').update({ agents_paused_at: null, agents_paused_by: null }).eq('id', ctx.tenantId);
  await emitRunEvent({ run_id: 'org-control', tenant_id: ctx.tenantId, step_name: 'resume', status: 'completed', event_type: 'runs_resumed', payload: { by: actorOf(ctx) } }).catch(() => undefined);
  return { paused: false };
}

/**
 * Called by the minute tick: restart runs whose worker stopped (lease expired), and stop
 * runs that are too old or restarted too often.
 */
export async function recoverStaleRuns(): Promise<{ restarted: number; stopped: number }> {
  const db = getSupabaseAdminClient();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const { data: running } = await db.from('agent_runs').select(COLUMNS).eq('status', 'running').lte('lease_expires_at', nowIso).limit(20);
  const { data: queued } = await db.from('agent_runs').select(COLUMNS).eq('status', 'queued').limit(20);
  let restarted = 0;
  let stopped = 0;
  for (const r of [...(running || []), ...(queued || [])]) {
    // A run that never got picked up within the queue limit fails instead of waiting forever.
    if (r.status === 'queued') {
      const { limits } = await orgAgentState(r.tenant_id);
      if (now - new Date(r.created_at).getTime() > limits.max_queue_seconds * 1000) {
        await finish(r.id, { status: 'error', error: `Run never started (waited more than ${limits.max_queue_seconds} s in the queue).` });
        await onRunFinished(r, 'error', 'Run never started.');
        stopped++;
        continue;
      }
    }
    if (!isStale(r, now)) continue;
    if (now - new Date(r.created_at).getTime() > MAX_RUN_AGE_MS || (r.invocations ?? 0) >= MAX_INVOCATIONS) {
      await finish(r.id, { status: 'error', error: 'Run stopped: it took too long.' });
      await onRunFinished(r, 'error', 'Run stopped: it took too long.');
      stopped++;
      continue;
    }
    if (await dispatchRun(r.id).catch(() => false)) restarted++;
  }
  return { restarted, stopped };
}

/** Wait until the run finishes or `waitMs` passes (polling the database). */
export async function waitForRun(runId: string, waitMs: number, pollMs = 1000): Promise<Row | null> {
  const until = Date.now() + waitMs;
  for (;;) {
    const run = await loadRun(runId);
    if (!run || !isActive(run) || Date.now() >= until) return run;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
