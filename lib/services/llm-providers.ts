import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import { deleteTenantSecret, getTenantSecret, listTenantSecrets, setTenantSecret, type BYOKProvider } from '@/lib/secrets/secrets-service';
import {
  BUILT_IN_IDS,
  BUILT_IN_PROVIDERS,
  DEFAULT_PROVIDER_ORDER,
  PROVIDER_ID_PATTERN,
  customProviderDef,
  secretNameFor,
  type ProviderDef,
  type ProviderMode,
} from '@/lib/agent/providers/registry';
import { generateLLMResponse } from '@/lib/agent/providers/llm-adapter';
import { ServiceError } from './errors';

/**
 * The LLM providers an organization can use: the built-in ones plus its own OpenAI-compatible
 * providers, each with a key, an on/off switch and a place in the organization's order. Also
 * builds the provider chain an agent runs on, from its mode (auto / preferred / locked).
 */

type Ctx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode'>;
type Row = Record<string, any>;
type SecretGetter = (tenantId: string, provider: BYOKProvider) => Promise<string | null>;
const db = () => getSupabaseAdminClient();

export interface OrgLlmSettings {
  order: string[];
  disabled: string[];
}

export interface OrgProvider extends ProviderDef {
  configured: boolean;
  enabled: boolean;
  /** Position in the organization's order (0 = first). */
  rank: number;
}

export async function orgLlmSettings(tenantId: string): Promise<OrgLlmSettings> {
  const { data } = await db().from('organizations').select('llm_settings').eq('id', tenantId).maybeSingle();
  const s = (data?.llm_settings ?? {}) as Partial<OrgLlmSettings>;
  return { order: Array.isArray(s.order) ? s.order : DEFAULT_PROVIDER_ORDER, disabled: Array.isArray(s.disabled) ? s.disabled : [] };
}

async function customRows(tenantId: string): Promise<Row[]> {
  const { data } = await db()
    .from('llm_providers')
    .select('id, slug, label, base_url, default_model, fast_model, supports_tools, created_at')
    .eq('tenant_id', tenantId)
    .is('archived_at', null)
    .order('created_at', { ascending: true });
  return data || [];
}

/** Every provider definition this organization can use (built-in first, then its own). */
export async function providerDefs(tenantId: string): Promise<ProviderDef[]> {
  return [...BUILT_IN_PROVIDERS, ...(await customRows(tenantId)).map((r) => customProviderDef(r as any))];
}

/** Definitions in the organization's order (unlisted ones go last, in registry order). */
function ordered(defs: ProviderDef[], order: string[]): ProviderDef[] {
  const rank = (id: string) => {
    const i = order.indexOf(id);
    return i === -1 ? order.length + defs.findIndex((d) => d.id === id) : i;
  };
  return [...defs].sort((a, b) => rank(a.id) - rank(b.id));
}

export async function listOrgProviders(tenantId: string): Promise<OrgProvider[]> {
  const [defs, settings, secrets] = await Promise.all([providerDefs(tenantId), orgLlmSettings(tenantId), listTenantSecrets(tenantId)]);
  const stored = new Set(secrets.map((s) => s.provider as string));
  return ordered(defs, settings.order).map((d, rank) => ({
    ...d,
    configured: stored.has(secretNameFor(d.id)),
    enabled: !settings.disabled.includes(d.id),
    rank,
  }));
}

/** Providers that are on and have a key, in the organization's order. */
export async function usableProviders(tenantId: string): Promise<OrgProvider[]> {
  return (await listOrgProviders(tenantId)).filter((p) => p.enabled && p.configured);
}

export async function providerDef(tenantId: string, id: string): Promise<ProviderDef | null> {
  return (await providerDefs(tenantId)).find((d) => d.id === id) ?? null;
}

export function providerKey(tenantId: string, id: string, getSecret: SecretGetter = getTenantSecret): Promise<string | null> {
  return getSecret(tenantId, secretNameFor(id) as BYOKProvider);
}

