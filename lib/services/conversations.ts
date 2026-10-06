import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import { getSession, latestCheckpoint, listSessions, toTranscript, type AgentSession } from './agent-sessions';

/**
 * Conversations inbox: every agent instance in the organization (Agent Studio chats,
 * team instances, heartbeat and scheduled-task instances), with what happened in it.
 * Built from agent_sessions + agent_runs + checkpoints; nothing is stored twice.
 */

type Ctx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode' | 'apiKeyId'>;
type Row = Record<string, any>;

export type ConversationKind = 'agent' | 'team' | 'heartbeat' | 'task';

export interface ConversationSummary {
  id: string;
  name: string;
  kind: ConversationKind;
  team_id: string | null;
  team_name: string | null;
  task_id: string | null;
  provider: string;
  model: string;
  voice: boolean;
  run_count: number;
  last_status: string | null;
  last_error: string | null;
  last_message: string | null;
  last_active_at: string;
  created_at: string;
}

const RUN_SCAN_LIMIT = 1000;

async function context(ctx: Ctx) {
  const db = getSupabaseAdminClient();
  const [teams, tasks, runs] = await Promise.all([
    db.from('agent_teams').select('id, name, heartbeat_session_id').eq('tenant_id', ctx.tenantId),
    db.from('supervisor_tasks').select('id, session_id').eq('tenant_id', ctx.tenantId),
    db
      .from('agent_runs')
      .select('id, session_id, origin, channel, status, error, input_message, created_at')
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
      .limit(RUN_SCAN_LIMIT),
  ]);
  const teamName = new Map<string, string>((teams.data || []).map((t: Row) => [t.id, t.name]));
  const heartbeatSessions = new Set((teams.data || []).map((t: Row) => t.heartbeat_session_id).filter(Boolean));
  const taskBySession = new Map<string, string>((tasks.data || []).filter((t: Row) => t.session_id).map((t: Row) => [t.session_id, t.id]));
  const runsBySession = new Map<string, Row[]>();
  for (const r of runs.data || []) runsBySession.set(r.session_id, [...(runsBySession.get(r.session_id) || []), r]);
  return { teamName, heartbeatSessions, taskBySession, runsBySession };
}

function kindOf(s: AgentSession, c: Awaited<ReturnType<typeof context>>): ConversationKind {
  if (c.heartbeatSessions.has(s.id)) return 'heartbeat';
  if (c.taskBySession.has(s.id)) return 'task';
  return s.team_id ? 'team' : 'agent';
}

function summarize(s: AgentSession, c: Awaited<ReturnType<typeof context>>): ConversationSummary {
  const runs = c.runsBySession.get(s.id) || []; // newest first
  const last = runs[0];
  return {
    id: s.id,
    name: s.name,
    kind: kindOf(s, c),
    team_id: s.team_id,
    team_name: s.team_id ? c.teamName.get(s.team_id) ?? null : null,
    task_id: c.taskBySession.get(s.id) ?? null,
    provider: s.provider,
    model: s.model,
    voice: runs.some((r) => r.channel === 'voice'),
    run_count: runs.length,
    last_status: last?.status ?? null,
    last_error: last?.status === 'error' ? last.error ?? null : null,
    last_message: last?.input_message ? String(last.input_message).slice(0, 160) : null,
    last_active_at: last?.created_at && last.created_at > s.last_active_at ? last.created_at : s.last_active_at,
    created_at: s.created_at,
  };
}

export interface ConversationFilters {
  kind?: ConversationKind;
  voice?: boolean;
  status?: 'running' | 'failed';
  team_id?: string;
  q?: string;
}

export async function listConversations(ctx: Ctx, filters: ConversationFilters = {}) {
  const [sessions, c] = await Promise.all([listSessions(ctx), context(ctx)]);
  const q = filters.q?.trim().toLowerCase();
  const all = sessions.map((s) => summarize(s, c));
  const conversations = all
    .filter((x) => !filters.kind || x.kind === filters.kind)
    .filter((x) => filters.voice === undefined || x.voice === filters.voice)
    .filter((x) => !filters.team_id || x.team_id === filters.team_id)
    .filter((x) => {
      if (filters.status === 'running') return x.last_status === 'queued' || x.last_status === 'running';
      if (filters.status === 'failed') return x.last_status === 'error';
      return true;
    })
    .filter((x) => !q || x.name.toLowerCase().includes(q) || (x.team_name || '').toLowerCase().includes(q) || (x.last_message || '').toLowerCase().includes(q))
    .sort((a, b) => (a.last_active_at < b.last_active_at ? 1 : -1));
  const counts = {
    all: all.length,
    agent: all.filter((x) => x.kind === 'agent').length,
    team: all.filter((x) => x.kind === 'team').length,
    heartbeat: all.filter((x) => x.kind === 'heartbeat').length,
    task: all.filter((x) => x.kind === 'task').length,
    voice: all.filter((x) => x.voice).length,
  };
  return { conversations, counts };
}

export async function getConversation(ctx: Ctx, sessionId: string) {
  const session = await getSession(ctx, sessionId);
  const [c, latest, runs] = await Promise.all([
    context(ctx),
    latestCheckpoint(ctx, sessionId),
    getSupabaseAdminClient()
      .from('agent_runs')
      .select('id, origin, channel, voice, status, input_message, result, error, created_at, finished_at')
      .eq('session_id', session.id)
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  return {
    conversation: summarize(session, c),
    transcript: toTranscript(latest?.state || []),
    runs: (runs.data || []).map((r: Row) => ({
      run_id: r.id,
      origin: r.origin,
      channel: r.channel ?? 'text',
      voice: r.voice ?? null,
      status: r.status,
      message: r.input_message,
      reply: r.result?.message ?? null,
      tools: (r.result?.tool_executions || []).map((t: Row) => (t.worker ? `${t.worker}:${t.toolName}` : t.toolName)),
      steps: r.result?.usage?.steps ?? 0,
      model: r.result?.model ?? null,
      error: r.error ?? null,
      started_at: r.created_at,
      finished_at: r.finished_at ?? null,
    })),
  };
}
