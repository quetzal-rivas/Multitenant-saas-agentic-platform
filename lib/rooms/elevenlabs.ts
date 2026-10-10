import crypto from 'crypto';

/**
 * ElevenLabs Voice Front sync (the org's own ElevenLabs key). For each voice agent we
 * manage, in the org's ElevenLabs workspace:
 *   - a workspace secret holding a scoped Context Control API key,
 *   - an MCP server pointing at our platform MCP endpoint, which sends the call's room id
 *     in `_meta` (from the SIP header X-Room-Id → dynamic variable sip_room_id),
 *   - the agent itself (prompt, greeting, language, max duration, MCP server attached),
 *   - a SIP-trunk "phone number" so our Twilio conference can dial the agent in over SIP
 *     (digest credentials we generate).
 * Wire format checked against the official SDK (@elevenlabs/elevenlabs-js).
 */

const API = 'https://api.elevenlabs.io';
export const ELEVENLABS_SIP_HOST = 'sip.rtc.elevenlabs.io';

export class ElevenLabsError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function el<T = any>(key: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'xi-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : data?.detail?.message || data?.message || JSON.stringify(data).slice(0, 200);
    throw new ElevenLabsError(res.status, `ElevenLabs ${res.status}: ${detail}`);
  }
  return data as T;
}

export interface ElevenLabsState {
  agent_id?: string;
  mcp_server_id?: string;
  secret_id?: string;
  phone_number_id?: string;
  /** SIP identifier the conference dials: sip:<sip_identifier>@sip.rtc.elevenlabs.io */
  sip_identifier?: string;
  synced_at?: string;
  error?: string | null;
}

export interface ElevenLabsAgentSpec {
  name: string;
  prompt: string;
  firstMessage: string | null;
  language: string;
  maxSeconds: number;
  voiceId?: string | null;
  mcpUrl: string;
  /** Raw Context Control API key for the MCP server (stored as an ElevenLabs workspace secret). */
  mcpKey: string;
  sipUsername: string;
  sipPassword: string;
}

export function newSipCredentials() {
  return { username: `cc${crypto.randomBytes(6).toString('hex')}`, password: crypto.randomBytes(24).toString('base64url') };
}