/** An agent is valid for this organization: its provider exists and (unless auto) has a key. */
export async function assertAgentProvider(tenantId: string, llm: { provider?: string | null; mode: ProviderMode }) {
  if (llm.mode === 'auto') {
    if (!(await usableProviders(tenantId)).length) {
      throw new ServiceError('No LLM provider is on with a key. Add or turn one on in Account & Billing → LLM providers.', 'CONFLICT');
    }
    return;
  }
  if (!llm.provider) throw new ServiceError('Choose a provider, or use Automatic.', 'INVALID');
  const p = (await listOrgProviders(tenantId)).find((x) => x.id === llm.provider);
  if (!p) throw new ServiceError(`Unknown LLM provider "${llm.provider}". Add it in Account & Billing → LLM providers.`, 'INVALID');
  if (!p.configured) throw new ServiceError(`No ${p.label} API key is stored for this organization. Add one in Account & Billing → LLM providers first.`, 'CONFLICT');
}

// ---------------------------------------------------------------------------
// The chain an agent runs on
// ---------------------------------------------------------------------------

export interface AgentLlm {
  provider: string | null;
  model: string | null;
  mode: ProviderMode;
}

export interface ChainLink {
  def: ProviderDef;
  model: string;
  apiKey: string;
}

/**
 * The providers an agent tries, in order.
 * - locked: only its provider and model (an error if it is off or has no key).
 * - preferred: its provider and model first, then the organization's order.
 * - auto: the organization's order, each with its default (or fast) model.
 * Providers that are off or have no key are skipped (except a locked one, which fails).
 */
export async function providerChain(tenantId: string, agent: AgentLlm, opts: { fast?: boolean; getSecret?: SecretGetter } = {}): Promise<ChainLink[]> {
  const getSecret = opts.getSecret ?? getTenantSecret;
  const [defs, settings] = await Promise.all([providerDefs(tenantId), orgLlmSettings(tenantId)]);
  const defaultModel = (d: ProviderDef) => (opts.fast ? d.fastModel : d.defaultModel) || d.defaultModel;

  if (agent.mode === 'locked') {
    const def = defs.find((d) => d.id === agent.provider);
    if (!def) throw new ServiceError(`This agent is locked to "${agent.provider}", which no longer exists. Edit the agent or add the provider again.`, 'CONFLICT');
    if (settings.disabled.includes(def.id)) throw new ServiceError(`This agent is locked to ${def.label}, which is turned off for this organization.`, 'CONFLICT');
    const apiKey = await getSecret(tenantId, secretNameFor(def.id) as BYOKProvider);
    if (!apiKey) throw new ServiceError(`This agent is locked to ${def.label}, but no ${def.label} key is stored.`, 'CONFLICT');
    return [{ def, model: agent.model || defaultModel(def), apiKey }];
  }

  const chain: ChainLink[] = [];
  const add = async (def: ProviderDef, model: string) => {
    if (settings.disabled.includes(def.id) || chain.some((c) => c.def.id === def.id)) return;
    const apiKey = await getSecret(tenantId, secretNameFor(def.id) as BYOKProvider).catch(() => null);
    if (apiKey) chain.push({ def, model, apiKey });
  };
  if (agent.mode === 'preferred' && agent.provider) {
    const own = defs.find((d) => d.id === agent.provider);
    if (own) await add(own, agent.model || defaultModel(own));
  }
  for (const def of ordered(defs, settings.order)) await add(def, defaultModel(def));
  if (!chain.length) {
    const own = agent.mode === 'preferred' ? defs.find((d) => d.id === agent.provider) : null;
    throw new ServiceError(
      own
        ? `No ${own.label} API key is stored for this organization, and no other provider is on with a key. Add one in Account & Billing → LLM providers.`
        : 'No LLM provider is on with a key. Add or turn one on in Account & Billing → LLM providers.',
      'CONFLICT'
    );
  }
  return chain;
}

// ---------------------------------------------------------------------------
// Settings and the organization's own providers
// ---------------------------------------------------------------------------

export const llmSettingsBody = z
  .object({
    order: z.array(z.string().regex(PROVIDER_ID_PATTERN)).max(50),
    disabled: z.array(z.string().regex(PROVIDER_ID_PATTERN)).max(50),
  })
  .strict();

