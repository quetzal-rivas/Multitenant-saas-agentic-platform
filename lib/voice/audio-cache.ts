import crypto from 'crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { VoiceProviderId } from './profile-spec';
import type { SpeechAudio, SynthesizeOptions } from './types';

/**
 * Spoken-audio cache in S3 (bucket VOICE_CACHE_BUCKET, created by
 * scripts/aws/setup-voice-cache.sh). Each clip is addressed by a hash of everything that
 * shapes the sound (text, provider, voice, model, speed, style, language), so a sentence
 * is synthesized once and every later request for it is served from S3 without calling
 * the provider or using its quota. Objects live under the organization's prefix and
 * expire through the bucket's lifecycle rule. Without the bucket, caching is skipped.
 */

let client: S3Client | null = null;
let override: { get: (key: string) => Promise<SpeechAudio | null>; put: (key: string, audio: SpeechAudio) => Promise<void> } | null = null;

export function setAudioCacheForTests(store: typeof override) {
  override = store;
}

function bucket(): string | null {
  return process.env.VOICE_CACHE_BUCKET || null;
}

export function audioCacheEnabled(): boolean {
  return !!override || !!bucket();
}

function s3(): S3Client {
  return (client ||= new S3Client({ region: process.env.VOICE_CACHE_REGION || process.env.AWS_REGION || 'us-east-2' }));
}

const EXT: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm' };

export function audioCacheKey(tenantId: string, provider: VoiceProviderId, text: string, opts: SynthesizeOptions): string {
  const fingerprint = JSON.stringify([provider, opts.voiceId ?? '', opts.model ?? '', opts.speed ?? 1, opts.style ?? '', opts.language ?? '', text]);
  const hash = crypto.createHash('sha256').update(fingerprint).digest('hex');
  return `tts/${tenantId}/${provider}/${hash}`;
}

export async function getCachedAudio(key: string): Promise<SpeechAudio | null> {
  if (override) return override.get(key);
  const name = bucket();
  if (!name) return null;
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: name, Key: key }), { abortSignal: AbortSignal.timeout(3000) });
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes?.length) return null;
    return { audio: Buffer.from(bytes), mime: res.ContentType || 'audio/mpeg' };
  } catch (err: any) {
    if (err?.name !== 'NoSuchKey' && err?.$metadata?.httpStatusCode !== 404) console.error('[voice-cache] read failed', err?.name || err);
    return null;
  }
}

export async function putCachedAudio(key: string, audio: SpeechAudio): Promise<void> {
  if (override) return override.put(key, audio);
  const name = bucket();
  if (!name) return;
  try {
    await s3().send(
      new PutObjectCommand({
        Bucket: name,
        Key: key,
        Body: audio.audio,
        ContentType: audio.mime,
        Metadata: { format: EXT[audio.mime] || 'bin' },
      }),
      { abortSignal: AbortSignal.timeout(5000) }
    );
  } catch (err: any) {
    console.error('[voice-cache] write failed', err?.name || err);
  }
}

/** Call recordings and other inbound media: kept under inbound/<tenant>/ (longer lifecycle than tts/). */
export async function putInboundMedia(tenantId: string, name: string, audio: SpeechAudio): Promise<string | null> {
  const key = `inbound/${tenantId}/${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  if (override) {
    await override.put(key, audio);
    return key;
  }
  const bucketName = bucket();
  if (!bucketName) return null;
  try {
    await s3().send(new PutObjectCommand({ Bucket: bucketName, Key: key, Body: audio.audio, ContentType: audio.mime }), { abortSignal: AbortSignal.timeout(20_000) });
    return key;
  } catch (err: any) {
    console.error('[inbound-media] write failed', err?.name || err);
    return null;
  }
}

/** Short-lived public URL for a cached clip (Twilio <Play> fetches it during a call). */
export async function presignedAudioUrl(key: string, seconds = 900): Promise<string | null> {
  if (override) return `https://cache.test/${key}`;
  const name = bucket();
  if (!name) return null;
  try {
    return await getSignedUrl(s3(), new GetObjectCommand({ Bucket: name, Key: key }), { expiresIn: seconds });
  } catch (err: any) {
    console.error('[voice-cache] presign failed', err?.name || err);
    return null;
  }
}