export async function syncElevenLabsAgent(key: string, spec: ElevenLabsAgentSpec, state: ElevenLabsState): Promise<ElevenLabsState> {
  const next: ElevenLabsState = { ...state };

  // 1. The platform key, as a workspace secret (rotated on each sync).
  if (next.secret_id) {
    await el(key, 'PATCH', `/v1/convai/secrets/${next.secret_id}`, { name: `context-control-${spec.name}`.slice(0, 80), value: spec.mcpKey }).catch(async (err) => {
      if (err instanceof ElevenLabsError && err.status === 404) next.secret_id = undefined;
      else throw err;
    });
  }
  if (!next.secret_id) {
    const secret = await el<{ secret_id: string }>(key, 'POST', '/v1/convai/secrets', { name: `context-control-${spec.name}-${Date.now()}`.slice(0, 80), value: spec.mcpKey });
    next.secret_id = secret.secret_id;
  }

  // 2. MCP server → our platform tools, with the room id from the SIP header in _meta.
  const mcpConfig = {
    config: {
      name: `Context Control · ${spec.name}`.slice(0, 80),
      description: 'Context Control platform tools for this voice agent (team delegation, live notes, connected apps).',
      url: spec.mcpUrl,
      transport: 'STREAMABLE_HTTP',
      secret_token: { secret_id: next.secret_id },
      request_meta: { room_id: { variable_name: 'sip_room_id' } },
      approval_policy: 'auto_approve_all',
      pre_tool_speech: 'auto',
      response_timeout_secs: 30,
    },
  };
  if (next.mcp_server_id) {
    await el(key, 'PATCH', `/v1/convai/mcp-servers/${next.mcp_server_id}`, mcpConfig.config).catch(async (err) => {
      if (err instanceof ElevenLabsError && err.status === 404) next.mcp_server_id = undefined;
      else throw err;
    });
  }
  if (!next.mcp_server_id) next.mcp_server_id = (await el<{ id: string }>(key, 'POST', '/v1/convai/mcp-servers', mcpConfig)).id;

  // 3. The agent.
  const agentBody = {
    name: spec.name,
    conversation_config: {
      agent: {
        first_message: spec.firstMessage ?? '',
        language: spec.language.slice(0, 2),
        prompt: { prompt: spec.prompt, mcp_server_ids: [next.mcp_server_id] },
        dynamic_variable_placeholders: { sip_room_id: 'test-room' },
      },
      conversation: { max_duration_seconds: spec.maxSeconds },
      ...(spec.voiceId ? { tts: { voice_id: spec.voiceId } } : {}),
    },
    tags: ['context-control'],
  };
  if (next.agent_id) {
    await el(key, 'PATCH', `/v1/convai/agents/${next.agent_id}`, agentBody).catch(async (err) => {
      if (err instanceof ElevenLabsError && err.status === 404) next.agent_id = undefined;
      else throw err;
    });
  }
  if (!next.agent_id) next.agent_id = (await el<{ agent_id: string }>(key, 'POST', '/v1/convai/agents/create', agentBody)).agent_id;

  // 4. The SIP entry our conference dials (identifier + digest credentials).
  const sipIdentifier = next.sip_identifier ?? `cc${crypto.randomBytes(5).toString('hex')}`;
  const trunk = { credentials: { username: spec.sipUsername, password: spec.sipPassword } };
  if (next.phone_number_id) {
    await el(key, 'PATCH', `/v1/convai/phone-numbers/${next.phone_number_id}`, { agent_id: next.agent_id, inbound_trunk_config: trunk }).catch(async (err) => {
      if (err instanceof ElevenLabsError && err.status === 404) next.phone_number_id = undefined;
      else throw err;
    });
  }
  if (!next.phone_number_id) {
    const created = await el<{ phone_number_id: string }>(key, 'POST', '/v1/convai/phone-numbers', {
      provider: 'sip_trunk',
      phone_number: sipIdentifier,
      label: `Context Control · ${spec.name}`.slice(0, 80),
      agent_id: next.agent_id,
      supports_inbound: true,
      supports_outbound: false,
      inbound_trunk_config: trunk,
    });
    next.phone_number_id = created.phone_number_id;
  }
  next.sip_identifier = sipIdentifier;
  next.synced_at = new Date().toISOString();
  next.error = null;
  return next;
}

/** Remove what we created (best effort). */
export async function deleteElevenLabsAgent(key: string, state: ElevenLabsState) {
  const tries: Array<[string, string | undefined]> = [
    ['/v1/convai/phone-numbers/', state.phone_number_id],
    ['/v1/convai/agents/', state.agent_id],
    ['/v1/convai/mcp-servers/', state.mcp_server_id],
    ['/v1/convai/secrets/', state.secret_id],
  ];
  for (const [path, id] of tries) if (id) await el(key, 'DELETE', `${path}${id}`).catch(() => undefined);
}

/** The SIP URI Twilio dials to bring the agent into a room (header → {{sip_room_id}}). */
export function elevenLabsSipUri(identifier: string, roomId: string): string {
  return `sip:${identifier}@${ELEVENLABS_SIP_HOST}:5061;transport=tls?X-Room-Id=${encodeURIComponent(roomId)}`;
}

/** System prompt for the Voice Front: the voice talks; the team does the work. */
export function voiceFrontPrompt(p: { name: string; instructions?: string | null; teamName?: string | null; language: string }): string {
  return [
    `You are ${p.name}, speaking with a person on a live phone call. Speak naturally and briefly (one to three sentences), in the caller's language (default: ${p.language}).`,
    'At the very start, call the tool contextcontrol_room_context to learn who you are talking to, why, and what you should know. Follow what it says.',
    p.teamName
      ? `When the caller needs information, an action, or anything you are not sure about, use contextcontrol_ask_team: the "${p.teamName}" team works on it (it has the organization's tools and knowledge). Tell the caller you are checking while it works. If it answers "working", say a short holding phrase and call contextcontrol_team_answer with the run_id a few seconds later.`
      : '',
    'Use contextcontrol_room_note to flag anything a human should see now (complaints, cancellations, legal threats, urgent requests).',
    'Never invent facts, prices or commitments. If you cannot help, say a person will follow up.',
    p.instructions?.trim() ? `\nAdditional instructions:\n${p.instructions.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