export async function setLlmSettings(ctx: Ctx, raw: unknown): Promise<OrgLlmSettings> {
  const body = llmSettingsBody.parse(raw);
  const ids = new Set((await providerDefs(ctx.tenantId)).map((d) => d.id));
  const unknown = [...body.order, ...body.disabled].filter((id) => !ids.has(id));
  if (unknown.length) throw new ServiceError(`Unknown provider(s): ${[...new Set(unknown)].join(', ')}.`, 'INVALID');
  const settings = { order: [...new Set(body.order)], disabled: [...new Set(body.disabled)] };
  const { error } = await db().from('organizations').update({ llm_settings: settings }).eq('id', ctx.tenantId);
  if (error) throw new Error(`Could not save provider settings: ${error.message}`);
  return settings;
}

/** Agents locked to a provider (shown before turning it off or removing it). */
export async function agentsLockedTo(tenantId: string, providerId: string): Promise<Array<{ kind: 'instance' | 'team' | 'worker'; id: string; name: string }>> {
  const [sessions, teams, workers] = await Promise.all([
    db().from('agent_sessions').select('id, name').eq('tenant_id', tenantId).eq('provider', providerId).eq('provider_mode', 'locked').eq('agent_type', 'single').is('archived_at', null),
    db().from('agent_teams').select('id, name').eq('tenant_id', tenantId).eq('provider', providerId).eq('provider_mode', 'locked').is('archived_at', null),
    db().from('team_workers').select('id, name, team_id').eq('tenant_id', tenantId).eq('provider', providerId).eq('provider_mode', 'locked'),
  ]);
  return [
    ...(sessions.data || []).map((r: Row) => ({ kind: 'instance' as const, id: r.id, name: r.name })),
    ...(teams.data || []).map((r: Row) => ({ kind: 'team' as const, id: r.id, name: r.name })),
    ...(workers.data || []).map((r: Row) => ({ kind: 'worker' as const, id: r.id, name: r.name })),
  ];
}

const customBody = z
  .object({
    slug: z.string().trim().toLowerCase().regex(PROVIDER_ID_PATTERN, 'Use lowercase letters, numbers, - or _ (up to 40).'),
    label: z.string().trim().min(1).max(60),
    base_url: z.string().trim().url().max(300).refine((u) => u.startsWith('https://'), 'The URL must start with https://'),
    default_model: z.string().trim().min(1).max(120),
    fast_model: z.string().trim().min(1).max(120).nullable().optional(),
    api_key: z.string().trim().min(8).max(500).optional(),
  })
  .strict();

export const createCustomProviderBody = customBody.extend({ api_key: z.string().trim().min(8).max(500) });
export const updateCustomProviderBody = customBody.omit({ slug: true }).partial();

/**
 * Check a provider with a tiny request that offers one tool, before saving it: it must answer,
 * and we learn whether it understands tools (agents need them).
 */
export async function testProvider(def: ProviderDef, apiKey: string, model?: string): Promise<{ ok: boolean; tools: boolean; message: string }> {
  try {
    const res = await generateLLMResponse({
      provider: def.id,
      def,
      model: model || def.defaultModel,
      apiKey,
      maxTokens: 200,
      attemptTimeoutMs: 20_000,
      systemPrompt: 'You are a connectivity check. Call the ping tool with {"value": "ok"}.',
      messages: [{ role: 'user', content: 'Run the check.' }],
      tools: [{ name: 'ping', description: 'Connectivity check', parameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] } }],
    });
    const tools = !!res.toolCalls?.some((c) => c.name === 'ping');
    return {
      ok: true,
      tools,
      message: tools ? `${def.label} answered and used a tool (${res.model ?? model ?? def.defaultModel}).` : `${def.label} answered, but did not use the tool: agents that need tools may not work well with this model.`,
    };
  } catch (err) {
    return { ok: false, tools: false, message: ((err as Error)?.message || 'The provider did not answer.').slice(0, 300) };
  }
}

