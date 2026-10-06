import { audioFile, extensionFor, providerFetch, type VoiceProvider } from '../types';

/** ElevenLabs: Scribe speech-to-text, Flash TTS, and the account's voices (including cloned ones). */

const BASE = 'https://api.elevenlabs.io/v1';

export const elevenlabs: VoiceProvider = {
  async transcribe(key, audio, mime, opts) {
    const form = new FormData();
    form.append('file', audioFile(audio, mime), `speech.${extensionFor(mime)}`);
    form.append('model_id', opts.model || 'scribe_v1');
    if (opts.language) form.append('language_code', opts.language);
    const res = await providerFetch('elevenlabs', `${BASE}/speech-to-text`, { method: 'POST', headers: { 'xi-api-key': key }, body: form });
    const data = await res.json();
    return String(data?.text || '').trim();
  },

  async synthesize(key, text, opts) {
    if (!opts.voiceId) throw new Error('Pick an ElevenLabs voice in the voice profile.');
    const res = await providerFetch(
      'elevenlabs',
      `${BASE}/text-to-speech/${encodeURIComponent(opts.voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: opts.model || 'eleven_flash_v2_5',
          ...(opts.language ? { language_code: opts.language } : {}),
          ...(opts.speed ? { voice_settings: { speed: Math.min(1.2, Math.max(0.7, opts.speed)) } } : {}),
        }),
      },
      20_000
    );
    return { audio: Buffer.from(await res.arrayBuffer()), mime: 'audio/mpeg' };
  },

  async listVoices(key) {
    const res = await providerFetch('elevenlabs', `${BASE}/voices`, { headers: { 'xi-api-key': key } });
    const data = await res.json();
    return (data?.voices || []).map((v: any) => ({
      id: v.voice_id,
      name: v.name,
      description: [v.labels?.accent, v.labels?.description || v.labels?.descriptive, v.labels?.gender].filter(Boolean).join(', ') || undefined,
      previewUrl: v.preview_url || null,
      custom: v.category === 'cloned' || v.category === 'generated' || v.category === 'professional',
    }));
  },
};
