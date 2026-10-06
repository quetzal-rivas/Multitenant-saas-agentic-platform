import crypto from 'crypto';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import { listTenantSecrets } from '@/lib/secrets/secrets-service';
import { DEFAULT_MODELS, type LLMMessage, type LLMProvider } from '@/lib/agent/providers/llm-adapter';
import { PLATFORM_TOOL_DEFINITIONS } from '@/lib/mcp/tool-catalog';
import { getContextProfile } from './context-profiles';
import { getProfile } from './profiles';
import { getVoiceProfile } from './voice-profiles';
import { ServiceError } from './errors';

type Ctx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode' | 'apiKeyId'>;

export const LLM_PROVIDERS = ['anthropic', 'openai', 'gemini'] as const;
const toolNames = PLATFORM_TOOL_DEFINITIONS.map((t) => t.name) as [string, ...string[]];

/** Read-only tools an instance gets when none are chosen explicitly. */
export const DEFAULT_SESSION_TOOLS = PLATFORM_TOOL_DEFINITIONS.filter((t) => t.sideEffect === 'read').map((t) => t.name);

export const createSessionBody = z.object({
  name: z.string().trim().min(1).max(120),
  provider: z.enum(LLM_PROVIDERS),
  model: z.string().trim().min(1).max(120).optional(),
  mcp_profile_id: z.string().uuid().nullable().optional(),
  context_profile_id: z.string().uuid().nullable().optional(),
  allowed_tools: z.array(z.enum(toolNames)).max(50).optional(),
  /** Run a team (supervisor + workers) instead of a single configured agent. */
  team_id: z.string().uuid().nullable().optional(),
}).strict();

// Provider and model are fixed once a conversation exists: replaying one provider's
// turns into another loses tool-call structure and reasoning state.
export const updateSessionBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  mcp_profile_id: z.string().uuid().nullable().optional(),
  context_profile_id: z.string().uuid().nullable().optional(),
  allowed_tools: z.array(z.enum(toolNames)).max(50).optional(),
  /** Voice profile for this instance; null = use the team's (or the platform default). */
  voice_profile_id: z.string().uuid().nullable().optional(),
}).strict();

export const forkSessionBody = z.object({
  checkpoint_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
}).strict();

const SESSION_COLUMNS =
  'id, name, agent_type, team_id, provider, model, mcp_profile_id, context_profile_id, voice_profile_id, allowed_tools, forked_from_checkpoint, created_at, last_active_at';
const CHECKPOINT_SUMMARY_COLUMNS =
  'id, checkpoint_id, session_id, parent_id, step_index, user_message, assistant_message, tools_executed, usage, metadata, created_at';

export interface AgentSession {
  id: string;
  name: string;
  agent_type: 'single' | 'team';
  team_id: string | null;
  voice_profile_id?: string | null;
  provider: LLMProvider;
  model: string;
  mcp_profile_id: string | null;
  context_profile_id: string | null;
  allowed_tools: string[];
  forked_from_checkpoint: string | null;
  created_at: string;
  last_active_at: string;
}

/** Providers this tenant has stored a BYOK key for. */
export async function configuredProviders(tenantId: string): Promise<LLMProvider[]> {
  const secrets = await listTenantSecrets(tenantId);
  return LLM_PROVIDERS.filter((p) => secrets.some((s) => s.provider === p));
}

async function assertAttachments(ctx: Ctx, mcpProfileId?: string | null, contextProfileId?: string | null) {
  if (mcpProfileId) await getProfile(ctx, { profile_id: mcpProfileId });
  if (contextProfileId) await getContextProfile(ctx, contextProfileId);
}

