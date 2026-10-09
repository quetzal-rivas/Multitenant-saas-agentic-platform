import crypto from 'crypto';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import { runTurn, type RunnerDeps, type SavedTurnState, type TurnResult } from '@/lib/agent/session-runner';
import { getSession } from './agent-sessions';
import { resolveVoiceProfile } from './voice-profiles';
import { DEFAULT_REPLY_STYLE } from '@/lib/voice/profile-spec';
import { ServiceError } from './errors';

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
  'id, tenant_id, session_id, team_id, task_id, inbound_thread_id, origin, channel, voice, input_message, status, caller, state, progress, result, error, checkpoint_id, lease_owner, lease_expires_at, invocations, started_at, finished_at, created_at, updated_at';

async function loadRun(runId: string): Promise<Row | null> {
  const { data } = await getSupabaseAdminClient().from('agent_runs').select(COLUMNS).eq('id', runId).maybeSingle();
  return data ?? null;
}

const isActive = (r: Row) => r.status === 'queued' || r.status === 'running';
function isStale(r: Row, now = Date.now()): boolean {
  if (r.status === 'queued') return !r.lease_owner && now - new Date(r.created_at).getTime() > QUEUED_GRACE_MS;
  return !r.lease_expires_at || new Date(r.lease_expires_at).getTime() <= now;
}

export async function startRun(
  ctx: RunCaller,
  sessionId: string,
  message: string,
  opts: {
    origin?: 'chat' | 'heartbeat' | 'task' | 'inbound';
    inboundThreadId?: string | null;
    teamId?: string | null;
    taskId?: string | null;
    /** 'voice': the message was spoken and the reply will be; replies follow the voice profile's style. */
    channel?: 'text' | 'voice';
    voice?: Record<string, unknown> | null;
  } = {}
): Promise<Row> {
  const session = await getSession(ctx, sessionId);
  const db = getSupabaseAdminClient();
  const { data: existing } = await db.from('agent_runs').select(COLUMNS).eq('session_id', session.id).eq('tenant_id', ctx.tenantId);
  for (const r of (existing || []).filter(isActive)) {
    if (Date.now() - new Date(r.created_at).getTime() > MAX_RUN_AGE_MS) {
      await finish(r.id, { status: 'error', error: 'Run timed out.' });
      continue;
    }
    throw new ServiceError(`This instance is still working on a previous message (run ${r.id}). Wait for it to finish or cancel it.`, 'CONFLICT');
  }
  const caller: RunCaller = {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    authMode: ctx.authMode,
    apiKeyId: ctx.apiKeyId,
    scopes: ctx.scopes,
    toolsWhitelist: ctx.toolsWhitelist,
  };
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('agent_runs')
    .insert({
      tenant_id: ctx.tenantId,
      session_id: session.id,
      team_id: opts.teamId ?? session.team_id ?? null,
      origin: opts.origin ?? 'chat',
      task_id: opts.taskId ?? null,
      inbound_thread_id: opts.inboundThreadId ?? null,
      channel: opts.channel ?? 'text',
      voice: opts.voice ?? null,
      input_message: message,
      status: 'queued',
      caller,
      progress: { step: 0, last_tool: null },
      invocations: 0,
      created_at: now,
      updated_at: now,
    })
    .select(COLUMNS)
    .single();
  if (error || !data) {
    if (/uniq_agent_runs_active_session|duplicate key/i.test(error?.message || '')) {
      throw new ServiceError('This instance is still working on a previous message. Wait for it to finish or cancel it.', 'CONFLICT');
    }
    throw new Error(`Could not start the run: ${error?.message}`);
  }
  return data;
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

class LeaseLost extends Error {}

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
    });
    if (outcome === 'paused') {
      // Release the lease so the next slice can claim immediately.
      await db.from('agent_runs').update({ lease_owner: null, lease_expires_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', runId).eq('lease_owner', opts.owner);
      return { status: 'paused' };
    }
    const { transcript: _t, ...summary } = outcome;
    await finish(runId, { status: 'done', result: summary, checkpoint_id: outcome.checkpoint_id, progress: { step: outcome.usage.steps, last_tool: null } }, opts.owner);
    await onRunFinished(run, 'ok', null, outcome.message);
    return { status: 'done', result: outcome };
  } catch (err) {
    if (err instanceof LeaseLost) {
      const current = await loadRun(runId);
      return { status: current?.status === 'cancelled' ? 'cancelled' : 'lost' };
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
  if (isActive(run)) await finish(runId, { status: 'cancelled', error: 'Cancelled.' });
  return getRun(ctx, runId);
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
