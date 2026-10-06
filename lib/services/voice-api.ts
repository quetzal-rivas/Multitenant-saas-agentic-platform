import { z } from 'zod';
import type { AuthContext } from '@/lib/auth/require-auth';
import { voiceProfileSchema } from '@/lib/voice/profile-spec';
import { PLATFORM_VOICE_PROFILE, type VoiceProfileLike } from '@/lib/voice/engine';
import { getVoiceProfile, resolveVoiceProfile } from './voice-profiles';

/** Shared by the transcribe and speak routes: which profile applies to this request. */

export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 60;
export const MAX_SPEAK_CHARS = 600;

/** A profile being edited (not yet saved) can be tested directly. */
const draftProfile = voiceProfileSchema.pick({ language: true, stt: true, tts: true, fallback: true }).extend({
  daily_caps: voiceProfileSchema.shape.daily_caps.optional(),
});

export const speakBody = z
  .object({
    text: z.string().trim().min(1).max(MAX_SPEAK_CHARS),
    session_id: z.string().uuid().optional(),
    profile_id: z.string().uuid().optional(),
    profile: draftProfile.optional(),
  })
  .strict();

export async function profileFor(
  ctx: Pick<AuthContext, 'tenantId'>,
  ref: { session_id?: string | null; profile_id?: string | null; profile?: unknown }
): Promise<VoiceProfileLike> {
  if (ref.profile) {
    const draft = draftProfile.parse(ref.profile);
    return { ...draft, daily_caps: draft.daily_caps ?? {} };
  }
  if (ref.profile_id) return getVoiceProfile(ctx, ref.profile_id);
  if (ref.session_id) return (await resolveVoiceProfile(ctx, ref.session_id)) ?? PLATFORM_VOICE_PROFILE;
  return PLATFORM_VOICE_PROFILE;
}
