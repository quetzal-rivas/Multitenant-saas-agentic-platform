import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import { envelopeDecryptSecret, envelopeEncryptSecret, type EncryptedSecretPayload } from '@/lib/secrets/envelope-encryption';
import { getTenantSecret } from '@/lib/secrets/secrets-service';
import { createPlatformApiKey, revokePlatformApiKey } from '@/lib/auth/api-keys';
import { ELEVENLABS_SYNC_VERSION, ElevenLabsSyncError, enableElevenLabsMcpServers, voiceAvailable, deleteElevenLabsAgent, newSipCredentials, syncElevenLabsAgent, voiceFrontPrompt, type ElevenLabsState } from '@/lib/rooms/elevenlabs';
import { ROOM_TOOL_NAMES, ROOM_SCOPES } from '@/lib/mcp/tool-catalog';
import { getTeam } from './teams';
import { getContextProfile } from './context-profiles';
import { getProfile } from './profiles';
import { getVoiceProfile } from './voice-profiles';
import { ServiceError } from './errors';
import { assertFeature } from './plan-limits';

/**
 * Voice agents ("Voice Front"): who answers or places calls. Mode 'elevenlabs' puts a
 * hosted ElevenLabs agent in the room (our context profile + MCP profile + team as tools);
 * mode 'turn_based' answers turn by turn with any team through the platform's own speech.
 */

type Ctx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode'>;
type Row = Record<string, any>;

const COLUMNS =
  'id, tenant_id, name, mode, team_id, context_profile_id, mcp_profile_id, voice_profile_id, language, instructions, greeting, consent_message, listener_team_id, triggers, calling_hours, max_minutes, provider_state, secrets, created_at, updated_at';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const trigger = z.discriminatedUnion('type', [
  z.object({ type: z.literal('keyword'), any: z.array(z.string().trim().min(1).max(60)).min(1).max(30), role: z.enum(['customer', 'agent', 'staff']).nullable().optional() }).strict(),
  z.object({ type: z.literal('silence'), role: z.enum(['customer', 'agent', 'staff']), seconds: z.number().int().min(15).max(3600) }).strict(),
  z.object({ type: z.literal('every'), seconds: z.number().int().min(30).max(3600) }).strict(),
]);

export const voiceAgentSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    mode: z.enum(['elevenlabs', 'turn_based']),
    team_id: z.string().uuid(),
    context_profile_id: z.string().uuid().nullable().default(null),
    mcp_profile_id: z.string().uuid().nullable().default(null),
    voice_profile_id: z.string().uuid().nullable().default(null),
    language: z.string().trim().min(2).max(16).default('es'),
    instructions: z.string().trim().max(8000).nullable().default(null),
    greeting: z.string().trim().max(500).nullable().default(null),
    consent_message: z.string().trim().max(500).nullable().default(null),
    listener_team_id: z.string().uuid().nullable().default(null),
    triggers: z.array(trigger).max(20).default([]),
    calling_hours: z
      .object({ timezone: z.string().min(1).max(64), days: z.array(z.number().int().min(0).max(6)).min(1).max(7), start: hhmm, end: hhmm })
      .strict()
      .nullable()
      .default(null),
    max_minutes: z.number().int().min(1).max(120).default(15),
    elevenlabs_voice_id: z.string().trim().max(80).nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.calling_hours) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: v.calling_hours.timezone });
      } catch {
        ctx.addIssue({ code: 'custom', path: ['calling_hours', 'timezone'], message: 'Unknown time zone' });
      }
    }
  });

export type VoiceAgentInput = z.infer<typeof voiceAgentSchema>;

