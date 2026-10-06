import type { VoiceProviderId } from '../profile-spec';
import type { VoiceProvider } from '../types';
import { gemini } from './gemini';
import { elevenlabs } from './elevenlabs';
import { openai } from './openai';
import { xai } from './xai';

/** Server-side providers. 'browser' has none: the client speaks/listens itself. */
export const VOICE_PROVIDER_IMPLS: Partial<Record<VoiceProviderId, VoiceProvider>> = { gemini, elevenlabs, openai, xai };
