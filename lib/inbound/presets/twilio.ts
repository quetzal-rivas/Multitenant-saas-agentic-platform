import crypto from 'crypto';
import type { NormalizedEvent } from '../types';
import { safeEqual, str, type VerifyInput, type VerifyResult } from './common';

/**
 * Twilio webhooks (SMS, call status). Signature: X-Twilio-Signature = base64
 * HMAC-SHA1(auth token, full URL + POST params sorted by name, each name+value appended).
 */

export function verify(input: VerifyInput): VerifyResult {
  const token = input.secrets.auth_token;
  if (!token) return { ok: false, reason: 'Auth token is not set for this endpoint.' };
  const signature = input.headers.get('x-twilio-signature') || '';
  if (!signature) return { ok: false, reason: 'Missing X-Twilio-Signature.' };
  const params = Object.fromEntries(new URLSearchParams(input.rawBody));
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], input.url);
  const expected = crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf8')).digest('base64');
  return safeEqual(signature, expected) ? { ok: true } : { ok: false, reason: 'Signature does not match.' };
}

export function parseBody(rawBody: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(rawBody));
}

export function normalize(p: Record<string, string>): NormalizedEvent[] {
  if (p.MessageSid && p.Body !== undefined) {
    return [{
      event_id: p.MessageSid,
      type: 'message',
      channel: 'sms',
      conversation_key: `sms:${str(p.To)}:${str(p.From)}`,
      sender: { id: str(p.From) },
      text: str(p.Body),
      attachments: Number(p.NumMedia) ? Array.from({ length: Number(p.NumMedia) }, (_, i) => ({ type: 'media', url: p[`MediaUrl${i}`], mime: p[`MediaContentType${i}`] })) : undefined,
      reply_target: { kind: 'none' },
      meta: { to: p.To, account_sid: p.AccountSid },
    }];
  }
  if (p.CallSid) {
    return [{
      event_id: `call:${p.CallSid}:${str(p.CallStatus)}`,
      type: 'status',
      channel: 'phone_call',
      conversation_key: `call:${str(p.Direction) === 'outbound-api' ? str(p.To) : str(p.From)}`,
      sender: { id: str(p.From) },
      text: `Call ${str(p.CallStatus)}${p.CallDuration ? ` (${p.CallDuration} s)` : ''}`,
      reply_target: { kind: 'none' },
      meta: { call_sid: p.CallSid, status: p.CallStatus, to: p.To, recording_url: p.RecordingUrl },
    }];
  }
  return [];
}
