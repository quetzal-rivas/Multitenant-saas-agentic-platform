import crypto from 'crypto';
import type { NormalizedEvent } from '../types';
import { hmacHex, safeEqual, str, type VerifyInput, type VerifyResult } from './common';

/**
 * Meta webhooks (WhatsApp Cloud API, Messenger, Instagram).
 * Signature: X-Hub-Signature-256 = "sha256=" + hex HMAC-SHA256(app secret, raw body).
 */

export function verify(input: VerifyInput): VerifyResult {
  const secret = input.secrets.app_secret;
  if (!secret) return { ok: false, reason: 'App secret is not set for this endpoint.' };
  const header = input.headers.get('x-hub-signature-256') || '';
  if (!header.startsWith('sha256=')) return { ok: false, reason: 'Missing X-Hub-Signature-256.' };
  return safeEqual(header, `sha256=${hmacHex('sha256', secret, input.rawBody)}`) ? { ok: true } : { ok: false, reason: 'Signature does not match.' };
}

export function normalize(body: any): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  const object = str(body?.object);
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    // WhatsApp Cloud API
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value || {};
      const phoneNumberId = str(value?.metadata?.phone_number_id);
      const names = new Map<string, string>((value.contacts || []).map((c: any) => [str(c.wa_id), str(c.profile?.name)]));
      for (const m of Array.isArray(value.messages) ? value.messages : []) {
        const from = str(m.from);
        const text =
          m.type === 'text' ? str(m.text?.body)
          : m.type === 'button' ? str(m.button?.text)
          : m.type === 'interactive' ? str(m.interactive?.button_reply?.title || m.interactive?.list_reply?.title)
          : m.type === 'location' ? `Shared a location: ${m.location?.latitude}, ${m.location?.longitude}${m.location?.name ? ` (${m.location.name})` : ''}`
          : str(m[m.type]?.caption) || `[${m.type} message]`;
        const media = m[m.type]?.id ? [{ type: str(m.type), id: str(m[m.type].id), mime: str(m[m.type].mime_type) || undefined }] : undefined;
        out.push({
          event_id: str(m.id) || crypto.createHash('sha256').update(JSON.stringify(m)).digest('hex'),
          type: 'message',
          channel: 'whatsapp',
          conversation_key: `whatsapp:${phoneNumberId}:${from}`,
          sender: { id: from, name: names.get(from) || null },
          text,
          attachments: media,
          reply_target: { kind: 'whatsapp', phone_number_id: phoneNumberId, to: from },
          meta: { timestamp: m.timestamp, phone_number_id: phoneNumberId, display_phone_number: value?.metadata?.display_phone_number },
        });
      }
      for (const s of Array.isArray(value.statuses) ? value.statuses : []) {
        out.push({
          event_id: `status:${str(s.id)}:${str(s.status)}`,
          type: 'status',
          channel: 'whatsapp',
          conversation_key: `whatsapp:${phoneNumberId}:${str(s.recipient_id)}`,
          sender: { id: str(s.recipient_id) },
          text: `Message ${str(s.status)}`,
          reply_target: { kind: 'none' },
          meta: { status: s.status, errors: s.errors },
        });
      }
    }
    // Messenger / Instagram
    for (const m of Array.isArray(entry?.messaging) ? entry.messaging : []) {
      const channel = object === 'instagram' ? 'instagram' : 'messenger';
      const sender = str(m.sender?.id);
      const pageId = str(m.recipient?.id || entry?.id);
      if (m.message?.is_echo) continue; // our own replies
      if (m.message) {
        out.push({
          event_id: str(m.message.mid) || `${sender}:${m.timestamp}`,
          type: 'message',
          channel,
          conversation_key: `${channel}:${pageId}:${sender}`,
          sender: { id: sender },
          text: str(m.message.text) || (m.message.attachments?.length ? `[${m.message.attachments.map((a: any) => a.type).join(', ')}]` : ''),
          attachments: (m.message.attachments || []).map((a: any) => ({ type: str(a.type), url: a.payload?.url })),
          reply_target: { kind: channel, recipient_id: sender },
          meta: { page_id: pageId, timestamp: m.timestamp },
        });
      } else if (m.postback) {
        out.push({
          event_id: `${sender}:${m.timestamp}:postback`,
          type: 'message',
          channel,
          conversation_key: `${channel}:${pageId}:${sender}`,
          sender: { id: sender },
          text: str(m.postback.title || m.postback.payload),
          reply_target: { kind: channel, recipient_id: sender },
          meta: { page_id: pageId, postback: m.postback.payload },
        });
      } else {
        out.push({
          event_id: `${sender}:${m.timestamp}:${m.read ? 'read' : m.delivery ? 'delivery' : 'other'}`,
          type: 'status',
          channel,
          conversation_key: `${channel}:${pageId}:${sender}`,
          sender: { id: sender },
          text: m.read ? 'read' : m.delivery ? 'delivered' : 'event',
          reply_target: { kind: 'none' },
        });
      }
    }
  }
  return out;
}
