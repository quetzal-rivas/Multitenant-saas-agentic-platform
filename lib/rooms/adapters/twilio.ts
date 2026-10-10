import crypto from 'crypto';

/**
 * Twilio adapter (REST over fetch, the organization's own account). Covers what Live
 * Rooms needs: conference participants (incl. muted listeners and coaches), outbound
 * calls, the org's existing phone numbers, API keys + a TwiML App for browser calls, and
 * Voice SDK access tokens.
 */

const API = 'https://api.twilio.com/2010-04-01';

export interface TwilioCreds {
  accountSid: string;
  authToken: string;
}

export class TwilioError extends Error {
  constructor(public status: number, message: string, public code?: number) {
    super(message);
  }
}

async function call<T = any>(creds: TwilioCreds, method: 'GET' | 'POST' | 'DELETE', path: string, params?: Record<string, string | number | boolean | undefined | null | string[]>): Promise<T> {
  const url = new URL(`${API}/Accounts/${encodeURIComponent(creds.accountSid)}${path}`);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((x) => body.append(k, x));
    else body.append(k, String(v));
  }
  if (method === 'GET') body.forEach((v, k) => url.searchParams.append(k, v));
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64')}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: method === 'POST' ? body.toString() : undefined,
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new TwilioError(res.status, `Twilio ${res.status}: ${data?.message || 'request failed'}`, data?.code);
  return data as T;
}

