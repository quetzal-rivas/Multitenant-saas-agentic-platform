/**
 * Inbound Gateway shapes. Browser-safe (the Webhooks page uses the preset metadata).
 */

export const INBOUND_PRESETS = ['meta', 'elevenlabs', 'twilio', 'telnyx', 'generic'] as const;
export type InboundPreset = (typeof INBOUND_PRESETS)[number];

export type InboundChannel = 'whatsapp' | 'messenger' | 'instagram' | 'phone_call' | 'sms' | 'webhook';

/** Where and how a reply is sent back. */
export type ReplyTarget =
  | { kind: 'whatsapp'; phone_number_id: string; to: string }
  | { kind: 'messenger' | 'instagram'; recipient_id: string }
  | { kind: 'webhook' }
  | { kind: 'none' };

/** One message (or call result) extracted from a provider payload. */
export interface NormalizedEvent {
  /** Unique per endpoint; used for idempotency. */
  event_id: string;
  /** 'message' reaches an agent; 'status' (delivery receipts etc.) is recorded and ignored. */
  type: 'message' | 'call_result' | 'call_audio' | 'status';
  channel: InboundChannel;
  /** Stable id of the external conversation, e.g. whatsapp:5215512345678. */
  conversation_key: string;
  sender: { id: string; name?: string | null };
  text: string;
  attachments?: Array<{ type: string; id?: string; url?: string; mime?: string }>;
  reply_target: ReplyTarget;
  /** Provider-specific extras (conversation ids, timestamps…). */
  meta?: Record<string, unknown>;
}

/** Secrets each preset uses (write-only in the UI). */
export const PRESET_SECRETS: Record<InboundPreset, Array<{ name: string; label: string; required: boolean; hint: string }>> = {
  meta: [
    { name: 'app_secret', label: 'App secret', required: true, hint: 'Meta App Dashboard → App settings → Basic. Used to verify X-Hub-Signature-256.' },
    { name: 'verify_token', label: 'Verify token', required: true, hint: 'Any random string; paste the same value in Meta → Webhooks.' },
    { name: 'access_token', label: 'Access token (for replies)', required: false, hint: 'WhatsApp system-user token, or the Page access token for Messenger/Instagram.' },
  ],
  elevenlabs: [
    { name: 'webhook_secret', label: 'Webhook secret', required: true, hint: 'Shown once when you create the post-call webhook in ElevenLabs.' },
  ],
  twilio: [{ name: 'auth_token', label: 'Auth token', required: true, hint: 'Twilio Console → Account info. Used to verify X-Twilio-Signature.' }],
  telnyx: [{ name: 'public_key', label: 'Public key', required: true, hint: 'Telnyx Portal → Keys & Credentials → Public key (base64).' }],
  generic: [
    { name: 'signing_secret', label: 'Signing secret', required: true, hint: 'Shared secret; the sender signs the raw body with HMAC-SHA256 (hex).' },
    { name: 'reply_secret', label: 'Reply signing secret', required: false, hint: 'Optional: signs replies POSTed to your reply URL.' },
  ],
};

export const PRESET_LABEL: Record<InboundPreset, string> = {
  meta: 'Meta (WhatsApp, Messenger, Instagram)',
  elevenlabs: 'ElevenLabs post-call',
  twilio: 'Twilio (SMS, call status)',
  telnyx: 'Telnyx',
  generic: 'Generic (HMAC)',
};

export const CHANNEL_LABEL: Record<InboundChannel, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  phone_call: 'Phone call',
  sms: 'SMS',
  webhook: 'Webhook',
};

/** What a router function returns (validated server-side). */
export interface RouterDecision {
  action: 'route' | 'ignore';
  team_id?: string;
  conversation_key?: string;
  message?: string;
  reply?: boolean;
  reason?: string;
}

export interface RuleCondition {
  path: string;
  op: 'equals' | 'contains' | 'exists' | 'regex';
  value?: string;
}

export interface RoutingRule {
  name?: string;
  when: RuleCondition[];
  team_id: string | null;
  /** 'ignore' drops matching events (e.g. test pings). */
  action?: 'route' | 'ignore';
  message_template?: string | null;
}
