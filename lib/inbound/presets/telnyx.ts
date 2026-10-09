import crypto from 'crypto';
import type { NormalizedEvent } from '../types';
import { str, type VerifyInput, type VerifyResult } from './common';

/**
 * Telnyx webhooks (API v2). Signature: telnyx-signature-ed25519 (base64) over
 * `${telnyx-timestamp}|${rawBody}`, checked with the account's Ed25519 public key.
 */

const TOLERANCE_MS = 5 * 60_000;
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function verify(input: VerifyInput): VerifyResult {
  const key = input.secrets.public_key;
  if (!key) return { ok: false, reason: 'Public key is not set for this endpoint.' };
  const signature = input.headers.get('telnyx-signature-ed25519') || '';
  const timestamp = input.headers.get('telnyx-timestamp') || '';
  if (!signature || !timestamp) return { ok: false, reason: 'Missing Telnyx signature headers.' };
  if (Math.abs((input.now ?? Date.now()) - Number(timestamp) * 1000) > TOLERANCE_MS) return { ok: false, reason: 'Signature timestamp is too old.' };
  try {
    const raw = Buffer.from(key.trim(), 'base64');
    const publicKey = crypto.createPublicKey({ key: raw.length === 32 ? Buffer.concat([ED25519_SPKI_PREFIX, raw]) : raw, format: 'der', type: 'spki' });
    const ok = crypto.verify(null, Buffer.from(`${timestamp}|${input.rawBody}`), publicKey, Buffer.from(signature, 'base64'));
    return ok ? { ok: true } : { ok: false, reason: 'Signature does not match.' };
  } catch {
    return { ok: false, reason: 'The stored public key is not a valid Ed25519 key.' };
  }
}

export function normalize(body: any): NormalizedEvent[] {
  const data = body?.data || {};
  const p = data.payload || {};
  const type = str(data.event_type);
  if (type === 'message.received') {
    const from = str(p.from?.phone_number);
    const to = str(p.to?.[0]?.phone_number);
    return [{
      event_id: str(data.id || p.id),
      type: 'message',
      channel: 'sms',
      conversation_key: `sms:${to}:${from}`,
      sender: { id: from },
      text: str(p.text),
      reply_target: { kind: 'none' },
      meta: { to, telnyx_message_id: p.id },
    }];
  }
  if (type.startsWith('call.')) {
    const from = str(p.from);
    return [{
      event_id: str(data.id) || `${type}:${str(p.call_control_id)}`,
      type: 'status',
      channel: 'phone_call',
      conversation_key: `call:${from}`,
      sender: { id: from },
      text: type.replace('call.', 'Call ').replace(/_/g, ' '),
      reply_target: { kind: 'none' },
      meta: { event_type: type, call_control_id: p.call_control_id, to: p.to },
    }];
  }
  return [];
}
