import crypto from 'crypto';
import type { NormalizedEvent } from '../types';
import { hmacHex, safeEqual, str, type VerifyInput, type VerifyResult } from './common';

/**
 * Any sender that can sign its requests. Settings:
 *   signature_header (default X-Signature): hex HMAC-SHA256 of the raw body, optionally
 *     prefixed "sha256=";
 *   timestamp_header (optional): when set, the signed string is `${timestamp}.${body}`
 *     and requests older than 5 minutes are rejected;
 *   unsigned: true accepts unsigned requests (testing only; shown as a warning).
 * Payload hints used by default (a router function can override everything):
 *   id/event_id, conversation_id/thread_id/from, text/message, sender/from/name.
 */

const TOLERANCE_MS = 5 * 60_000;

export function verify(input: VerifyInput): VerifyResult {
  if (input.settings.unsigned === true) return { ok: true };
  const secret = input.secrets.signing_secret;
  if (!secret) return { ok: false, reason: 'Signing secret is not set for this endpoint.' };
  const header = input.headers.get(input.settings.signature_header || 'x-signature') || '';
  if (!header) return { ok: false, reason: `Missing ${input.settings.signature_header || 'X-Signature'} header.` };
  let signed = input.rawBody;
  if (input.settings.timestamp_header) {
    const ts = input.headers.get(input.settings.timestamp_header) || '';
    const ms = Number(ts) * (ts.length <= 10 ? 1000 : 1);
    if (!ts || !Number.isFinite(ms) || Math.abs((input.now ?? Date.now()) - ms) > TOLERANCE_MS) return { ok: false, reason: 'Missing or stale timestamp.' };
    signed = `${ts}.${input.rawBody}`;
  }
  const expected = hmacHex('sha256', secret, signed);
  return safeEqual(header.replace(/^sha256=/, ''), expected) ? { ok: true } : { ok: false, reason: 'Signature does not match.' };
}

export function normalize(body: any, rawBody: string): NormalizedEvent[] {
  const b = body && typeof body === 'object' ? body : { text: rawBody };
  const sender = str(b.sender?.id ?? b.sender ?? b.from ?? b.user_id ?? b.email);
  const key = str(b.conversation_id ?? b.thread_id ?? b.conversation_key ?? sender);
  const text = str(b.text ?? b.message ?? b.body ?? b.content);
  return [{
    event_id: str(b.event_id ?? b.id) || crypto.createHash('sha256').update(rawBody).digest('hex'),
    type: 'message',
    channel: 'webhook',
    conversation_key: `webhook:${key || 'default'}`,
    sender: { id: sender || 'unknown', name: str(b.sender?.name ?? b.name) || null },
    text: text || JSON.stringify(b).slice(0, 4000),
    reply_target: { kind: 'webhook' },
    meta: {},
  }];
}
