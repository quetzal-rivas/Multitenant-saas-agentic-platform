import crypto from 'crypto';
import { WEB_SEARCH_TOOL } from '@/lib/connectors/registry';
import { FETCH_URL_TOOL } from '@/lib/connectors/fetch-url';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import { listTenantSecrets } from '@/lib/secrets/secrets-service';
import { type LLMMessage, type LLMProvider } from '@/lib/agent/providers/llm-adapter';
import { PROVIDER_ID_PATTERN, PROVIDER_MODES, type ProviderMode } from '@/lib/agent/providers/registry';
import { assertAgentProvider, providerDef, usableProviders } from './llm-providers';
import { PLATFORM_TOOL_DEFINITIONS } from '@/lib/mcp/tool-catalog';
import { getContextProfile } from './context-profiles';
import { getProfile } from './profiles';
import { getVoiceProfile } from './voice-profiles';
import { ServiceError } from './errors';
import { assertCanCreate } from './plan-limits';

type Ctx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode' | 'apiKeyId'>;

// Platform tools, plus the web tools: web_search (through the organization's own LLM key) and fetch_url.
const toolNames: [string, ...string[]] = [WEB_SEARCH_TOOL, FETCH_URL_TOOL, ...PLATFORM_TOOL_DEFINITIONS.map((t) => t.name)];

/** Read-only tools an instance gets when none are chosen explicitly. */
export const DEFAULT_SESSION_TOOLS = PLATFORM_TOOL_DEFINITIONS.filter((t) => t.sideEffect === 'read').map((t) => t.name);

const providerId = z.string().trim().regex(PROVIDER_ID_PATTERN);

export const createSessionBody = z.object({
  name: z.string().trim().min(1).max(120),
  /** Omit (or use provider_mode "auto") to follow the organization's provider order. */
  provider: providerId.optional(),
  model: z.string().trim().min(1).max(120).optional(),
  /** auto: organization order · preferred: this provider first, then rotation · locked: only this provider. */
  provider_mode: z.enum(PROVIDER_MODES).optional(),
  mcp_profile_id: z.string().uuid().nullable().optional(),
  context_profile_id: z.string().uuid().nullable().optional(),
  allowed_tools: z.array(z.enum(toolNames)).max(50).optional(),
  /** Run a team (supervisor + workers) instead of a single configured agent. */
  team_id: z.string().uuid().nullable().optional(),
  instructions: z.string().trim().max(8000).nullable().optional(),
}).strict();

// Changing provider mid-conversation is safe: each provider ignores the others' internal content.
export const updateSessionBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  provider: providerId.optional(),
  model: z.string().trim().min(1).max(120).optional(),
  provider_mode: z.enum(PROVIDER_MODES).optional(),
  mcp_profile_id: z.string().uuid().nullable().optional(),
  context_profile_id: z.string().uuid().nullable().optional(),
  allowed_tools: z.array(z.enum(toolNames)).max(50).optional(),
  /** Voice profile for this instance; null = use the team's (or the platform default). */
  voice_profile_id: z.string().uuid().nullable().optional(),
  instructions: z.string().trim().max(8000).nullable().optional(),
}).strict();

export const forkSessionBody = z.object({
  checkpoint_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
}).strict();

const SESSION_COLUMNS =
  'id, name, agent_type, team_id, provider, model, provider_mode, mcp_profile_id, context_profile_id, voice_profile_id, instructions, created_by_key, allowed_tools, forked_from_checkpoint, created_at, last_active_at';
const CHECKPOINT_SUMMARY_COLUMNS =
  'id, checkpoint_id, session_id, parent_id, step_index, user_message, assistant_message, tools_executed, usage, metadata, created_at';

export interface AgentSession {
  id: string;
  name: string;
  agent_type: 'single' | 'team';
  team_id: string | null;
  voice_profile_id?: string | null;
  /** Per-agent instructions added to the system prompt. */
  instructions?: string | null;
  created_by_key?: string | null;
  provider: LLMProvider;
  model: string;
  /** auto: organization order · preferred: this provider first · locked: only this provider. */
  provider_mode: ProviderMode;
  mcp_profile_id: string | null;
  context_profile_id: string | null;
  allowed_tools: string[];
  forked_from_checkpoint: string | null;
  created_at: string;
  last_active_at: string;
}

/** Providers this organization can use now (turned on, with a key), in its order. */
export async function configuredProviders(tenantId: string): Promise<LLMProvider[]> {
  return (await usableProviders(tenantId)).map((p) => p.id);
}

/** Resolve provider, model and mode for a new or edited agent, validated against the organization. */
export async function resolveAgentLlm(tenantId: string, input: { provider?: string | null; model?: string | null; provider_mode?: ProviderMode | null }) {
  const mode: ProviderMode = input.provider_mode ?? (input.provider ? 'preferred' : 'auto');
  await assertAgentProvider(tenantId, { provider: input.provider, mode });
  // Auto agents still store a provider (the organization's first) for display and old clients.
  const provider = input.provider || (await usableProviders(tenantId))[0]?.id;
  const def = provider ? await providerDef(tenantId, provider) : null;
  if (!provider || !def) throw new ServiceError('No LLM provider is on with a key. Add or turn one on in Account & Billing → LLM providers.', 'CONFLICT');
  return { provider, model: input.model || def.defaultModel, provider_mode: mode };
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
  // Team instances are conversations of a team (limited by teams); single agents count.
  if (!body.team_id) await assertCanCreate(ctx.tenantId, 'agents');
  // A team's instance runs on the team's providers; a single agent on its own.
  const llm = body.team_id
    ? { provider: body.provider || 'anthropic', model: body.model || 'team', provider_mode: body.provider_mode ?? ('preferred' as ProviderMode) }
    : await resolveAgentLlm(ctx.tenantId, body);
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
      provider: llm.provider,
      model: llm.model,
      provider_mode: llm.provider_mode,
      mcp_profile_id: body.mcp_profile_id || null,
      context_profile_id: body.context_profile_id || null,
      allowed_tools: body.team_id ? [] : body.allowed_tools ?? DEFAULT_SESSION_TOOLS,
      instructions: body.instructions || null,
      created_by_key: ctx.authMode === 'api_key' ? ctx.apiKeyId ?? null : null,
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
  if (body.provider !== undefined || body.model !== undefined || body.provider_mode !== undefined) {
    const current = await getSession(ctx, id);
    const changingProvider = body.provider !== undefined && body.provider !== current.provider;
    Object.assign(
      patch,
      await resolveAgentLlm(ctx.tenantId, {
        provider: body.provider ?? current.provider,
        // A new provider gets its default model unless one is given.
        model: body.model ?? (changingProvider ? null : current.model),
        provider_mode: body.provider_mode ?? current.provider_mode,
      })
    );
  }
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