export const twilio = {
  async verify(creds: TwilioCreds) {
    return call(creds, 'GET', '.json');
  },

  async listNumbers(creds: TwilioCreds): Promise<Array<{ sid: string; e164: string; friendly_name: string; capabilities: Record<string, boolean> }>> {
    const data = await call(creds, 'GET', '/IncomingPhoneNumbers.json', { PageSize: 200 });
    return (data.incoming_phone_numbers || []).map((n: any) => ({
      sid: n.sid,
      e164: n.phone_number,
      friendly_name: n.friendly_name,
      capabilities: { voice: !!n.capabilities?.voice, sms: !!n.capabilities?.sms },
    }));
  },

  async configureNumber(creds: TwilioCreds, sid: string, urls: { voiceUrl?: string | null; smsUrl?: string | null; statusCallback?: string | null }) {
    return call(creds, 'POST', `/IncomingPhoneNumbers/${sid}.json`, {
      ...(urls.voiceUrl !== undefined ? { VoiceUrl: urls.voiceUrl ?? '', VoiceMethod: 'POST' } : {}),
      ...(urls.smsUrl !== undefined ? { SmsUrl: urls.smsUrl ?? '', SmsMethod: 'POST' } : {}),
      ...(urls.statusCallback !== undefined ? { StatusCallback: urls.statusCallback ?? '', StatusCallbackMethod: 'POST' } : {}),
    });
  },

  /** Outbound call whose TwiML is served by `url` (our outbound handler). */
  async createCall(creds: TwilioCreds, p: { to: string; from: string; url: string; statusCallback: string; machineDetection?: boolean; timeLimit?: number }) {
    return call<{ sid: string }>(creds, 'POST', '/Calls.json', {
      To: p.to,
      From: p.from,
      Url: p.url,
      Method: 'POST',
      StatusCallback: p.statusCallback,
      StatusCallbackMethod: 'POST',
      StatusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      ...(p.machineDetection ? { MachineDetection: 'Enable' } : {}),
      ...(p.timeLimit ? { TimeLimit: p.timeLimit } : {}),
    });
  },

  /** Dial a participant (phone, sip: URI, client:) into a conference by name (created on demand). */
  async addParticipant(creds: TwilioCreds, conferenceName: string, p: {
    from: string;
    to: string;
    label?: string;
    muted?: boolean;
    coachCallSid?: string | null;
    statusCallback?: string;
    sipAuth?: { username: string; password: string } | null;
    timeLimit?: number;
    endConferenceOnExit?: boolean;
  }) {
    return call<{ call_sid: string }>(creds, 'POST', `/Conferences/${encodeURIComponent(conferenceName)}/Participants.json`, {
      From: p.from,
      To: p.to,
      Label: p.label,
      Muted: p.muted ? 'true' : undefined,
      ...(p.coachCallSid ? { Coaching: 'true', CallSidToCoach: p.coachCallSid } : {}),
      Beep: 'false',
      EarlyMedia: 'true',
      StartConferenceOnEnter: 'true',
      EndConferenceOnExit: p.endConferenceOnExit ? 'true' : 'false',
      StatusCallback: p.statusCallback,
      StatusCallbackMethod: 'POST',
      StatusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      ...(p.sipAuth ? { SipAuthUsername: p.sipAuth.username, SipAuthPassword: p.sipAuth.password } : {}),
      ...(p.timeLimit ? { TimeLimit: p.timeLimit } : {}),
    });
  },

  async updateParticipant(creds: TwilioCreds, conferenceSid: string, callSid: string, p: { muted?: boolean; coachCallSid?: string | null }) {
    return call(creds, 'POST', `/Conferences/${conferenceSid}/Participants/${callSid}.json`, {
      ...(p.muted !== undefined ? { Muted: p.muted ? 'true' : 'false' } : {}),
      ...(p.coachCallSid !== undefined ? (p.coachCallSid ? { Coaching: 'true', CallSidToCoach: p.coachCallSid } : { Coaching: 'false' }) : {}),
    });
  },

  async hangup(creds: TwilioCreds, callSid: string) {
    return call(creds, 'POST', `/Calls/${callSid}.json`, { Status: 'completed' });
  },

  async endConference(creds: TwilioCreds, conferenceSid: string) {
    return call(creds, 'POST', `/Conferences/${conferenceSid}.json`, { Status: 'completed' });
  },

  /** API key + TwiML App used for browser (Voice SDK) calls. Created once per connection. */
  async createBrowserCredentials(creds: TwilioCreds, voiceUrl: string) {
    const key = await call<{ sid: string; secret: string }>(creds, 'POST', '/Keys.json', { FriendlyName: 'Context Control browser calls' });
    const app = await call<{ sid: string }>(creds, 'POST', '/Applications.json', { FriendlyName: 'Context Control Live Rooms', VoiceUrl: voiceUrl, VoiceMethod: 'POST' });
    return { apiKeySid: key.sid, apiKeySecret: key.secret, twimlAppSid: app.sid };
  },

  async updateTwimlApp(creds: TwilioCreds, appSid: string, voiceUrl: string) {
    return call(creds, 'POST', `/Applications/${appSid}.json`, { VoiceUrl: voiceUrl, VoiceMethod: 'POST' });
  },
};

const b64url = (v: Buffer | string) => Buffer.from(v).toString('base64url');

/** Twilio Access Token (JWT, HS256 with the API key secret) with a Voice grant. */
export function voiceAccessToken(p: { accountSid: string; apiKeySid: string; apiKeySecret: string; twimlAppSid: string; identity: string; ttlSeconds?: number; now?: number }): string {
  const now = Math.floor((p.now ?? Date.now()) / 1000);
  const header = { typ: 'JWT', alg: 'HS256', cty: 'twilio-fpa;v=1' };
  const payload = {
    jti: `${p.apiKeySid}-${now}`,
    iss: p.apiKeySid,
    sub: p.accountSid,
    iat: now,
    nbf: now,
    exp: now + (p.ttlSeconds ?? 3600),
    grants: { identity: p.identity, voice: { outgoing: { application_sid: p.twimlAppSid }, incoming: { allow: false } } },
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = crypto.createHmac('sha256', p.apiKeySecret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

/** E.164 check (+ and 8-15 digits). */
export const isE164 = (v: string) => /^\+[1-9]\d{7,14}$/.test(v);
