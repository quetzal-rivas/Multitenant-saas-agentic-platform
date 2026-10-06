/** Provider-neutral voice interfaces. Server-only implementations live in ./providers. */

export interface TranscribeOptions {
  language?: string;
  model?: string | null;
}

export interface SynthesizeOptions {
  voiceId?: string | null;
  model?: string | null;
  speed?: number | null;
  style?: string | null;
  language?: string;
}

export interface VoiceInfo {
  id: string;
  name: string;
  description?: string;
  previewUrl?: string | null;
  custom?: boolean;
}

export interface SpeechAudio {
  audio: Buffer;
  mime: string;
}

export interface VoiceProvider {
  transcribe(key: string, audio: Buffer, mime: string, opts: TranscribeOptions): Promise<string>;
  synthesize(key: string, text: string, opts: SynthesizeOptions): Promise<SpeechAudio>;
  listVoices(key: string): Promise<VoiceInfo[]>;
}

/** A provider call failed; the engine moves to the next provider in the chain. */
export class VoiceProviderError extends Error {
  constructor(public provider: string, message: string, public status?: number) {
    super(message);
  }
}

export const PROVIDER_TIMEOUT_MS = 12_000;

export async function providerFetch(provider: string, url: string, init: RequestInit, timeoutMs = PROVIDER_TIMEOUT_MS): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err: any) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw new VoiceProviderError(provider, timedOut ? 'timed out' : `network error: ${err?.message || err}`);
  }
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
    const reason = res.status === 429 ? 'quota or rate limit reached' : res.status === 401 || res.status === 403 ? 'key rejected' : `error ${res.status}`;
    throw new VoiceProviderError(provider, `${reason}${body ? `: ${body}` : ''}`, res.status);
  }
  return res;
}

export function audioFile(audio: Buffer, mime: string): Blob {
  return new Blob([new Uint8Array(audio)], { type: mime });
}

export function extensionFor(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}
