import { STATIC_VOICES } from '../profile-spec';
import { audioFile, extensionFor, providerFetch, type VoiceProvider } from '../types';

/** Grok (xAI) voice with the organization's xAI key: POST /v1/stt and POST /v1/tts. */

const BASE = 'https://api.x.ai/v1';

export const xai: VoiceProvider = {
  async transcribe(key, audio, mime, opts) {
    const form = new FormData();
    form.append('file', audioFile(audio, mime), `speech.${extensionFor(mime)}`);
    form.append('model', opts.model || 'grok-voice-transcribe-2.0');
    if (opts.language) form.append('language', opts.language);
    const res = await providerFetch('xai', `${BASE}/stt`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
    const data = await res.json();
    return String(data?.text || '').trim();
  },

  async synthesize(key, text, opts) {
    const res = await providerFetch(
      'xai',
      `${BASE}/tts`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice_id: opts.voiceId || 'eve', language: opts.language || 'en' }),
      },
      20_000
    );
    const mime = res.headers.get('content-type')?.split(';')[0] || 'audio/mpeg';
    return { audio: Buffer.from(await res.arrayBuffer()), mime: mime.startsWith('audio/') ? mime : 'audio/mpeg' };
  },

  async listVoices() {
    return STATIC_VOICES.xai!;
  },
};