export async function createCustomProvider(ctx: Ctx, raw: unknown) {
  const body = createCustomProviderBody.parse(raw);
  if (BUILT_IN_IDS.includes(body.slug)) throw new ServiceError(`"${body.slug}" is a built-in provider. Add its key in the list instead.`, 'INVALID');
  if ((await customRows(ctx.tenantId)).some((r) => r.slug === body.slug)) throw new ServiceError(`A provider called "${body.slug}" already exists.`, 'CONFLICT');
  const row = { slug: body.slug, label: body.label, base_url: body.base_url.replace(/\/+$/, ''), default_model: body.default_model, fast_model: body.fast_model ?? null, supports_tools: true };
  const check = await testProvider(customProviderDef(row), body.api_key);
  if (!check.ok) throw new ServiceError(`The provider did not answer: ${check.message}`, 'INVALID');
  const { data, error } = await db()
    .from('llm_providers')
    .insert({ tenant_id: ctx.tenantId, ...row, supports_tools: check.tools, created_by: ctx.authMode === 'session' ? ctx.userId : null })
    .select('id, slug, label, base_url, default_model, fast_model, supports_tools, created_at')
    .single();
  if (error || !data) throw new Error(`Could not save the provider: ${error?.message}`);
  await setTenantSecret(ctx.tenantId, secretNameFor(body.slug) as BYOKProvider, body.api_key);
  return { provider: customProviderDef(data as any), check };
}

export async function updateCustomProvider(ctx: Ctx, slug: string, raw: unknown) {
  const body = updateCustomProviderBody.parse(raw);
  const existing = (await customRows(ctx.tenantId)).find((r) => r.slug === slug);
  if (!existing) throw new ServiceError('Provider not found.', 'NOT_FOUND');
  const next = {
    ...existing,
    ...(body.label ? { label: body.label } : {}),
    ...(body.base_url ? { base_url: body.base_url.replace(/\/+$/, '') } : {}),
    ...(body.default_model ? { default_model: body.default_model } : {}),
    ...(body.fast_model !== undefined ? { fast_model: body.fast_model } : {}),
  };
  const apiKey = body.api_key ?? (await providerKey(ctx.tenantId, slug));
  let supportsTools = existing.supports_tools;
  if (body.api_key || body.base_url || body.default_model) {
    if (!apiKey) throw new ServiceError('Enter the API key to check the provider.', 'INVALID');
    const check = await testProvider(customProviderDef(next as any), apiKey);
    if (!check.ok) throw new ServiceError(`The provider did not answer: ${check.message}`, 'INVALID');
    supportsTools = check.tools;
  }
  const { error } = await db()
    .from('llm_providers')
    .update({ label: next.label, base_url: next.base_url, default_model: next.default_model, fast_model: next.fast_model ?? null, supports_tools: supportsTools, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
    .eq('tenant_id', ctx.tenantId);
  if (error) throw new Error(`Could not update the provider: ${error.message}`);
  if (body.api_key) await setTenantSecret(ctx.tenantId, secretNameFor(slug) as BYOKProvider, body.api_key);
  return { provider: customProviderDef({ ...next, supports_tools: supportsTools } as any) };
}

/** Remove an organization's own provider (refused while an agent is locked to it). */
export async function deleteCustomProvider(ctx: Ctx, slug: string) {
  const existing = (await customRows(ctx.tenantId)).find((r) => r.slug === slug);
  if (!existing) throw new ServiceError('Provider not found.', 'NOT_FOUND');
  const locked = await agentsLockedTo(ctx.tenantId, slug);
  if (locked.length) {
    throw new ServiceError(`These agents are locked to ${existing.label}: ${locked.map((a) => a.name).join(', ')}. Change them first.`, 'CONFLICT');
  }
  await db().from('llm_providers').update({ archived_at: new Date().toISOString() }).eq('id', existing.id).eq('tenant_id', ctx.tenantId);
  await deleteTenantSecret(ctx.tenantId, secretNameFor(slug) as BYOKProvider).catch(() => undefined);
  return { removed: slug };
}

/** Check a stored provider again (the "Test" button). */
export async function testStoredProvider(ctx: Ctx, id: string) {
  const def = await providerDef(ctx.tenantId, id);
  if (!def) throw new ServiceError('Provider not found.', 'NOT_FOUND');
  const apiKey = await providerKey(ctx.tenantId, id);
  if (!apiKey) throw new ServiceError(`No ${def.label} key is stored.`, 'CONFLICT');
  return testProvider(def, apiKey);
}