export function presentVoiceAgent(row: Row): Row & { id: string; name: string; mode: 'elevenlabs' | 'turn_based'; elevenlabs: { agent_id: string | null; synced_at: string | null; error: string | null; voice_id: string | null; voice_warning: string | null; ready: boolean } | null } {
  const { secrets: _s, tenant_id: _t, provider_state, ...rest } = row;
  const el = (provider_state?.elevenlabs ?? {}) as ElevenLabsState & { voice_id?: string | null };
  return {
    ...rest,
    id: row.id,
    name: row.name,
    mode: row.mode,
    elevenlabs: row.mode === 'elevenlabs' ? { agent_id: el.agent_id ?? null, synced_at: el.synced_at ?? null, error: el.error ?? null, voice_id: el.voice_id ?? null, voice_warning: (el as Row).voice_warning ?? null, ready: !!(el.agent_id && el.sip_identifier && !el.error) } : null,
    post_call_endpoint_id: provider_state?.post_call_endpoint_id ?? null,
  };
}

export async function loadVoiceAgent(tenantId: string, id: string): Promise<Row> {
  const { data } = await getSupabaseAdminClient().from('voice_agents').select(COLUMNS).eq('id', id).eq('tenant_id', tenantId).is('archived_at', null).maybeSingle();
  if (!data) throw new ServiceError('Voice agent not found in this organization.', 'NOT_FOUND');
  return data;
}

export async function listVoiceAgents(ctx: Pick<Ctx, 'tenantId'>) {
  const { data } = await getSupabaseAdminClient().from('voice_agents').select(COLUMNS).eq('tenant_id', ctx.tenantId).is('archived_at', null).order('created_at', { ascending: true });
  return (data || []).map(presentVoiceAgent);
}

async function assertReferences(ctx: Ctx, v: VoiceAgentInput) {
  await getTeam(ctx, v.team_id);
  if (v.listener_team_id) await getTeam(ctx, v.listener_team_id);
  if (v.context_profile_id) await getContextProfile(ctx, v.context_profile_id);
  if (v.mcp_profile_id) await getProfile(ctx, { profile_id: v.mcp_profile_id });
  if (v.voice_profile_id) await getVoiceProfile(ctx, v.voice_profile_id);
}

const secretContext = (agentId: string, name: string) => `vagent:${agentId}:${name}`;

export async function voiceAgentSecrets(row: Row): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, payload] of Object.entries(row.secrets ?? {})) {
    out[name] = await envelopeDecryptSecret(payload as EncryptedSecretPayload, row.tenant_id, secretContext(row.id, name));
  }
  return out;
}

function rowFields(v: VoiceAgentInput) {
  const { elevenlabs_voice_id: _v, ...fields } = v;
  return fields;
}

export async function createVoiceAgent(ctx: Ctx, raw: unknown, publicOrigin: string) {
  await assertFeature(ctx.tenantId, 'voice_telephony');
  const v = voiceAgentSchema.parse(raw);
  await assertReferences(ctx, v);
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdminClient()
    .from('voice_agents')
    .insert({ tenant_id: ctx.tenantId, ...rowFields(v), provider_state: { elevenlabs: { voice_id: v.elevenlabs_voice_id ?? null } }, secrets: {}, created_by: ctx.authMode === 'session' ? ctx.userId : null, created_at: now, updated_at: now })
    .select(COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not create the voice agent: ${error?.message}`);
  if (v.mode === 'elevenlabs') return presentVoiceAgent(await syncVoiceFront(ctx, data, publicOrigin));
  return presentVoiceAgent(data);
}

export async function updateVoiceAgent(ctx: Ctx, id: string, raw: unknown, publicOrigin: string) {
  await assertFeature(ctx.tenantId, 'voice_telephony');
  const existing = await loadVoiceAgent(ctx.tenantId, id);
  const v = voiceAgentSchema.parse(raw);
  await assertReferences(ctx, v);
  const providerState = { ...(existing.provider_state ?? {}), elevenlabs: { ...(existing.provider_state?.elevenlabs ?? {}), voice_id: v.elevenlabs_voice_id ?? existing.provider_state?.elevenlabs?.voice_id ?? null } };
  const { data, error } = await getSupabaseAdminClient()
    .from('voice_agents')
    .update({ ...rowFields(v), provider_state: providerState, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select(COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not update the voice agent: ${error?.message}`);
  if (v.mode === 'elevenlabs') return presentVoiceAgent(await syncVoiceFront(ctx, data, publicOrigin));
  return presentVoiceAgent(data);
}

