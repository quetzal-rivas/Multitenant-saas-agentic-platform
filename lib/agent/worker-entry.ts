import crypto from 'crypto';
import { claimRun, dispatchRun, executeRun } from '@/lib/services/agent-runs';

/**
 * cc-agent-worker Lambda entry. Runs one slice of an agent run (up to ~13 minutes),
 * then, if the run is not finished, saves progress and invokes itself again so the run
 * continues in a fresh invocation ("auto-continue"). Bundled by scripts/build-agent-worker.mjs.
 */

const BUDGET_MS = Number(process.env.AGENT_WORKER_BUDGET_MS) || 13 * 60_000;

export async function handler(event: { run_id?: string } = {}, context?: { awsRequestId?: string }) {
  const runId = event.run_id;
  if (!runId) return { ok: false, error: 'run_id is required' };
  const owner = `lambda:${context?.awsRequestId ?? crypto.randomUUID()}`;
  const leaseMs = BUDGET_MS + 60_000;
  const claimed = await claimRun(runId, owner, leaseMs);
  if (!claimed) return { ok: true, skipped: 'not claimable (finished or held by another worker)' };
  const outcome = await executeRun(runId, { owner, deadlineAt: Date.now() + BUDGET_MS, leaseMs });
  if (outcome.status === 'paused') await dispatchRun(runId);
  return { ok: true, status: outcome.status };
}
