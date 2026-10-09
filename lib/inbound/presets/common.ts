import crypto from 'crypto';

/** Inputs every preset verifier receives. */
export interface VerifyInput {
  rawBody: string;
  headers: Headers;
  /** Public URL the provider called (Twilio signs it). */
  url: string;
  secrets: Record<string, string>;
  settings: Record<string, any>;
  now?: number;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export const hmacHex = (algo: 'sha256' | 'sha1', secret: string, data: string) => crypto.createHmac(algo, secret).update(data, 'utf8').digest('hex');

export function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}