/**
 * Minute tick: re-sync ElevenLabs voice agents set up by an older version of the sync, a few at
 * a time. A failed automatic attempt is not retried until the next version (a person can still
 * save the agent to retry).
 */
export async function resyncOutdatedVoiceAgents(limit = 3): Promise<{ resynced: number; failed: number }> {
  const db = getSupabaseAdminClient();
  const { data } = await db.from('voice_agents').select(COLUMNS).eq('mode', 'elevenlabs').is('archived_at', null).limit(500);
  const outdated = (data || [])
    .filter((r: Row) => {
      const el = r.provider_state?.elevenlabs ?? {};
      return (el.agent_id || el.synced_at) && el.sync_version !== ELEVENLABS_SYNC_VERSION && el.sync_attempted_version !== ELEVENLABS_SYNC_VERSION;
    })
    .slice(0, limit);
  let resynced = 0;
  let failed = 0;
  for (const row of outdated) {
    const { data: conn } = await db.from('telephony_connections').select('public_origin').eq('tenant_id', row.tenant_id).maybeSingle();
    const origin = conn?.public_origin || process.env.APP_URL?.replace(/\/$/, '');
    if (!origin) continue;
    const ctx = { tenantId: row.tenant_id, userId: 'voice-sync', role: 'system', scopes: ['*'], authMode: 'webhook_signature' } as unknown as Ctx;
    const ps = row.provider_state ?? {};
    row.provider_state = { ...ps, elevenlabs: { ...(ps.elevenlabs ?? {}), sync_attempted_version: ELEVENLABS_SYNC_VERSION } };
    const saved = await syncVoiceFront(ctx, row, origin).catch(() => null);
    if (saved?.provider_state?.elevenlabs?.sync_version === ELEVENLABS_SYNC_VERSION) resynced++;
    else failed++;
  }
  return { resynced, failed };
}

/**
 * A person enabled MCP servers in their ElevenLabs workspace (accepting ElevenLabs' terms):
 * flip the setting with the saved key, then sync every ElevenLabs voice agent again.
 */
export async function enableElevenLabsMcp(ctx: Ctx, publicOrigin: string) {
  await assertFeature(ctx.tenantId, 'voice_telephony');
  const elKey = await getTenantSecret(ctx.tenantId, 'elevenlabs');
  if (!elKey) throw new ServiceError('Add an ElevenLabs key first.', 'CONFLICT');
  await enableElevenLabsMcpServers(elKey);
  const { data } = await getSupabaseAdminClient().from('voice_agents').select(COLUMNS).eq('tenant_id', ctx.tenantId).eq('mode', 'elevenlabs').is('archived_at', null);
  const synced = [];
  for (const row of data || []) synced.push(presentVoiceAgent(await syncVoiceFront(ctx, row, publicOrigin)));
  return { enabled: true, voice_agents: synced };
}

