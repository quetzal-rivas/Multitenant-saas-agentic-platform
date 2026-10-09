import type { NormalizedEvent } from '../types';
import { hmacHex, safeEqual, str, type VerifyInput, type VerifyResult } from './common';

/**
 * ElevenLabs Agents post-call webhooks. Same check as the official SDK
 * (webhooks.constructEvent): header "ElevenLabs-Signature: t=<unix>,v0=<hex>", where
 * hex = HMAC-SHA256(secret, `${t}.${rawBody}`), rejected when older than 30 minutes.
 */

const TOLERANCE_MS = 30 * 60_000;

export function verify(input: VerifyInput): VerifyResult {
  const secret = input.secrets.webhook_secret;
  if (!secret) return { ok: false, reason: 'Webhook secret is not set for this endpoint.' };
  const header = input.headers.get('elevenlabs-signature') || '';
  const parts = header.split(',');
  const t = parts.find((p) => p.startsWith('t='))?.slice(2);
  const v0 = parts.find((p) => p.startsWith('v0='));
  if (!t || !v0) return { ok: false, reason: 'Missing ElevenLabs-Signature (t=…,v0=…).' };
  if (Number(t) * 1000 < (input.now ?? Date.now()) - TOLERANCE_MS) return { ok: false, reason: 'Signature timestamp is too old.' };
  return safeEqual(v0, `v0=${hmacHex('sha256', secret, `${t}.${input.rawBody}`)}`) ? { ok: true } : { ok: false, reason: 'Signature does not match.' };
}

function phoneOf(data: any): string | null {
  const phone = data?.metadata?.phone_call || data?.conversation_initiation_client_data?.dynamic_variables || {};
  return str(phone.external_number || phone.system__caller_id || phone.from_number || phone.caller_id) || null;
}

export function normalize(body: any): NormalizedEvent[] {
  const type = str(body?.type);
  const data = body?.data || {};
  const conversationId = str(data.conversation_id);
  const caller = phoneOf(data);
  const key = `call:${caller || conversationId}`;
  const base = { conversation_key: key, sender: { id: caller || conversationId, name: caller ? null : 'ElevenLabs call' }, reply_target: { kind: 'none' as const } };
  if (type === 'post_call_transcription') {
    const turns = (Array.isArray(data.transcript) ? data.transcript : [])
      .filter((t: any) => t?.message)
      .map((t: any) => `${t.role === 'agent' ? 'Agent' : 'Caller'}: ${t.message}`);
    const summary = str(data.analysis?.transcript_summary);
    const duration = data.metadata?.call_duration_secs;
    return [{
      ...base,
      event_id: `transcription:${conversationId}`,
      type: 'call_result',
      channel: 'phone_call',
      text: [
        `Phone call handled by ElevenLabs agent ${str(data.agent_name || data.agent_id)}${duration ? ` (${Math.round(duration)} s)` : ''}.`,
        summary ? `Summary: ${summary}` : '',
        turns.length ? `Transcript:\n${turns.join('\n')}` : '',
      ].filter(Boolean).join('\n\n'),
      meta: { conversation_id: conversationId, agent_id: data.agent_id, has_audio: !!data.has_audio, call_successful: data.analysis?.call_successful, duration_secs: duration },
    }];
  }
  if (type === 'post_call_audio') {
    return [{ ...base, event_id: `audio:${conversationId}`, type: 'call_audio', channel: 'phone_call', text: 'Call recording', meta: { conversation_id: conversationId, agent_id: data.agent_id } }];
  }
  if (type === 'call_initiation_failure') {
    const sip = data.metadata?.body || {};
    return [{
      ...base,
      conversation_key: `call:${str(sip.to_number || sip.To) || conversationId}`,
      event_id: `failure:${conversationId}`,
      type: 'status',
      channel: 'phone_call',
      text: `Call could not start: ${str(data.failure_reason) || 'unknown'}`,
      meta: { conversation_id: conversationId, failure_reason: data.failure_reason },
    }];
  }
  return [];
}
