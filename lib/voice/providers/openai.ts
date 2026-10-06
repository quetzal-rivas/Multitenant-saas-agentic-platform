import { STATIC_VOICES } from '../profile-spec';
import { audioFile, extensionFor, providerFetch, type VoiceProvider } from '../types';

/** OpenAI with the organization's key: gpt-4o-mini-transcribe and gpt-4o-mini-tts (style via instructions). */

const BASE = 'https://api.openai.com/v1/audio';

export const openai: VoiceProvider = {
  async transcribe(key, audio, mime, opts) {
    const form = new FormData();
    form.append('file', audioFile(audio, mime), `speech.${extensionFor(mime)}`);
    form.append('model', opts.model || 'gpt-4o-mini-transcribe');
    if (opts.language) form.append('language', opts.language.slice(0, 2));
    const res = await providerFetch('openai', `${BASE}/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
    const data = await res.json();
    return String(data?.text || '').trim();
  },

  async synthesize(key, text, opts) {
    const res = await providerFetch(
      'openai',
      `${BASE}/speech`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: opts.model || 'gpt-4o-mini-tts',
          voice: opts.voiceId || 'coral',
          input: text,
          response_format: 'mp3',
          ...(opts.style ? { instructions: opts.style } : {}),
          ...(opts.speed ? { speed: Math.min(4, Math.max(0.25, opts.speed)) } : {}),
        }),
      },
      20_000
    );
    return { audio: Buffer.from(await res.arrayBuffer()), mime: 'audio/mpeg' };
  },

  async listVoices() {
    return STATIC_VOICES.openai!;
  },
};
