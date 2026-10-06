import type { AuthContext } from '@/lib/auth/require-auth';
import type { RunnerDeps } from '@/lib/agent/session-runner';
import { latestCheckpoint, toTranscript } from './agent-sessions';
import { INLINE_BUDGET_MS, dispatchRun, driveInline, getRun, startRun, waitForRun, workerConfigured, type RunView } from './agent-runs';
import { ServiceError } from './errors';

/**
 * HTTP-facing turn flow shared by /api/v1/chat/generate and /api/v1/agent-runs/:id.
 * A short turn finishes within the request (same response as before); a long one returns
 * the run so the client can check progress until it is done.
 */

type Ctx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode' | 'apiKeyId' | 'scopes' | 'toolsWhitelist'>;

export type TurnResponse = { status: 200; body: Record<string, unknown> } | { status: 202; body: RunView };

async function finishedBody(ctx: Ctx, run: RunView): Promise<TurnResponse> {
  if (run.status === 'error') throw new ServiceError(run.error || 'The run failed.', 'CONFLICT');
  if (run.status === 'cancelled') throw new ServiceError('The run was cancelled.', 'CONFLICT');
  const checkpoint = await latestCheckpoint(ctx, run.session_id);
  return { status: 200, body: { ...(run.result || {}), run_id: run.run_id, transcript: toTranscript(checkpoint?.state || []) } };
}

/** Drive one slice (when there is no worker) or wait for the worker, then report. */
async function progress(ctx: Ctx, runId: string, waitMs: number, deps?: RunnerDeps): Promise<TurnResponse> {
  if (workerConfigured()) {
    await waitForRun(runId, waitMs);
  } else {
    await driveInline(runId, Math.min(waitMs, INLINE_BUDGET_MS), deps);
  }
  const run = await getRun(ctx, runId);
  if (run.status === 'queued' || run.status === 'running') return { status: 202, body: run };
  return finishedBody(ctx, run);
}

export async function startTurn(ctx: Ctx, sessionId: string, message: string, opts: { waitMs?: number; deps?: RunnerDeps } = {}): Promise<TurnResponse> {
  const run = await startRun(ctx, sessionId, message);
  await dispatchRun(run.id).catch((err) => console.error('[agent-runs] dispatch failed; continuing inline', err));
  return progress(ctx, run.id, opts.waitMs ?? INLINE_BUDGET_MS, opts.deps);
}

/** GET /agent-runs/:id: report, continuing the run inline when no worker is configured. */
export async function checkTurn(ctx: Ctx, runId: string, opts: { deps?: RunnerDeps } = {}): Promise<TurnResponse> {
  const run = await getRun(ctx, runId);
  if (run.status !== 'queued' && run.status !== 'running') return finishedBody(ctx, run);
  if (workerConfigured()) return { status: 202, body: run };
  return progress(ctx, runId, INLINE_BUDGET_MS, opts.deps);
}
