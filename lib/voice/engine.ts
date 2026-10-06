import { getSupabaseAdminClient } from '@/lib/supabase';
import { getTenantSecret, listTenantSecrets, type BYOKProvider } from '@/lib/secrets/secrets-service';
import { ServiceError } from '@/lib/services/errors';
import { DEFAULT_VOICE, VOICE_PROVIDER_KEY, VOICE_PROVIDER_LABEL, type VoiceProfileInput, type VoiceProviderId } from './profile-spec';
import { VOICE_PROVIDER_IMPLS } from './providers';
import { VoiceProviderError, type SpeechAudio, type VoiceInfo } from './types';

/**
 * Provider-neutral speech engine. Each call walks a chain: the profile's provider, then
 * (with fallback on) the organization's Gemini key, then the browser. A provider is
 * skipped when it has no key, failed (quota, rejected key, timeout, error) or reached the
 * profile's daily cap for it. Every result says which provider actually served it.
 */

export type VoiceProfileLike = Pick<VoiceProfileInput, 'language' | 'stt' | 'tts' | 'fallback' | 'daily_caps'>;

/** Used when an instance has no voice profile: Gemini first, then the browser. */
export const PLATFORM_VOICE_PROFILE: VoiceProfileLike = {
  language: 'en',
  stt: { provider: 'gemini' },
  tts: { provider: 'gemini', voice_id: 'Kore' },
  fallback: true,
  daily_caps: {},
};

export interface Attempt {
  provider: VoiceProviderId;
  error: string;
}

export type TranscribeResult =
  | { text: string; provider: VoiceProviderId; attempts: Attempt[] }
  | { fallback: 'browser'; attempts: Attempt[] };

export type SpeakResult = (SpeechAudio & { provider: VoiceProviderId; attempts: Attempt[] }) | { fallback: 'browser'; attempts: Attempt[] };

type SecretGetter = (tenantId: string, provider: BYOKProvider) => Promise<string | null>;
let secretGetter: SecretGetter = getTenantSecret;
export function setVoiceSecretGetterForTests(fn: SecretGetter | null) {
  secretGetter = fn ?? getTenantSecret;
}

function chain(primary: VoiceProviderId, fallback: boolean): VoiceProviderId[] {
  const order: VoiceProviderId[] = [primary];
  if (fallback) order.push('gemini', 'browser');
  return [...new Set(order)];
}

const today = () => new Date().toISOString().slice(0, 10);

async function usageFor(tenantId: string, provider: VoiceProviderId) {
  const { data } = await getSupabaseAdminClient()
    .from('voice_usage')
    .select('stt_seconds, tts_chars')
    .eq('tenant_id', tenantId)
    .eq('day', today())
    .eq('provider', provider)
    .maybeSingle();
  return { stt_seconds: Number(data?.stt_seconds ?? 0), tts_chars: Number(data?.tts_chars ?? 0) };
}

/** Add to today's counter. Best effort: a lost increment only makes a cap slightly loose. */
export async function recordVoiceUsage(tenantId: string, provider: VoiceProviderId, add: { stt_seconds?: number; tts_chars?: number }) {
  const db = getSupabaseAdminClient();
  const day = today();
  try {
    const current = await usageFor(tenantId, provider);
    const next = {
      stt_seconds: current.stt_seconds + (add.stt_seconds ?? 0),
      tts_chars: current.tts_chars + (add.tts_chars ?? 0),
      updated_at: new Date().toISOString(),
    };
    const { data } = await db.from('voice_usage').update(next).eq('tenant_id', tenantId).eq('day', day).eq('provider', provider).select('provider');
    if (!data?.length) {
      const { error } = await db.from('voice_usage').insert({ tenant_id: tenantId, day, provider, ...next });
      if (error) await db.from('voice_usage').update(next).eq('tenant_id', tenantId).eq('day', day).eq('provider', provider);
    }
  } catch (err) {
    console.error('[voice] could not record usage', err);
  }
}

async function overCap(tenantId: string, profile: VoiceProfileLike, provider: VoiceProviderId, kind: 'stt_seconds' | 'tts_chars', adding: number) {
  const cap = profile.daily_caps?.[provider]?.[kind];
  if (cap === undefined || cap === null) return false;
  const used = (await usageFor(tenantId, provider))[kind];
  return used + adding > cap;
}

function describe(err: unknown): string {
  if (err instanceof VoiceProviderError) return err.message;
  return (err as Error)?.message || 'failed';
}