export async function archiveVoiceAgent(ctx: Ctx, id: string) {
  const row = await loadVoiceAgent(ctx.tenantId, id);
  const db = getSupabaseAdminClient();
  await db.from('voice_agents').update({ archived_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', ctx.tenantId);
  await db.from('phone_numbers').update({ voice_agent_id: null }).eq('voice_agent_id', id).eq('tenant_id', ctx.tenantId);
  if (row.provider_state?.mcp_key_id) await revokePlatformApiKey(ctx.tenantId, row.provider_state.mcp_key_id).catch(() => undefined);
  const elKey = await getTenantSecret(ctx.tenantId, 'elevenlabs');
  if (elKey && row.provider_state?.elevenlabs) await deleteElevenLabsAgent(elKey, row.provider_state.elevenlabs);
}

/**
 * Create/update the ElevenLabs side: a fresh scoped platform key (bound to the MCP
 * profile, room tools only), the MCP server, the agent and its SIP entry.
 */
export async function syncVoiceFront(ctx: Ctx, row: Row, publicOrigin: string): Promise<Row> {
  const db = getSupabaseAdminClient();
  const elKey = await getTenantSecret(ctx.tenantId, 'elevenlabs');
  const state = { ...(row.provider_state ?? {}) };
  const elState: ElevenLabsState & { voice_id?: string | null } = { ...(state.elevenlabs ?? {}) };
  const saveState = async (patch: Row, secrets?: Row) => {
    const { data } = await db
      .from('voice_agents')
      .update({ provider_state: patch, ...(secrets ? { secrets } : {}), updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .select(COLUMNS)
      .single();
    return data as Row;
  };
  if (!elKey) return saveState({ ...state, elevenlabs: { ...elState, error: 'Add an ElevenLabs key in Settings → keys, then save again.' } });

  let key: Awaited<ReturnType<typeof createPlatformApiKey>> | null = null;
  try {
    const team = await getTeam(ctx, row.team_id);
    // Rotate the MCP key: mint a new one now, revoke the previous one only once the sync worked.
    key = await createPlatformApiKey(ctx.tenantId, {
      name: `Voice agent · ${row.name}`.slice(0, 80),
      scopes: [...ROOM_SCOPES, ...(row.mcp_profile_id ? ['mcp:functions:invoke', 'mcp:connectors:invoke'] : [])],
      toolsWhitelist: [...ROOM_TOOL_NAMES],
      profileId: row.mcp_profile_id,
      createdBy: ctx.authMode === 'session' ? ctx.userId : null,
    });
    // A voice from another ElevenLabs account: sync with the default voice and say so (the choice is kept).
    const chosenVoice: string | null = elState.voice_id ?? null;
    const voiceMissing = !!chosenVoice && !(await voiceAvailable(elKey, chosenVoice));
    const existingSecrets = await voiceAgentSecrets(row).catch(() => ({} as Record<string, string>));
    const sip = existingSecrets.sip_username && existingSecrets.sip_password ? { username: existingSecrets.sip_username, password: existingSecrets.sip_password } : newSipCredentials();
    const synced = await syncElevenLabsAgent(
      elKey,
      {
        name: row.name,
        prompt: voiceFrontPrompt({ name: row.name, instructions: row.instructions, teamName: team.name, language: row.language }),
        firstMessage: row.greeting,
        language: row.language,
        maxSeconds: row.max_minutes * 60,
        voiceId: voiceMissing ? null : chosenVoice,
        mcpUrl: `${publicOrigin}/api/mcp/platform`,
        mcpKey: key.rawKey,
        sipUsername: sip.username,
        sipPassword: sip.password,
      },
      elState
    );
    const secrets = {
      sip_username: await envelopeEncryptSecret(sip.username, ctx.tenantId, secretContext(row.id, 'sip_username')),
      sip_password: await envelopeEncryptSecret(sip.password, ctx.tenantId, secretContext(row.id, 'sip_password')),
    };
    if (state.mcp_key_id) await revokePlatformApiKey(ctx.tenantId, state.mcp_key_id).catch(() => undefined);
    const voice_warning = voiceMissing
      ? "The chosen voice isn't in the ElevenLabs account of your current key (custom voices belong to one account). Calls use the agent's default voice until you pick another one."
      : null;
    return saveState({ ...state, mcp_key_id: key.id, elevenlabs: { ...synced, voice_id: chosenVoice, voice_warning } }, secrets);
  } catch (err) {
    const message = (err as Error)?.message || 'ElevenLabs sync failed.';
    // The new key never went live: revoke it and keep the previous one.
    if (key) await revokePlatformApiKey(ctx.tenantId, key.id).catch(() => undefined);
    // Keep ids created before the failure so the next attempt reuses them instead of duplicating.
    const partial = err instanceof ElevenLabsSyncError ? err.partialState : elState;
    return saveState({ ...state, elevenlabs: { ...elState, ...partial, voice_id: elState.voice_id ?? null, error: message.slice(0, 500) } });
  }
}

/** Calling hours check in the agent's time zone (null = always allowed). */
export function withinCallingHours(hours: Row | null | undefined, at = new Date()): boolean {
  if (!hours) return true;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: hours.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const minutes = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
  const [sh, sm] = String(hours.start).split(':').map(Number);
  const [eh, em] = String(hours.end).split(':').map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const inWindow = start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  return hours.days.includes(day) && inWindow;
}
