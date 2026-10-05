import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import { DEFAULT_MODELS } from '@/lib/agent/providers/llm-adapter';
import { nextRun, type HeartbeatSchedule } from '@/lib/agent/heartbeat-schedule';
import { teamSpecSchema, workerSlug, type TeamSpec } from '@/lib/agent/team-spec';
export { teamSpecSchema, workerSlug, MAX_TEAM_WORKERS, type TeamSpec } from '@/lib/agent/team-spec';
import { configuredProviders, createSession, LLM_PROVIDERS } from './agent-sessions';
import { getContextProfile } from './context-profiles';
import { getProfile } from './profiles';
import { ServiceError } from './errors';

type Ctx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode' | 'apiKeyId'>;

const TEAM_COLUMNS =
  'id, name, description, provider, model, routing_strategy, supervisor_instructions, supervisor_context_profile_id, supervisor_mcp_profile_id, supervisor_tools, heartbeat_enabled, heartbeat_goal, heartbeat_schedule, heartbeat_max_runs_per_day, heartbeat_wake_when, heartbeat_session_id, heartbeat_next_run_at, heartbeat_last_run_at, heartbeat_last_status, heartbeat_last_error, heartbeat_runs_day, heartbeat_runs_today, created_at, updated_at';
const WORKER_COLUMNS = 'id, name, slug, role, instructions, context_profile_id, mcp_profile_id, tools, model, position';

export interface TeamWorker {
  id: string;
  name: string;
  slug: string;
  role: string;
  instructions: string | null;
  context_profile_id: string | null;
  mcp_profile_id: string | null;
  tools: string[];
  model: string | null;
  position: number;
}

export interface AgentTeam {
  id: string;
  name: string;
  description: string | null;
  provider: (typeof LLM_PROVIDERS)[number];
  model: string;
  routing_strategy: 'supervisor_router';
  supervisor_instructions: string | null;
  supervisor_context_profile_id: string | null;
  supervisor_mcp_profile_id: string | null;
  supervisor_tools: string[];
  heartbeat_enabled: boolean;
  heartbeat_goal: string | null;
  heartbeat_schedule: HeartbeatSchedule | null;
  heartbeat_max_runs_per_day: number;
  heartbeat_wake_when: 'always' | 'board_has_work';
  heartbeat_session_id: string | null;
  heartbeat_next_run_at: string | null;
  heartbeat_last_run_at: string | null;
  heartbeat_last_status: 'ok' | 'error' | 'skipped' | 'idle' | null;
  heartbeat_last_error: string | null;
  heartbeat_runs_day: string | null;
  heartbeat_runs_today: number;
  created_at: string;
  updated_at: string;
  workers: TeamWorker[];
}

/** Export a stored team in the team-as-code format. */
export function toTeamSpec(team: AgentTeam): TeamSpec {
  return {
    name: team.name,
    description: team.description,
    llm: { provider: team.provider, model: team.model },
    routing_strategy: team.routing_strategy,
    supervisor: {
      instructions: team.supervisor_instructions,
      context_profile_id: team.supervisor_context_profile_id,
      mcp_profile_id: team.supervisor_mcp_profile_id,
      tools: team.supervisor_tools,
    },
    workers: team.workers.map((w) => ({
      name: w.name,
      role: w.role,
      instructions: w.instructions,
      context_profile_id: w.context_profile_id,
      mcp_profile_id: w.mcp_profile_id,
      tools: w.tools,
      model: w.model,
    })),
    heartbeat: {
      enabled: team.heartbeat_enabled,
      goal: team.heartbeat_goal,
      schedule: team.heartbeat_schedule,
      max_runs_per_day: team.heartbeat_max_runs_per_day,
      wake_when: team.heartbeat_wake_when ?? 'always',
    },
  };
}

async function assertSpecReferences(ctx: Ctx, spec: TeamSpec) {
  const providers = await configuredProviders(ctx.tenantId);
  if (!providers.includes(spec.llm.provider)) {
    throw new ServiceError(
      `No ${spec.llm.provider} API key is stored for this organization. Add one in Account & Billing → LLM keys first.`,
      'CONFLICT'
    );
  }
  const contextIds = new Set([spec.supervisor.context_profile_id, ...spec.workers.map((w) => w.context_profile_id)].filter(Boolean) as string[]);
  const mcpIds = new Set([spec.supervisor.mcp_profile_id, ...spec.workers.map((w) => w.mcp_profile_id)].filter(Boolean) as string[]);
  for (const id of contextIds) await getContextProfile(ctx, id);
  for (const id of mcpIds) await getProfile(ctx, { profile_id: id });
}

function teamRow(spec: TeamSpec, existing?: AgentTeam | null) {
  const schedule = spec.heartbeat.enabled ? spec.heartbeat.schedule ?? null : null;
  const scheduleChanged =
    !existing ||
    existing.heartbeat_enabled !== spec.heartbeat.enabled ||
    JSON.stringify(existing.heartbeat_schedule) !== JSON.stringify(schedule);
  return {
    name: spec.name,
    description: spec.description ?? null,
    provider: spec.llm.provider,
    model: spec.llm.model || DEFAULT_MODELS[spec.llm.provider],
    routing_strategy: spec.routing_strategy,
    supervisor_instructions: spec.supervisor.instructions ?? null,
    supervisor_context_profile_id: spec.supervisor.context_profile_id ?? null,
    supervisor_mcp_profile_id: spec.supervisor.mcp_profile_id ?? null,
    supervisor_tools: spec.supervisor.tools,
    heartbeat_enabled: spec.heartbeat.enabled,
    heartbeat_goal: spec.heartbeat.goal ?? null,
    heartbeat_schedule: spec.heartbeat.schedule ?? null,
    heartbeat_max_runs_per_day: spec.heartbeat.max_runs_per_day,
    heartbeat_wake_when: spec.heartbeat.wake_when,
    // Only re-plan the next run when the schedule itself changed.
    ...(scheduleChanged
      ? { heartbeat_next_run_at: schedule ? nextRun(schedule, new Date()).toISOString() : null }
      : {}),
    updated_at: new Date().toISOString(),
  };
}

