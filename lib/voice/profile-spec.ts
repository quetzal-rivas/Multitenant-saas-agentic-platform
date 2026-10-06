import { z } from 'zod';

/**
 * Voice profile definition. Browser-safe (used by the Voice page and the server).
 *
 * A profile picks who turns speech into text (stt) and who speaks replies (tts). With
 * `fallback` on, a provider that fails, has no key, or reached its daily cap falls back
 * to the organization's Gemini key, then to the browser's built-in speech.
 */

export const VOICE_PROVIDERS = ['gemini', 'elevenlabs', 'openai', 'xai', 'browser'] as const;
export type VoiceProviderId = (typeof VOICE_PROVIDERS)[number];

export const VOICE_PROVIDER_LABEL: Record<VoiceProviderId, string> = {
  gemini: 'Gemini',
  elevenlabs: 'ElevenLabs',
  openai: 'OpenAI',
  xai: 'Grok (xAI)',
  browser: 'Browser (built-in)',
};

/** Which organization key each provider uses (browser needs none). */
export const VOICE_PROVIDER_KEY: Record<VoiceProviderId, 'gemini' | 'elevenlabs' | 'openai' | 'xai' | null> = {
  gemini: 'gemini',
  elevenlabs: 'elevenlabs',
  openai: 'openai',
  xai: 'xai',
  browser: null,
};

export const DEFAULT_REPLY_STYLE =
  'You are speaking out loud. Answer in one to three short, natural sentences. No markdown, lists, tables, code or URLs; say numbers and names plainly. Offer details only if asked.';

const caps = z
  .object({
    stt_seconds: z.number().int().min(0).max(1_000_000).optional(),
    tts_chars: z.number().int().min(0).max(100_000_000).optional(),
  })
  .strict();

export const voiceProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    language: z.string().trim().min(2).max(16).default('en'),
    stt: z
      .object({
        provider: z.enum(VOICE_PROVIDERS),
        model: z.string().trim().min(1).max(80).nullable().optional(),
      })
      .strict(),
    tts: z
      .object({
        provider: z.enum(VOICE_PROVIDERS),
        voice_id: z.string().trim().min(1).max(120).nullable().optional(),
        voice_name: z.string().trim().max(120).nullable().optional(),
        model: z.string().trim().min(1).max(80).nullable().optional(),
        speed: z.number().min(0.5).max(2).nullable().optional(),
        style: z.string().trim().max(500).nullable().optional(),
      })
      .strict(),
    fallback: z.boolean().default(true),
    daily_caps: z.partialRecord(z.enum(VOICE_PROVIDERS), caps).default({}),
    reply_style: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

export type VoiceProfileInput = z.infer<typeof voiceProfileSchema>;

export interface VoiceProfile extends VoiceProfileInput {
  id: string;
  created_at: string;
  updated_at: string;
}

/** Built-in voices for providers without a voice list endpoint. */
export const STATIC_VOICES: Partial<Record<VoiceProviderId, Array<{ id: string; name: string; description?: string }>>> = {
  gemini: [
    ['Kore', 'Firm'], ['Puck', 'Upbeat'], ['Zephyr', 'Bright'], ['Charon', 'Informative'], ['Fenrir', 'Excitable'],
    ['Leda', 'Youthful'], ['Orus', 'Firm'], ['Aoede', 'Breezy'], ['Callirrhoe', 'Easy-going'], ['Autonoe', 'Bright'],
    ['Enceladus', 'Breathy'], ['Iapetus', 'Clear'], ['Umbriel', 'Easy-going'], ['Algieba', 'Smooth'], ['Despina', 'Smooth'],
    ['Erinome', 'Clear'], ['Algenib', 'Gravelly'], ['Rasalgethi', 'Informative'], ['Laomedeia', 'Upbeat'], ['Achernar', 'Soft'],
    ['Alnilam', 'Firm'], ['Schedar', 'Even'], ['Gacrux', 'Mature'], ['Pulcherrima', 'Forward'], ['Achird', 'Friendly'],
    ['Zubenelgenubi', 'Casual'], ['Vindemiatrix', 'Gentle'], ['Sadachbia', 'Lively'], ['Sadaltager', 'Knowledgeable'], ['Sulafat', 'Warm'],
  ].map(([id, description]) => ({ id, name: id, description })),
  openai: ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar'].map((id) => ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
  })),
  xai: [
    { id: 'eve', name: 'Eve', description: 'Energetic, upbeat' },
    { id: 'ara', name: 'Ara', description: 'Warm, conversational' },
    { id: 'leo', name: 'Leo', description: 'Authoritative' },
    { id: 'rex', name: 'Rex', description: 'Professional' },
    { id: 'sal', name: 'Sal', description: 'Versatile, neutral' },
  ],
};

export const DEFAULT_VOICE: Partial<Record<VoiceProviderId, string>> = {
  gemini: 'Kore',
  openai: 'coral',
  xai: 'eve',
};
