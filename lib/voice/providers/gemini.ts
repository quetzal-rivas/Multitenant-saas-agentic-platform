import { STATIC_VOICES } from '../profile-spec';
import { VoiceProviderError, providerFetch, type VoiceProvider } from '../types';

/**
 * Gemini with the organization's key (free tier). Speech-to-text uses audio
 * understanding on a Flash model; speech uses the TTS model, which returns raw 16-bit
 * PCM that we wrap into a WAV file.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
export const GEMINI_STT_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
export const GEMINI_TTS_MODELS = ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'];

async function generate(key: string, model: string, body: unknown, timeoutMs?: number): Promise<any> {
  const res = await providerFetch(
    'gemini',
    `${BASE}/${model}:generateContent`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) },
    timeoutMs
  );
  return res.json();
}

/** Try each model; a 404 (model retired) or 5xx moves to the next, other errors stop. */
async function withModels<T>(models: string[], run: (model: string) => Promise<T>): Promise<T> {
  let last: unknown;
  for (const model of models) {
    try {
      return await run(model);
    } catch (err) {
      last = err;
      const status = err instanceof VoiceProviderError ? err.status : undefined;
      if (!(status === 404 || (status && status >= 500))) throw err;
    }
  }
  throw last;
}

export function pcmToWav(pcm: Buffer, sampleRate = 24_000, channels = 1, bitsPerSample = 16): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE((channels * bitsPerSample) / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function speedHint(speed?: number | null): string {
  if (!speed || Math.abs(speed - 1) < 0.05) return '';
  return speed > 1 ? 'Speak a little faster than normal. ' : 'Speak a little slower than normal. ';
}

export const gemini: VoiceProvider = {
  async transcribe(key, audio, mime, opts) {
    const models = opts.model ? [opts.model] : GEMINI_STT_MODELS;
    const data = await withModels(models, (model) =>
      generate(key, model, {
        contents: [
          {
            role: 'user',
            parts: [
              { inline_data: { mime_type: mime.split(';')[0] || 'audio/webm', data: audio.toString('base64') } },
              {
                text: `Transcribe this audio verbatim${opts.language ? ` (the speaker most likely uses language "${opts.language}")` : ''}. Return only the spoken words, with punctuation. If nothing is said, return an empty string.`,
              },
            ],
          },
        ],
        generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
      })
    );
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('').trim();
    return text.replace(/^"|"$/g, '');
  },

  async synthesize(key, text, opts) {
    const models = opts.model ? [opts.model] : GEMINI_TTS_MODELS;
    const prompt = `${speedHint(opts.speed)}${opts.style ? `${opts.style.trim().replace(/[:.]?$/, ':')} ` : ''}${text}`;
    const data = await withModels(models, (model) =>
      generate(
        key,
        model,
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voiceId || 'Kore' } } },
          },
        },
        20_000
      )
    );
    const part = (data?.candidates?.[0]?.content?.parts || []).find((p: any) => p.inlineData?.data || p.inline_data?.data);
    const inline = part?.inlineData || part?.inline_data;
    if (!inline?.data) throw new VoiceProviderError('gemini', 'no audio returned');
    const mime: string = inline.mimeType || inline.mime_type || '';
    const pcm = Buffer.from(inline.data, 'base64');
    if (/wav|mpeg|mp3|ogg/.test(mime)) return { audio: pcm, mime };
    const rate = Number(/rate=(\d+)/.exec(mime)?.[1] || 24_000);
    return { audio: pcmToWav(pcm, rate), mime: 'audio/wav' };
  },

  async listVoices() {
    return STATIC_VOICES.gemini!;
  },
};