async function replaceWorkers(ctx: Ctx, teamId: string, spec: TeamSpec) {
  const db = getSupabaseAdminClient();
  const { error: delError } = await db.from('team_workers').delete().eq('team_id', teamId).eq('tenant_id', ctx.tenantId);
  if (delError) throw new Error(`Could not update workers: ${delError.message}`);
  if (spec.workers.length === 0) return;
  const { error } = await db.from('team_workers').insert(
    spec.workers.map((w, position) => ({
      team_id: teamId,
      tenant_id: ctx.tenantId,
      name: w.name,
      slug: workerSlug(w.name),
      role: w.role,
      instructions: w.instructions ?? null,
      context_profile_id: w.context_profile_id ?? null,
      mcp_profile_id: w.mcp_profile_id ?? null,
      tools: w.tools,
      model: w.model ?? null,
      position,
    }))
  );
  if (error) throw new Error(`Could not save workers: ${error.message}`);
}

export async function listTeams(ctx: Ctx) {
  const db = getSupabaseAdminClient();
  const { data, error } = await db
    .from('agent_teams')
    .select(`${TEAM_COLUMNS}, team_workers(count)`)
    .eq('tenant_id', ctx.tenantId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not list teams: ${error.message}`);
  return (data || []).map((row: any) => {
    const { team_workers, ...team } = row;
    return { ...team, worker_count: team_workers?.[0]?.count ?? 0 };
  });
}

export async function getTeam(ctx: Ctx, id: string): Promise<AgentTeam> {
  const db = getSupabaseAdminClient();
  const { data, error } = await db
    .from('agent_teams')
    .select(TEAM_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw new Error(`Could not load team: ${error.message}`);
  if (!data) throw new ServiceError('Team not found in this organization.', 'NOT_FOUND');
  const { data: workers, error: wError } = await db
    .from('team_workers')
    .select(WORKER_COLUMNS)
    .eq('team_id', id)
    .eq('tenant_id', ctx.tenantId)
    .order('position', { ascending: true });
  if (wError) throw new Error(`Could not load workers: ${wError.message}`);
  return { ...(data as Omit<AgentTeam, 'workers'>), workers: (workers || []) as TeamWorker[] };
}

export async function createTeam(ctx: Ctx, raw: unknown): Promise<AgentTeam> {
  const spec = teamSpecSchema.parse(raw);
  await assertSpecReferences(ctx, spec);
  const { data, error } = await getSupabaseAdminClient()
    .from('agent_teams')
    .insert({ tenant_id: ctx.tenantId, created_by: ctx.authMode === 'session' ? ctx.userId : null, ...teamRow(spec) })
    .select('id')
    .single();
  if (error?.code === '23505') throw new ServiceError(`A team named '${spec.name}' already exists.`, 'CONFLICT');
  if (error || !data) throw new Error(`Could not create team: ${error?.message}`);
  await replaceWorkers(ctx, data.id, spec);
  return getTeam(ctx, data.id);
}

export async function updateTeam(ctx: Ctx, id: string, raw: unknown): Promise<AgentTeam> {
  const spec = teamSpecSchema.parse(raw);
  const existing = await getTeam(ctx, id);
  await assertSpecReferences(ctx, spec);
  const { error } = await getSupabaseAdminClient()
    .from('agent_teams')
    .update(teamRow(spec, existing))
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);
  if (error?.code === '23505') throw new ServiceError(`A team named '${spec.name}' already exists.`, 'CONFLICT');
  if (error) throw new Error(`Could not update team: ${error.message}`);
  await replaceWorkers(ctx, id, spec);
  return getTeam(ctx, id);
}

export async function archiveTeam(ctx: Ctx, id: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from('agent_teams')
    .update({ archived_at: new Date().toISOString(), heartbeat_enabled: false, heartbeat_next_run_at: null })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .is('archived_at', null)
    .select('id');
  if (error) throw new Error(`Could not archive team: ${error.message}`);
  if (!data?.length) throw new ServiceError('Team not found in this organization.', 'NOT_FOUND');
}

/** Start an Agent Studio instance that runs this team. */
export async function createTeamSession(ctx: Ctx, teamId: string, name?: string) {
  const team = await getTeam(ctx, teamId);
  return createSession(
    ctx,
    { name: name || `${team.name} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, provider: team.provider, model: team.model, team_id: team.id },
  );
}

/** The dedicated instance heartbeat runs append to; created on first use. */
export async function ensureHeartbeatSession(ctx: Ctx, team: AgentTeam): Promise<string> {
  if (team.heartbeat_session_id) return team.heartbeat_session_id;
  const session = await createTeamSession(ctx, team.id, `${team.name} · Heartbeat`);
  await getSupabaseAdminClient()
    .from('agent_teams')
    .update({ heartbeat_session_id: session.id })
    .eq('id', team.id)
    .eq('tenant_id', ctx.tenantId);
  return session.id;
}