async function keyFor(tenantId: string, provider: VoiceProviderId): Promise<string | null> {
  const name = VOICE_PROVIDER_KEY[provider];
  return name ? secretGetter(tenantId, name as BYOKProvider) : null;
}

function exhausted(kind: string, attempts: Attempt[]): never {
  const why = attempts.map((a) => `${VOICE_PROVIDER_LABEL[a.provider]}: ${a.error}`).join('; ');
  throw new ServiceError(`No ${kind} provider could handle this request (${why}). Turn on fallback in the voice profile or add a key.`, 'CONFLICT');
}

export async function transcribeWithFallback(
  tenantId: string,
  profile: VoiceProfileLike,
  audio: Buffer,
  mime: string,
  durationSec: number
): Promise<TranscribeResult> {
  const attempts: Attempt[] = [];
  for (const provider of chain(profile.stt.provider, profile.fallback)) {
    if (provider === 'browser') return { fallback: 'browser', attempts };
    const impl = VOICE_PROVIDER_IMPLS[provider]!;
    const key = await keyFor(tenantId, provider);
    if (!key) {
      attempts.push({ provider, error: 'no key for this organization' });
      continue;
    }
    if (await overCap(tenantId, profile, provider, 'stt_seconds', durationSec)) {
      attempts.push({ provider, error: 'daily cap reached' });
      continue;
    }
    try {
      const model = provider === profile.stt.provider ? profile.stt.model : null;
      const text = await impl.transcribe(key, audio, mime, { language: profile.language, model });
      await recordVoiceUsage(tenantId, provider, { stt_seconds: durationSec });
      return { text, provider, attempts };
    } catch (err) {
      attempts.push({ provider, error: describe(err) });
    }
  }
  exhausted('speech-to-text', attempts);
}

export async function speakWithFallback(tenantId: string, profile: VoiceProfileLike, text: string): Promise<SpeakResult> {
  const attempts: Attempt[] = [];
  for (const provider of chain(profile.tts.provider, profile.fallback)) {
    if (provider === 'browser') return { fallback: 'browser', attempts };
    const impl = VOICE_PROVIDER_IMPLS[provider]!;
    const key = await keyFor(tenantId, provider);
    if (!key) {
      attempts.push({ provider, error: 'no key for this organization' });
      continue;
    }
    if (await overCap(tenantId, profile, provider, 'tts_chars', text.length)) {
      attempts.push({ provider, error: 'daily cap reached' });
      continue;
    }
    const own = provider === profile.tts.provider;
    try {
      const speech = await impl.synthesize(key, text, {
        // The chosen voice belongs to the chosen provider; a fallback uses its default voice.
        voiceId: own ? profile.tts.voice_id ?? DEFAULT_VOICE[provider] : DEFAULT_VOICE[provider],
        model: own ? profile.tts.model : null,
        speed: profile.tts.speed,
        style: profile.tts.style,
        language: profile.language,
      });
      await recordVoiceUsage(tenantId, provider, { tts_chars: text.length });
      return { ...speech, provider, attempts };
    } catch (err) {
      attempts.push({ provider, error: describe(err) });
    }
  }
  exhausted('text-to-speech', attempts);
}

export async function listProviderVoices(tenantId: string, provider: VoiceProviderId): Promise<{ voices: VoiceInfo[]; configured: boolean }> {
  if (provider === 'browser') return { voices: [], configured: true };
  const key = await keyFor(tenantId, provider);
  const impl = VOICE_PROVIDER_IMPLS[provider]!;
  if (!key) {
    // Built-in lists are still useful to pick a voice before adding the key.
    return { voices: provider === 'elevenlabs' ? [] : await impl.listVoices(''), configured: false };
  }
  try {
    return { voices: await impl.listVoices(key), configured: true };
  } catch (err) {
    throw new ServiceError(`Could not list ${VOICE_PROVIDER_LABEL[provider]} voices: ${describe(err)}`, 'CONFLICT');
  }
}

/** Which voice providers have keys in this organization. */
export async function voiceProviderStatus(tenantId: string): Promise<Record<VoiceProviderId, boolean>> {
  const stored = new Set((await listTenantSecrets(tenantId)).map((s) => s.provider as string));
  const out = { browser: true } as Record<VoiceProviderId, boolean>;
  for (const provider of ['gemini', 'elevenlabs', 'openai', 'xai'] as const) out[provider] = stored.has(VOICE_PROVIDER_KEY[provider]!);
  return out;
}
