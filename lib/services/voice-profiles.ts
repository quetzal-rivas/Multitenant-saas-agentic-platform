import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import { voiceProfileSchema, type VoiceProfile } from '@/lib/voice/profile-spec';
import { ServiceError } from './errors';

/**
 * Voice profiles: which provider listens, which voice speaks, and how replies are styled
 * when spoken. Teams and Agent Studio instances point at one; an instance's own profile
 * wins over its team's.
 */

type Ctx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode'>;

const COLUMNS = 'id, name, language, stt, tts, fallback, daily_caps, reply_style, created_at, updated_at';

function present(row: Record<string, any>): VoiceProfile {
  return {
    id: row.id,
    name: row.name,
    language: row.language ?? 'en',
    stt: row.stt ?? { provider: 'gemini' },
    tts: row.tts ?? { provider: 'gemini', voice_id: 'Kore' },
    fallback: row.fallback ?? true,
    daily_caps: row.daily_caps ?? {},
    reply_style: row.reply_style ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listVoiceProfiles(ctx: Pick<Ctx, 'tenantId'>): Promise<VoiceProfile[]> {
  const { data, error } = await getSupabaseAdminClient()
    .from('voice_profiles')
    .select(COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .is('archived_at', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Could not list voice profiles: ${error.message}`);
  return (data || []).map(present);
}

export async function getVoiceProfile(ctx: Pick<Ctx, 'tenantId'>, id: string): Promise<VoiceProfile> {
  const { data, error } = await getSupabaseAdminClient()
    .from('voice_profiles')
    .select(COLUMNS)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw new Error(`Could not load voice profile: ${error.message}`);
  if (!data) throw new ServiceError('Voice profile not found in this organization.', 'NOT_FOUND');
  return present(data);
}

function duplicate(error: { code?: string } | null, name: string) {
  if (error?.code === '23505') throw new ServiceError(`A voice profile named '${name}' already exists.`, 'CONFLICT');
}

export async function createVoiceProfile(ctx: Ctx, raw: unknown): Promise<VoiceProfile> {
  const spec = voiceProfileSchema.parse(raw);
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdminClient()
    .from('voice_profiles')
    .insert({
      tenant_id: ctx.tenantId,
      ...spec,
      reply_style: spec.reply_style ?? null,
      created_by: ctx.authMode === 'session' ? ctx.userId : null,
      created_at: now,
      updated_at: now,
    })
    .select(COLUMNS)
    .single();
  duplicate(error, spec.name);
  if (error || !data) throw new Error(`Could not create voice profile: ${error?.message}`);
  return present(data);
}

export async function updateVoiceProfile(ctx: Ctx, id: string, raw: unknown): Promise<VoiceProfile> {
  const spec = voiceProfileSchema.parse(raw);
  await getVoiceProfile(ctx, id);
  const { data, error } = await getSupabaseAdminClient()
    .from('voice_profiles')
    .update({ ...spec, reply_style: spec.reply_style ?? null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select(COLUMNS)
    .single();
  duplicate(error, spec.name);
  if (error || !data) throw new Error(`Could not update voice profile: ${error?.message}`);
  return present(data);
}

export async function archiveVoiceProfile(ctx: Ctx, id: string): Promise<void> {
  await getVoiceProfile(ctx, id);
  const db = getSupabaseAdminClient();
  await db.from('voice_profiles').update({ archived_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', ctx.tenantId);
  // Detach it so teams and instances stop using an archived profile.
  await db.from('agent_teams').update({ voice_profile_id: null }).eq('voice_profile_id', id).eq('tenant_id', ctx.tenantId);
  await db.from('agent_sessions').update({ voice_profile_id: null }).eq('voice_profile_id', id).eq('tenant_id', ctx.tenantId);
}

/** The profile an instance speaks with: its own, else its team's, else none. */
export async function resolveVoiceProfile(ctx: Pick<Ctx, 'tenantId'>, sessionId: string): Promise<VoiceProfile | null> {
  const db = getSupabaseAdminClient();
  const { data: session } = await db
    .from('agent_sessions')
    .select('id, team_id, voice_profile_id')
    .eq('id', sessionId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!session) throw new ServiceError('Agent instance not found in this organization.', 'NOT_FOUND');
  let profileId: string | null = session.voice_profile_id ?? null;
  if (!profileId && session.team_id) {
    const { data: team } = await db.from('agent_teams').select('voice_profile_id').eq('id', session.team_id).eq('tenant_id', ctx.tenantId).maybeSingle();
    profileId = team?.voice_profile_id ?? null;
  }
  if (!profileId) return null;
  try {
    return await getVoiceProfile(ctx, profileId);
  } catch (err) {
    if (err instanceof ServiceError && err.code === 'NOT_FOUND') return null;
    throw err;
  }
}
