import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import { localParts, nextRun, type HeartbeatSchedule } from '@/lib/agent/heartbeat-schedule';
import { runSessionTurn, type RunnerDeps } from '@/lib/agent/session-runner';
import { ensureHeartbeatSession, getTeam, type AgentTeam } from './teams';
import { ServiceError } from './errors';

/** Stop starting new runs after this long so the tick request returns in time. */
const TICK_BUDGET_MS = 15_000;
const MAX_TEAMS_PER_TICK = 3;

export interface HeartbeatOutcome {
  team_id: string;
  status: 'ok' | 'error' | 'skipped';
  detail?: string;
  checkpoint_id?: string;
  next_run_at: string | null;
}

/** Context heartbeats run under: the team's tenant, no user, full catalog scopes. */
function systemCtx(tenantId: string): AuthContext {
  return { tenantId, userId: 'heartbeat', role: 'system', scopes: ['*'], authMode: 'webhook_signature' };
}

/**
 * Run one heartbeat for a team now. Counts toward the daily cap (in the team's time
 * zone); when the cap is reached the run is recorded as skipped.
 */
export async function runTeamHeartbeat(
  ctx: Pick<AuthContext, 'tenantId' | 'userId' | 'authMode' | 'apiKeyId'>,
  team: AgentTeam,
  opts: { manual?: boolean; deps?: RunnerDeps; now?: Date } = {}
): Promise<HeartbeatOutcome> {
  const now = opts.now ?? new Date();
  const schedule = team.heartbeat_schedule as HeartbeatSchedule | null;
  if (!team.heartbeat_goal) throw new ServiceError('Set a heartbeat goal before running it.', 'INVALID');

  const today = localParts(now, schedule?.timezone || 'UTC').date;
  const runsToday = team.heartbeat_runs_day === today ? team.heartbeat_runs_today : 0;
  const next = team.heartbeat_enabled && schedule ? nextRun(schedule, now, now).toISOString() : null;
  const db = getSupabaseAdminClient();

  if (runsToday >= team.heartbeat_max_runs_per_day) {
    const detail = `Daily cap of ${team.heartbeat_max_runs_per_day} runs reached.`;
    await db.from('agent_teams').update({
      heartbeat_last_status: 'skipped',
      heartbeat_last_error: detail,
      ...(opts.manual ? {} : { heartbeat_next_run_at: next }),
    }).eq('id', team.id).eq('tenant_id', ctx.tenantId);
    return { team_id: team.id, status: 'skipped', detail, next_run_at: next };
  }

  const runCtx = systemCtx(ctx.tenantId);
  let outcome: HeartbeatOutcome;
  try {
    const sessionId = await ensureHeartbeatSession(runCtx, team);
    const turn = await runSessionTurn(runCtx, sessionId, team.heartbeat_goal, opts.deps);
    outcome = { team_id: team.id, status: 'ok', checkpoint_id: turn.checkpoint_id, next_run_at: next };
  } catch (err) {
    outcome = { team_id: team.id, status: 'error', detail: (err as Error).message?.slice(0, 500), next_run_at: next };
  }

  await db.from('agent_teams').update({
    heartbeat_last_run_at: now.toISOString(),
    heartbeat_last_status: outcome.status,
    heartbeat_last_error: outcome.status === 'error' ? outcome.detail : null,
    heartbeat_runs_day: today,
    heartbeat_runs_today: runsToday + 1,
  }).eq('id', team.id).eq('tenant_id', ctx.tenantId);
  return outcome;
}

/**
 * Called by the pg_cron tick: claim teams whose heartbeat is due and run them.
 * Claiming moves next_run_at forward with a compare-and-set, so concurrent ticks
 * never run the same team twice.
 */
export async function processDueHeartbeats(opts: { now?: Date; deps?: RunnerDeps } = {}): Promise<HeartbeatOutcome[]> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const db = getSupabaseAdminClient();
  const { data: due, error } = await db
    .from('agent_teams')
    .select('id, tenant_id, heartbeat_next_run_at, heartbeat_schedule')
    .eq('heartbeat_enabled', true)
    .is('archived_at', null)
    .lte('heartbeat_next_run_at', now.toISOString())
    .order('heartbeat_next_run_at', { ascending: true })
    .limit(MAX_TEAMS_PER_TICK);
  if (error) throw new Error(`Could not load due heartbeats: ${error.message}`);

  const outcomes: HeartbeatOutcome[] = [];
  for (const row of due || []) {
    if (Date.now() - started > TICK_BUDGET_MS) break; // the rest run on the next tick
    const schedule = row.heartbeat_schedule as HeartbeatSchedule | null;
    if (!schedule) continue;
    const next = nextRun(schedule, now, now).toISOString();
    const { data: claimed } = await db
      .from('agent_teams')
      .update({ heartbeat_next_run_at: next })
      .eq('id', row.id)
      .eq('heartbeat_next_run_at', row.heartbeat_next_run_at)
      .select('id');
    if (!claimed?.length) continue; // another tick got it

    const ctx = systemCtx(row.tenant_id);
    const team = await getTeam(ctx, row.id);
    outcomes.push(await runTeamHeartbeat(ctx, { ...team, heartbeat_next_run_at: next }, { deps: opts.deps, now }));
  }
  return outcomes;
}

/** Check the secret pg_cron sends against the copy in Supabase Vault (compared in the database). */
export async function verifyHeartbeatSecret(candidate: string | null): Promise<boolean> {
  if (!candidate || candidate.length < 32) return false;
  const { data, error } = await getSupabaseAdminClient().rpc('verify_heartbeat_secret', { candidate });
  return !error && data === true;
}