export async function listSessions(ctx: Ctx): Promise<AgentSession[]> {
  const { data, error } = await getSupabaseAdminClient()
    .from('agent_sessions')
    .select(SESSION_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .is('archived_at', null)
    .order('last_active_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(`Could not list agent instances: ${error.message}`);
  return (data || []) as AgentSession[];
}

export async function getSession(ctx: Ctx, id: string): Promise<AgentSession> {
  const { data, error } = await getSupabaseAdminClient()
    .from('agent_sessions')
    .select(SESSION_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw new Error(`Could not load agent instance: ${error.message}`);
  if (!data) throw new ServiceError('Agent instance not found in this organization.', 'NOT_FOUND');
  return data as AgentSession;
}

export async function createSession(ctx: Ctx, raw: unknown, extra: { forkedFrom?: string } = {}) {
  const body = createSessionBody.parse(raw);
  const providers = await configuredProviders(ctx.tenantId);
  if (!providers.includes(body.provider)) {
    throw new ServiceError(
      `No ${body.provider} API key is stored for this organization. Add one in Account & Billing → LLM keys first.`,
      'CONFLICT'
    );
  }
  await assertAttachments(ctx, body.mcp_profile_id, body.context_profile_id);
  if (body.team_id) {
    const { data: team } = await getSupabaseAdminClient()
      .from('agent_teams')
      .select('id')
      .eq('id', body.team_id)
      .eq('tenant_id', ctx.tenantId)
      .is('archived_at', null)
      .maybeSingle();
    if (!team) throw new ServiceError('Team not found in this organization.', 'NOT_FOUND');
  }

  const { data, error } = await getSupabaseAdminClient()
    .from('agent_sessions')
    .insert({
      tenant_id: ctx.tenantId,
      agent_type: body.team_id ? 'team' : 'single',
      team_id: body.team_id || null,
      name: body.name,
      provider: body.provider,
      model: body.model || DEFAULT_MODELS[body.provider],
      mcp_profile_id: body.mcp_profile_id || null,
      context_profile_id: body.context_profile_id || null,
      allowed_tools: body.team_id ? [] : body.allowed_tools ?? DEFAULT_SESSION_TOOLS,
      forked_from_checkpoint: extra.forkedFrom || null,
      created_by: ctx.authMode === 'session' ? ctx.userId : null,
    })
    .select(SESSION_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not create agent instance: ${error?.message}`);
  return data as AgentSession;
}

export async function updateSession(ctx: Ctx, id: string, raw: unknown) {
  const body = updateSessionBody.parse(raw);
  await getSession(ctx, id);
  await assertAttachments(ctx, body.mcp_profile_id, body.context_profile_id);
  if (body.voice_profile_id) await getVoiceProfile(ctx, body.voice_profile_id);

  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) if (value !== undefined) patch[key] = value;
  if (Object.keys(patch).length === 0) throw new ServiceError('Nothing to update.', 'INVALID');

  const { data, error } = await getSupabaseAdminClient()
    .from('agent_sessions')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select(SESSION_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not update agent instance: ${error?.message}`);
  return data as AgentSession;
}

export async function archiveSession(ctx: Ctx, id: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from('agent_sessions')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .is('archived_at', null)
    .select('id');
  if (error) throw new Error(`Could not archive agent instance: ${error.message}`);
  if (!data?.length) throw new ServiceError('Agent instance not found in this organization.', 'NOT_FOUND');
}

export async function listCheckpoints(ctx: Ctx, sessionId: string) {
  await getSession(ctx, sessionId);
  const { data, error } = await getSupabaseAdminClient()
    .from('checkpoints')
    .select(CHECKPOINT_SUMMARY_COLUMNS)
    .eq('session_id', sessionId)
    .eq('tenant_id', ctx.tenantId)
    .order('step_index', { ascending: true });
  if (error) throw new Error(`Could not list checkpoints: ${error.message}`);
  return data || [];
}

export async function getCheckpoint(ctx: Ctx, checkpointId: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from('checkpoints')
    .select(`${CHECKPOINT_SUMMARY_COLUMNS}, state`)
    .eq('id', checkpointId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (error) throw new Error(`Could not load checkpoint: ${error.message}`);
  if (!data || !data.session_id) throw new ServiceError('Checkpoint not found in this organization.', 'NOT_FOUND');
  return data as typeof data & { state: LLMMessage[] };
}

/** The newest checkpoint of a session, including its full state, or null for a new instance. */
export async function latestCheckpoint(ctx: Ctx, sessionId: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from('checkpoints')
    .select('id, step_index, state')
    .eq('session_id', sessionId)
    .eq('tenant_id', ctx.tenantId)
    .order('step_index', { ascending: false })
    .limit(1);
  if (error) throw new Error(`Could not load conversation state: ${error.message}`);
  const row = data?.[0];
  return row ? { id: row.id as string, stepIndex: row.step_index as number, state: (row.state || []) as LLMMessage[] } : null;
}

export interface TranscriptItem {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  isError?: boolean;
  toolCalls?: LLMMessage['toolCalls'];
}

/** Client-safe transcript from a state: drops provider-internal content (e.g. reasoning blocks). */
export function toTranscript(state: LLMMessage[]): TranscriptItem[] {
  return state
    .filter((m) => m.role !== 'system')
    .map(({ role, content, name, toolCallId, isError, toolCalls }) => ({
      role: role as TranscriptItem['role'],
      content,
      ...(name ? { name } : {}),
      ...(toolCallId ? { toolCallId } : {}),
      ...(isError ? { isError } : {}),
      ...(toolCalls?.length ? { toolCalls } : {}),
    }));
}

export async function getSessionDetail(ctx: Ctx, sessionId: string) {
  const session = await getSession(ctx, sessionId);
  const [checkpoints, latest] = await Promise.all([listCheckpoints(ctx, sessionId), latestCheckpoint(ctx, sessionId)]);
  return { session, checkpoints, transcript: toTranscript(latest?.state || []) };
}

/**
 * Start a new instance from any checkpoint: same settings, and its conversation
 * continues from that checkpoint's state. The source instance is untouched.
 */
export async function forkSession(ctx: Ctx, raw: unknown) {
  const body = forkSessionBody.parse(raw);
  const checkpoint = await getCheckpoint(ctx, body.checkpoint_id);
  const source = await getSession(ctx, checkpoint.session_id as string);

  const fork = await createSession(
    ctx,
    {
      name: body.name || `${source.name} (fork @ step ${checkpoint.step_index})`,
      provider: source.provider,
      model: source.model,
      mcp_profile_id: source.mcp_profile_id,
      context_profile_id: source.context_profile_id,
      allowed_tools: source.team_id ? undefined : source.allowed_tools,
      team_id: source.team_id,
    },
    { forkedFrom: checkpoint.id as string }
  );

  const { error } = await getSupabaseAdminClient()
    .from('checkpoints')
    .insert({
      checkpoint_id: `chk_${crypto.randomUUID()}`,
      thread_id: fork.id,
      session_id: fork.id,
      tenant_id: ctx.tenantId,
      profile_id: `session:${fork.id}`,
      profile_name: fork.name,
      step_index: 1,
      parent_id: checkpoint.id,
      user_message: checkpoint.user_message,
      assistant_message: checkpoint.assistant_message,
      tools_executed: checkpoint.tools_executed,
      usage: {},
      state: checkpoint.state,
      metadata: { forked_from: { session_id: source.id, checkpoint_id: checkpoint.id, step_index: checkpoint.step_index } },
    });
  if (error) throw new Error(`Could not copy checkpoint into the fork: ${error.message}`);
  return fork;
}
