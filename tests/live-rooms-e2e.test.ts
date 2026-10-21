import assert from 'assert';
import crypto from 'crypto';
import { test, describe, before, after, beforeEach } from 'node:test';
import { NextRequest } from 'next/server';
import { fakePostgrest, resetTables, tables } from './helpers/fake-postgrest';
import { envelopeEncryptSecret } from '../lib/secrets/envelope-encryption';
import { createTeam } from '../lib/services/teams';
import { attestCallCompliance, configureNumber, connectTwilio, getConnectionRow, getTelephonyStatus } from '../lib/services/telephony';
import { createVoiceAgent, withinCallingHours } from '../lib/services/voice-agents';
import { endRoom, getRoomDetail, joinTicket, placeCall, sweepRooms } from '../lib/services/rooms';
import { executePlatformTool } from '../lib/mcp/platform-mcp-server';
import { setDefaultRunnerDepsForTests, setRunDispatcherForTests } from '../lib/services/agent-runs';
import { setAudioCacheForTests } from '../lib/voice/audio-cache';
import { setVoiceSecretGetterForTests } from '../lib/voice/engine';
import { createEndpoint, setEndpointSecret, receiveWebhook, setInboundDispatcherForTests, processInboundEvents } from '../lib/services/inbound';
import { listConversations } from '../lib/services/conversations';
import { voiceAccessToken } from '../lib/rooms/adapters/twilio';
import { POST as TWILIO_HOOK } from '../app/api/voice/twilio/[connectionId]/[action]/route';
import type { LLMGenerateResult } from '../lib/agent/providers/llm-adapter';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ctx = { tenantId: TENANT, userId: crypto.randomUUID(), authMode: 'session' as const, scopes: ['*'] };
const ORIGIN = 'https://app.test';
const AC = 'AC' + 'a'.repeat(32);
const TOKEN = 'twilio-auth-token-123456';
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

let reply = 'There are 2 open tasks on the board.';
let prompts: Array<{ system: string; last: string }> = [];
let holdRuns = false;
const held: string[] = [];

/** Fake Twilio / ElevenLabs / Gemini. */
const twilioCalls: Array<{ method: string; path: string; params: URLSearchParams }> = [];
const elCalls: Array<{ method: string; path: string; body: any }> = [];
let twilioRejects = false;

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method || 'GET').toUpperCase();
  if (url.hostname === 'api.twilio.com') {
    const params = method === 'GET' ? url.searchParams : new URLSearchParams(String(init?.body || ''));
    const path = url.pathname.replace(`/2010-04-01/Accounts/${AC}`, '');
    twilioCalls.push({ method, path, params });
    if (twilioRejects) return Response.json({ message: 'Authenticate', code: 20003 }, { status: 401 });
    if (path === '.json') return Response.json({ sid: AC, status: 'active' });
    if (path === '/IncomingPhoneNumbers.json') {
      return Response.json({ incoming_phone_numbers: [{ sid: 'PN1', phone_number: '+15550001111', friendly_name: 'Main', capabilities: { voice: true, sms: true } }] });
    }
    if (path.startsWith('/IncomingPhoneNumbers/')) return Response.json({ sid: 'PN1' });
    if (path === '/Keys.json') return Response.json({ sid: 'SK' + 'b'.repeat(32), secret: 'api-key-secret' });
    if (path === '/Applications.json') return Response.json({ sid: 'AP' + 'c'.repeat(32) });
    if (path.startsWith('/Applications/')) return Response.json({});
    if (path === '/Calls.json') return Response.json({ sid: 'CAout' + crypto.randomBytes(4).toString('hex') });
    if (path.includes('/Participants')) return Response.json({ call_sid: 'CAagent' + crypto.randomBytes(4).toString('hex') });
    return Response.json({});
  }
  if (url.hostname === 'api.elevenlabs.io') {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    elCalls.push({ method, path: url.pathname, body });
    if (url.pathname === '/v1/convai/secrets' && !body?.type) {
      // Like the real API: validation errors echo the submitted input.
      return Response.json({ detail: [{ type: 'missing', loc: ['body', 'type'], msg: 'Field required', input: body }] }, { status: 422 });
    }
    if (url.pathname === '/v1/convai/secrets') return Response.json({ type: 'stored', secret_id: 'sec_1', name: body.name });
    if (url.pathname === '/v1/convai/conversations' && method === 'GET') {
      const room = (url.searchParams.get('dynamic_variable_params') || '').replace('sip_room_id:eq:', '');
      const summary = elSummaries.get(room);
      assert.equal(url.searchParams.get('summary_mode'), 'include');
      return Response.json({ conversations: summary ? [{ conversation_id: `conv_${room}`, status: 'done', transcript_summary: summary }] : [] });
    }
    if (url.pathname === '/v1/convai/phone-numbers' && method === 'POST' && takenSipIds.has(body?.phone_number)) {
      return Response.json({ detail: { status: 'phone_number_already_exists', message: `Phone number ${body.phone_number} already exists.` } }, { status: 409 });
    }
    if (url.pathname === '/v1/convai/settings' && method === 'PATCH') {
      if (body?.can_use_mcp_servers === true) elMcpDenied = false;
      return Response.json({ can_use_mcp_servers: !elMcpDenied });
    }
    if (url.pathname === '/v1/convai/mcp-servers' && elMcpDenied) return Response.json({ detail: { status: 'mcp_not_allowed', message: 'User does not have access to MCP servers.' } }, { status: 400 });
    if (url.pathname === '/v1/convai/mcp-servers') return Response.json({ id: 'mcp_1' });
    if (url.pathname === '/v1/convai/agents/create') return Response.json({ agent_id: 'agent_1' });
    if (url.pathname === '/v1/convai/phone-numbers') return Response.json({ phone_number_id: 'pn_el_1' });
    return Response.json({});
  }
  if (url.hostname === 'generativelanguage.googleapis.com') {
    return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: Buffer.alloc(240).toString('base64') } }] } }] });
  }
  return fakePostgrest(input, init);
}

function twilioSign(url: string, params: Record<string, string>, token = TOKEN) {
  const data = Object.keys(params).sort().reduce((a, k) => a + k + params[k], url);
  return crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf8')).digest('base64');
}

let elMcpDenied = false;
const takenSipIds = new Set<string>();
const elSummaries = new Map<string, string>();
async function hook(connId: string, action: string, params: Record<string, string>, query: Record<string, string> = {}, token = TOKEN) {
  const qs = new URLSearchParams(query).toString();
  const url = `${ORIGIN}/api/voice/twilio/${connId}/${action}${qs ? `?${qs}` : ''}`;
  const res = await TWILIO_HOOK(
    new NextRequest(url, { method: 'POST', body: new URLSearchParams(params).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': twilioSign(url, params, token) } }),
    { params: Promise.resolve({ connectionId: connId, action }) }
  );
  return { status: res.status, text: await res.text() };
}

describe('Live Rooms: Twilio rooms, Ear, Voice Front, outbound, turn-based', () => {
  const realFetch = globalThis.fetch;
  let team: string;
  let listener: string;
  let mcpProfile: string;
  let contextProfile: string;

  before(async () => {
    globalThis.fetch = fakeFetch as typeof fetch;
    const { handler } = await import('../lib/agent/worker-entry');
    setDefaultRunnerDepsForTests({
      getSecret: async () => 'k',
      generate: async (o: any) => {
        prompts.push({ system: o.systemPrompt, last: o.messages[o.messages.length - 1]?.content ?? '' });
        return { text: reply, usage, finishReason: 'stop' } as LLMGenerateResult;
      },
    });
    setRunDispatcherForTests(async (id) => {
      if (holdRuns) {
        held.push(id);
        return true;
      }
      await handler({ run_id: id }, { awsRequestId: crypto.randomUUID() });
      return true;
    });
    setInboundDispatcherForTests(async (ids) => {
      await processInboundEvents(ids);
      return true;
    });
    setVoiceSecretGetterForTests(async (_t, p) => (p === 'gemini' ? 'g-key' : null));
  });
  after(() => {
    globalThis.fetch = realFetch;
    setRunDispatcherForTests(null);
    setDefaultRunnerDepsForTests(null);
    setInboundDispatcherForTests(null);
    setAudioCacheForTests(null);
    setVoiceSecretGetterForTests(null);
  });
  beforeEach(async () => {
    reply = 'There are 2 open tasks on the board.';
    prompts = [];
    holdRuns = false;
    held.length = 0;
    twilioCalls.length = 0;
    elCalls.length = 0;
    twilioRejects = false;
    resetTables([
      'telephony_connections', 'phone_numbers', 'voice_agents', 'rooms', 'room_participants', 'utterances', 'room_notes', 'call_blocklist',
      'agent_runs', 'agent_sessions', 'agent_teams', 'team_workers', 'checkpoints', 'run_events', 'encrypted_secrets', 'mcp_profiles',
      'context_profiles', 'voice_profiles', 'voice_usage', 'mcp_api_keys', 'organizations', 'inbound_endpoints', 'inbound_events', 'inbound_threads', 'supervisor_tasks',
    ]);
    tables.organizations.push({ id: TENANT, name: 'Acme', voice_compliance_attested_at: null });
    tables.encrypted_secrets.push({ tenant_id: TENANT, provider: 'gemini', updated_at: '2026-01-01', encrypted_payload: {} });
    tables.encrypted_secrets.push({ tenant_id: TENANT, provider: 'elevenlabs', updated_at: '2026-01-01', encrypted_payload: await envelopeEncryptSecret('el-key', TENANT, 'elevenlabs') });
    team = (await createTeam(ctx, { name: 'Board Crew', llm: { provider: 'gemini' }, supervisor: { tools: [] } })).id;
    listener = (await createTeam(ctx, { name: 'Listener', llm: { provider: 'gemini' }, supervisor: { tools: ['contextcontrol_room_note', 'contextcontrol_room_transcript'] } })).id;
    mcpProfile = crypto.randomUUID();
    tables.mcp_profiles.push({ id: mcpProfile, org_id: TENANT, name: 'Phone tools', description: null, token_budget: 1000, settings: {}, is_active: true, archived_at: null, created_at: '2026-10-01', updated_at: '2026-10-01' });
    contextProfile = crypto.randomUUID();
    tables.context_profiles.push({
      id: contextProfile, tenant_id: TENANT, slug: 'reception', name: 'Reception', description: null, version: 1, created_at: '2026-01-01', updated_at: '2026-01-01', archived_at: null,
      definition: { pipeline: [{ id: 's', type: 'system_instructions', title: 'Reception', description: '', sourceId: '', priority: 5, enabled: true, config: { staticContent: 'We are Acme Resorts. Offices open 9-18.' } }] },
    });
  });

  async function connect() {
    await connectTwilio(ctx, { account_sid: AC, auth_token: TOKEN }, ORIGIN);
    return (await getConnectionRow(TENANT))!;
  }

  async function voiceFront(extra: Record<string, unknown> = {}) {
    return createVoiceAgent(ctx, { name: 'Reception', mode: 'elevenlabs', team_id: team, context_profile_id: contextProfile, mcp_profile_id: mcpProfile, greeting: 'Hola, ¿en qué le ayudo?', ...extra }, ORIGIN);
  }

  test('connect Twilio: verified, encrypted, browser credentials, numbers synced and configured', async () => {
    twilioRejects = true;
    await assert.rejects(connectTwilio(ctx, { account_sid: AC, auth_token: TOKEN }, ORIGIN), /rejected the Account SID/);
    await assert.rejects(connectTwilio(ctx, { account_sid: 'nope', auth_token: TOKEN }, ORIGIN), /starts with AC/);
    twilioRejects = false;
    const conn = await connect();
    assert.ok(!JSON.stringify(conn.secrets).includes(TOKEN), 'auth token is encrypted');
    const status = await getTelephonyStatus(ctx);
    assert.equal(status.connection!.browser_calls, true);
    assert.ok(!JSON.stringify(status).includes(TOKEN));
    assert.ok(twilioCalls.some((c) => c.path === '/Applications.json' && c.params.get('VoiceUrl') === `${ORIGIN}/api/voice/twilio/${conn.id}/client`));
    assert.equal(tables.phone_numbers.length, 1);

    const agent = await voiceFront();
    const updated = await configureNumber(ctx, tables.phone_numbers[0].id, { voice_agent_id: agent.id });
    assert.equal(updated!.voice_agent_id, agent.id);
    const cfg = twilioCalls.find((c) => c.path === '/IncomingPhoneNumbers/PN1.json')!;
    assert.equal(cfg.params.get('VoiceUrl'), `${ORIGIN}/api/voice/twilio/${conn.id}/incoming`);

    // Browser token: a Twilio access token with a Voice grant, signed with the API key secret.
    const jwt = voiceAccessToken({ accountSid: AC, apiKeySid: 'SKx', apiKeySecret: 'shh', twimlAppSid: 'APx', identity: 'u_1', now: 0 });
    const [h, p, sig] = jwt.split('.');
    assert.equal(JSON.parse(Buffer.from(h, 'base64url').toString()).cty, 'twilio-fpa;v=1');
    assert.deepEqual(JSON.parse(Buffer.from(p, 'base64url').toString()).grants.voice.outgoing, { application_sid: 'APx' });
    assert.equal(sig, crypto.createHmac('sha256', 'shh').update(`${h}.${p}`).digest('base64url'));
  });

  test('ElevenLabs Voice Front sync: scoped MCP key, MCP server with the room id in _meta, agent, SIP entry', async () => {
    const agent = await voiceFront();
    assert.equal(agent.elevenlabs!.ready, true);
    const secret = elCalls.find((c) => c.path === '/v1/convai/secrets')!;
    assert.match(secret.body.value, /^ctx_live_[0-9a-f]{48}$/);
    assert.equal(secret.body.type, 'new');
    assert.match(secret.body.name, /^[A-Za-z0-9_-]+$/);
    const key = tables.mcp_api_keys.at(-1)!;
    assert.equal(key.profile_id, mcpProfile);
    assert.deepEqual(key.scopes, ['mcp:rooms:read', 'mcp:rooms:write', 'mcp:functions:invoke', 'mcp:connectors:invoke']);
    assert.ok(key.tools_whitelist.includes('contextcontrol_ask_team') && !key.tools_whitelist.includes('contextcontrol_place_call'));
    const mcp = elCalls.find((c) => c.path === '/v1/convai/mcp-servers')!.body.config;
    assert.equal(mcp.url, `${ORIGIN}/api/mcp/platform`);
    assert.deepEqual(mcp.secret_token, { secret_id: 'sec_1' });
    assert.deepEqual(mcp.request_meta, { room_id: { variable_name: 'sip_room_id' } });
    const created = elCalls.find((c) => c.path === '/v1/convai/agents/create')!.body;
    assert.match(created.conversation_config.agent.prompt.prompt, /contextcontrol_room_context[\s\S]*Board Crew/);
    assert.deepEqual(created.conversation_config.agent.prompt.mcp_server_ids, ['mcp_1']);
    const sip = elCalls.find((c) => c.path === '/v1/convai/phone-numbers')!.body;
    assert.equal(sip.provider, 'sip_trunk');
    assert.equal(sip.agent_id, 'agent_1');
    assert.ok(sip.inbound_trunk_config.credentials.username && sip.inbound_trunk_config.credentials.password);

    // Saving again rotates the key and updates in place (no duplicates).
    const { updateVoiceAgent } = await import('../lib/services/voice-agents');
    await updateVoiceAgent(ctx, agent.id, { name: 'Reception', mode: 'elevenlabs', team_id: team, mcp_profile_id: mcpProfile }, ORIGIN);
    assert.equal(elCalls.filter((c) => c.path === '/v1/convai/agents/create').length, 1);
    assert.ok(elCalls.some((c) => c.method === 'PATCH' && c.path === '/v1/convai/agents/agent_1'));
    assert.ok(tables.mcp_api_keys[0].revoked_at, 'previous key revoked');
  });

  test('ElevenLabs errors never echo the submitted key', async () => {
    const { errorDetail } = await import('../lib/rooms/elevenlabs');
    const detail = errorDetail({ detail: [{ loc: ['body', 'type'], msg: 'Field required', input: { value: 'ctx_live_' + 'a'.repeat(48) } }] });
    assert.equal(detail, 'body.type: Field required');
    assert.equal(errorDetail({ message: 'bad key ctx_live_abc123' }), 'bad key ctx_***');
  });

  test('inbound call: signature, consent, conference + Ear, agent dialed in over SIP when the caller joins', async () => {
    const conn = await connect();
    const agent = await voiceFront({ listener_team_id: listener, triggers: [{ type: 'keyword', any: ['cancelar', 'PROFECO'], role: 'customer' }] });
    await configureNumber(ctx, tables.phone_numbers[0].id, { voice_agent_id: agent.id });
    const call = { CallSid: 'CAcust1', From: '+5215512345678', To: '+15550001111' };

    assert.equal((await hook(conn.id, 'incoming', call, {}, 'wrong-token')).status, 403);
    const res = await hook(conn.id, 'incoming', call);
    assert.equal(res.status, 200);
    const room = tables.rooms[0];
    assert.equal(room.kind, 'phone_in');
    assert.match(res.text, /<Say[^>]*>Esta llamada puede ser grabada/);
    assert.match(res.text, /<Start><Transcription[^>]*statusCallbackUrl="https:\/\/app\.test\/api\/voice\/twilio\/[^"]+\/transcription\?room=[^"]+"[^>]*languageCode="es-MX"/);
    assert.match(res.text, new RegExp(`<Conference[^>]*>cc-${room.id}</Conference>`));

    await hook(conn.id, 'conference', { StatusCallbackEvent: 'participant-join', ConferenceSid: 'CF1', CallSid: 'CAcust1', FriendlyName: `cc-${room.id}` }, { room: room.id });
    const add = twilioCalls.find((c) => c.path === `/Conferences/cc-${room.id}/Participants.json`)!;
    assert.equal(
      add.params.get('To'),
      `sip:${tables.voice_agents[0].provider_state.elevenlabs.sip_identifier}@sip.rtc.elevenlabs.io:5061;transport=tls?X-Room-Id=${room.id}&X-Contact-Brief=${encodeURIComponent('No earlier conversations with this number.')}`
    );
    assert.ok(add.params.get('SipAuthUsername') && add.params.get('SipAuthPassword'));
    assert.equal(tables.rooms[0].status, 'live');
    assert.equal(tables.room_participants.filter((p) => p.room_id === room.id).length, 2);

    // Ear: final transcription lines per track; partial and duplicate lines are ignored.
    const line = (track: string, seq: string, transcript: string, final = 'true') =>
      hook(conn.id, 'transcription', { TranscriptionEvent: 'transcription-content', CallSid: 'CAcust1', Track: track, InboundTrackLabel: 'customer', OutboundTrackLabel: 'agent', SequenceId: seq, Final: final, TranscriptionData: JSON.stringify({ transcript, confidence: 0.9 }) }, { room: room.id });
    await line('outbound_track', '1', 'Hola, ¿en qué le ayudo?');
    await line('inbound_track', '2', 'Quiero saber mis tareas', 'false');
    await line('inbound_track', '3', 'Quiero cancelar mi contrato o voy a PROFECO');
    await line('inbound_track', '3', 'Quiero cancelar mi contrato o voy a PROFECO');
    const utts = tables.utterances.filter((u) => u.room_id === room.id).sort((a, b) => a.seq - b.seq);
    assert.deepEqual(utts.map((u) => [u.seq, u.speaker_role]), [[1, 'agent'], [2, 'customer']]);

    // Keyword → listener team run with the new transcript; cooldown stops a second run.
    const listenerRuns = tables.agent_runs.filter((r) => r.origin === 'room' && r.session_id === tables.rooms[0].listener_session_id);
    assert.equal(listenerRuns.length, 1);
    assert.match(listenerRuns[0].input_message, /said "cancelar"[\s\S]*customer: Quiero cancelar/);
    await line('inbound_track', '4', 'De verdad, quiero cancelar');
    assert.equal(tables.agent_runs.filter((r) => r.session_id === tables.rooms[0].listener_session_id).length, 1);

    // Voice tools: context (from the context profile), ask the team, notes; tenant isolation.
    const vctx = { tenantId: TENANT, userId: 'key', authMode: 'api_key' as const, apiKeyId: 'k1' };
    const context: any = await executePlatformTool('contextcontrol_room_context', { room_id: room.id }, vctx);
    assert.match(context.context, /Caller: \+5215512345678[\s\S]*We are Acme Resorts/);
    const answer: any = await executePlatformTool('contextcontrol_ask_team', { room_id: room.id, question: 'What is on the board?' }, vctx);
    assert.deepEqual(answer, { status: 'done', answer: reply });
    assert.match(prompts.at(-1)!.system, /voice conversation/, 'team answers in spoken style');
    await executePlatformTool('contextcontrol_room_note', { room_id: room.id, text: 'Wants to cancel', level: 'alert' }, vctx);
    assert.ok(tables.room_notes.some((n) => n.level === 'alert' && n.author === 'Voice agent'));
    await assert.rejects(executePlatformTool('contextcontrol_room_context', { room_id: room.id }, { ...vctx, tenantId: OTHER }), /not found/i);
    await assert.rejects(getRoomDetail({ tenantId: OTHER }, room.id), /not found/i);

    // Listen in: a member gets a ticket; the browser leg joins muted; a forged ticket is rejected.
    const t = await joinTicket(ctx, room.id);
    const ok = await hook(conn.id, 'client', { CallSid: 'CAweb', From: `client:${t.identity}`, room: room.id, ticket: t.ticket, exp: t.exp });
    assert.match(ok.text, /<Conference[^>]*muted="true"[^>]*>/);
    const bad = await hook(conn.id, 'client', { CallSid: 'CAweb2', From: `client:${t.identity}`, room: room.id, ticket: 'f'.repeat(64), exp: t.exp });
    assert.match(bad.text, /<Reject\/>/);

    // The call ends → room ended + listener summary run; it shows in Conversations as a call.
    await hook(conn.id, 'conference', { StatusCallbackEvent: 'conference-end', ConferenceSid: 'CF1', ReasonConferenceEnded: 'participant-with-end-conference-on-exit-left' }, { room: room.id });
    assert.equal(tables.rooms[0].status, 'ended');
    assert.ok(tables.agent_runs.some((r) => /The call ended. Write a short summary/.test(r.input_message)));
    const { conversations } = await listConversations(ctx, { kind: 'call' });
    assert.equal(conversations[0].room_id, room.id);
  });

  test('ElevenLabs post-call webhook attaches the summary to the live-call room', async () => {
    const conn = await connect();
    const agent = await voiceFront();
    await configureNumber(ctx, tables.phone_numbers[0].id, { voice_agent_id: agent.id });
    await hook(conn.id, 'incoming', { CallSid: 'CA9', From: '+5215500000000', To: '+15550001111' });
    const room = tables.rooms[0];
    const ep = await createEndpoint(ctx, { name: 'EL', preset: 'elevenlabs' });
    await setEndpointSecret(ctx, ep.id, 'webhook_secret', 'wsec');
    const raw = JSON.stringify({ type: 'post_call_transcription', data: { conversation_id: 'conv_1', agent_id: 'agent_1', transcript: [], analysis: { transcript_summary: 'Caller asked about open tasks.' }, conversation_initiation_client_data: { dynamic_variables: { sip_room_id: room.id } } } });
    const ts = Math.floor(Date.now() / 1000);
    const sig = `t=${ts},v0=${crypto.createHmac('sha256', 'wsec').update(`${ts}.${raw}`).digest('hex')}`;
    assert.equal((await receiveWebhook(ep.id, raw, new Headers({ 'elevenlabs-signature': sig }), `${ORIGIN}/api/hooks/${ep.id}`)).status, 200);
    assert.equal(tables.rooms[0].summary, 'Caller asked about open tasks.');
    assert.equal(tables.inbound_threads.length, 0, 'no separate thread for a room call');
  });

  test('outbound calls: compliance, blocklist, hours, then dial with machine detection; voicemail and human answers', async () => {
    const conn = await connect();
    const agent = await voiceFront({ calling_hours: null });
    await configureNumber(ctx, tables.phone_numbers[0].id, { voice_agent_id: agent.id });
    await assert.rejects(placeCall(ctx, { to: '+5215511112222', voice_agent_id: agent.id }), /confirm call consent/);
    await attestCallCompliance(ctx);
    await assert.rejects(placeCall(ctx, { to: '5511112222', voice_agent_id: agent.id }), /E\.164/);
    tables.call_blocklist.push({ tenant_id: TENANT, e164: '+5215599999999' });
    await assert.rejects(placeCall(ctx, { to: '+5215599999999', voice_agent_id: agent.id }), /do-not-call/);

    const res = await placeCall(ctx, { to: '+5215511112222', voice_agent_id: agent.id, purpose: 'Welcome call after the sale' });
    const dial = twilioCalls.find((c) => c.path === '/Calls.json')!;
    assert.equal(dial.params.get('To'), '+5215511112222');
    assert.equal(dial.params.get('From'), '+15550001111');
    assert.equal(dial.params.get('MachineDetection'), 'Enable');
    assert.equal(dial.params.get('Url'), `${ORIGIN}/api/voice/twilio/${conn.id}/outbound?room=${res.room_id}`);

    const machine = await hook(conn.id, 'outbound', { CallSid: 'CAo', AnsweredBy: 'machine_start' }, { room: res.room_id });
    assert.match(machine.text, /<Hangup\/>/);
    assert.equal(tables.rooms.find((r) => r.id === res.room_id)!.end_reason, 'voicemail');

    const second = await placeCall(ctx, { to: '+5215511113333', voice_agent_id: agent.id });
    const human = await hook(conn.id, 'outbound', { CallSid: 'CAo2', AnsweredBy: 'human' }, { room: second.room_id });
    assert.match(human.text, /<Start><Transcription[\s\S]*<Conference/);

    // The agent tool requires its own scope (voice agents' keys don't have it).
    const { getAuthorizedPlatformTools } = await import('../lib/mcp/tool-catalog');
    assert.ok(!getAuthorizedPlatformTools([], ['mcp:rooms:read', 'mcp:rooms:write']).some((t) => t.name === 'contextcontrol_place_call'));
    assert.ok(getAuthorizedPlatformTools([], ['mcp:calls:write']).some((t) => t.name === 'contextcontrol_place_call'));

    // Calling hours.
    assert.equal(withinCallingHours({ timezone: 'UTC', days: [1], start: '09:00', end: '18:00' }, new Date('2026-10-12T10:00:00Z')), true); // Monday
    assert.equal(withinCallingHours({ timezone: 'UTC', days: [1], start: '09:00', end: '18:00' }, new Date('2026-10-12T19:00:00Z')), false);
    assert.equal(withinCallingHours({ timezone: 'UTC', days: [1], start: '09:00', end: '18:00' }, new Date('2026-10-13T10:00:00Z')), false); // Tuesday

    await endRoom(ctx, second.room_id);
    assert.equal(tables.rooms.find((r) => r.id === second.room_id)!.status, 'ended');
  });

  test('turn-based: any team answers turn by turn with our TTS via <Play>, hold + redirect while it works', async () => {
    const stored = new Map<string, unknown>();
    setAudioCacheForTests({ get: async (k) => (stored.get(k) as any) ?? null, put: async (k, v) => void stored.set(k, v) });
    const conn = await connect();
    const agent = await createVoiceAgent(ctx, { name: 'Simple line', mode: 'turn_based', team_id: team, greeting: 'Hola, soy el asistente.' }, ORIGIN);
    await configureNumber(ctx, tables.phone_numbers[0].id, { voice_agent_id: agent.id });
    const start = await hook(conn.id, 'incoming', { CallSid: 'CAt', From: '+5215522223333', To: '+15550001111' });
    const room = tables.rooms[0];
    assert.equal(room.mode, 'turn_based');
    assert.match(start.text, /<Gather[^>]*input="speech"[^>]*language="es-MX"[^>]*><Play>https:\/\/cache\.test\/tts\//);

    const turn = await hook(conn.id, 'turn', { CallSid: 'CAt', SpeechResult: '¿Qué hay en el tablero?', Confidence: '0.9' }, { room: room.id });
    assert.match(turn.text, /<Gather[^>]*><Play>/);
    assert.match(prompts.at(-1)!.last, /Caller \+5215522223333 said: ¿Qué hay en el tablero\?/);
    const lines = tables.utterances.filter((u) => u.room_id === room.id).sort((a, b) => a.seq - b.seq).map((u) => u.speaker_role);
    assert.deepEqual(lines, ['agent', 'customer', 'agent']);

    holdRuns = true;
    const slow = await hook(conn.id, 'turn', { CallSid: 'CAt', SpeechResult: 'Otra pregunta' }, { room: room.id });
    assert.match(slow.text, /<Say[^>]*>Un momento, por favor\.<\/Say><Redirect method="POST">[^<]*turn\?room=[^<]*poll=/);
  });

  test('the voice knows the caller from the first second, can hang up, and the call gets a summary', async () => {
    const conn = await connect();
    const agent = await voiceFront();
    await configureNumber(ctx, tables.phone_numbers[0].id, { voice_agent_id: agent.id });
    // The number also reports when inbound calls end.
    const numberCfg = twilioCalls.filter((c) => c.path.startsWith('/IncomingPhoneNumbers/')).at(-1)!;
    assert.match(numberCfg.params.get('StatusCallback')!, /\/call-status$/);

    const created = elCalls.filter((c) => c.path === '/v1/convai/agents/create').at(-1)!.body;
    assert.equal(created.conversation_config.agent.prompt.built_in_tools.end_call, null, "ElevenLabs' end_call is off: hanging up goes through our tool");
    assert.match(created.conversation_config.agent.prompt.prompt, /contextcontrol_room_hangup/);
    assert.ok(tables.mcp_api_keys.at(-1)!.tools_whitelist.includes('contextcontrol_room_hangup'), 'the voice key may hang up');
    assert.ok(created.conversation_config.agent.dynamic_variables.dynamic_variable_placeholders.sip_contact_brief);
    assert.match(created.conversation_config.agent.prompt.prompt, /\{\{sip_contact_brief\}\}/);

    const caller = '+13055550100';
    tables.rooms.push({ id: 'room-before', tenant_id: TENANT, kind: 'phone_in', mode: 'elevenlabs', status: 'ended', voice_agent_id: agent.id, customer_number: caller, summary: 'The caller, Quetzal, asked the agent to remember his name.', started_at: '2026-10-20T10:00:00.000Z', ended_at: '2026-10-20T10:02:00.000Z', created_at: '2026-10-20T10:00:00.000Z' });

    await hook(conn.id, 'incoming', { CallSid: 'CAq', From: caller, To: '+15550001111' });
    const room = tables.rooms.find((r) => r.customer_number === caller && r.id !== 'room-before')!;
    await hook(conn.id, 'conference', { StatusCallbackEvent: 'participant-join', ConferenceSid: 'CFq', CallSid: 'CAq', FriendlyName: `cc-${room.id}` }, { room: room.id });
    const add = twilioCalls.filter((c) => c.path === `/Conferences/cc-${room.id}/Participants.json`).at(-1)!;
    const sipTo = add.params.get('To')!;
    assert.match(sipTo, new RegExp(`X-Room-Id=${room.id}&X-Contact-Brief=`));
    assert.match(decodeURIComponent(sipTo.split('X-Contact-Brief=')[1]), /Quetzal/);
    assert.equal(add.params.get('EndConferenceOnExit'), 'true', 'when the agent hangs up, the call ends');

    // The voice says goodbye and hangs up: we end the conference in Twilio right away.
    const { setHangupDelayForTests } = await import('../lib/services/rooms');
    setHangupDelayForTests(0);
    tables.rooms.find((r) => r.id === room.id)!.provider_room_sid = 'CFq';
    const voice = { tenantId: TENANT, userId: 'key_voice', authMode: 'api_key', apiKeyId: 'k', scopes: ['mcp:rooms:read', 'mcp:rooms:write'], toolsWhitelist: [] } as any;
    const hung: any = await executePlatformTool('contextcontrol_room_hangup', { room_id: room.id, reason: 'caller said goodbye' }, voice);
    assert.equal(hung.room.status, 'ended');
    assert.ok(twilioCalls.some((c) => c.path === '/Conferences/CFq.json' && c.params.get('Status') === 'completed'), 'the conference is closed in Twilio');
    assert.match(tables.rooms.find((r) => r.id === room.id)!.end_reason, /the voice agent hung up: caller said goodbye/);
    setHangupDelayForTests(4000);

    // After the call, ElevenLabs' own summary is copied in (found by the room id).
    tables.rooms.find((r) => r.id === room.id)!.ended_at = new Date(Date.now() - 60_000).toISOString();
    elSummaries.set(room.id, 'Quetzal called again; he was greeted by name.');
    await sweepRooms();
    assert.equal(tables.rooms.find((r) => r.id === room.id)!.summary, 'Quetzal called again; he was greeted by name.');
    elSummaries.clear();
  });

  test('turn-based calls close when the caller hangs up and get a summary from the team', async () => {
    const stored = new Map<string, unknown>();
    setAudioCacheForTests({ get: async (k) => (stored.get(k) as any) ?? null, put: async (k, v) => void stored.set(k, v) });
    const conn = await connect();
    const agent = await createVoiceAgent(ctx, { name: 'Simple line', mode: 'turn_based', team_id: team, greeting: 'Hola.' }, ORIGIN);
    await configureNumber(ctx, tables.phone_numbers[0].id, { voice_agent_id: agent.id });
    await hook(conn.id, 'incoming', { CallSid: 'CAtb', From: '+5215500002222', To: '+15550001111' });
    const room = tables.rooms.at(-1)!;
    await hook(conn.id, 'turn', { CallSid: 'CAtb', SpeechResult: 'Me llamo Quetzal', Confidence: '0.9' }, { room: room.id });

    reply = 'Quetzal called to say his name; nothing pending.';
    const res = await hook(conn.id, 'call-status', { CallSid: 'CAtb', CallStatus: 'completed' });
    assert.equal(res.status, 204);
    const after = tables.rooms.find((r) => r.id === room.id)!;
    assert.equal(after.status, 'ended');
    assert.equal(after.end_reason, 'caller hung up');
    assert.equal(after.summary, 'Quetzal called to say his name; nothing pending.');
    assert.match(prompts.at(-1)!.last, /The call has ended/);
  });

  test('a SIP identifier taken in another ElevenLabs workspace is replaced by a new one', async () => {
    const agent = await voiceFront();
    const row = tables.voice_agents.find((v) => v.id === agent.id)!;
    const old = row.provider_state.elevenlabs.sip_identifier;
    // Switching ElevenLabs accounts: our ids are unknown there, and the old identifier is still taken.
    row.provider_state.elevenlabs = { voice_id: null, sip_identifier: old };
    takenSipIds.add(old);
    try {
      const { updateVoiceAgent } = await import('../lib/services/voice-agents');
      const synced = await updateVoiceAgent(ctx, agent.id, { name: 'Reception', mode: 'elevenlabs', team_id: team, mcp_profile_id: mcpProfile }, ORIGIN);
      assert.equal(synced.elevenlabs!.ready, true);
      const now = tables.voice_agents.find((v) => v.id === agent.id)!.provider_state.elevenlabs.sip_identifier;
      assert.notEqual(now, old);
      assert.match(now, /^cc[0-9a-f]{10}$/);
    } finally {
      takenSipIds.clear();
    }
  });

  test('a Voice Front that failed to sync is not "ready", keeps its old key, and calls fall back to turn-based', async () => {
    const stored = new Map<string, unknown>();
    setAudioCacheForTests({ get: async (k) => (stored.get(k) as any) ?? null, put: async (k, v) => void stored.set(k, v) });
    const conn = await connect();
    elMcpDenied = true;
    try {
      const keysBefore = tables.mcp_api_keys.length;
      const agent = await voiceFront();
      assert.equal(agent.elevenlabs!.ready, false);
      assert.match(agent.elevenlabs!.error!, /does not have access to MCP servers/);
      const row = tables.voice_agents.find((v) => v.id === agent.id)!;
      assert.equal(row.provider_state.elevenlabs.secret_id, 'sec_1', 'ids created before the failure are kept for the next attempt');
      const minted = tables.mcp_api_keys.slice(keysBefore);
      assert.ok(minted.length === 1 && minted[0].revoked_at, 'the key minted for the failed sync is revoked');

      await configureNumber(ctx, tables.phone_numbers[0].id, { voice_agent_id: agent.id });
      const res = await hook(conn.id, 'incoming', { CallSid: 'CAfb', From: '+5215500001111', To: '+15550001111' });
      const room = tables.rooms.at(-1)!;
      assert.equal(room.mode, 'turn_based');
      assert.match(res.text, /<Gather[^>]*input="speech"/, 'the caller hears the platform voice, not silence');
      assert.ok(tables.room_notes.some((n) => n.room_id === room.id && /not ready[\s\S]*turn-based/.test(n.text)));

      // The owner enables MCP servers (accepting ElevenLabs' terms): the setting flips and the agent syncs.
      const { enableElevenLabsMcp } = await import('../lib/services/voice-agents');
      const enabled = await enableElevenLabsMcp(ctx, ORIGIN);
      assert.ok(elCalls.some((c) => c.method === 'PATCH' && c.path === '/v1/convai/settings' && c.body.can_use_mcp_servers === true));
      assert.equal(enabled.voice_agents[0].elevenlabs!.ready, true);
      assert.equal(enabled.voice_agents[0].elevenlabs!.error, null);
      assert.equal(elCalls.filter((c) => c.path === '/v1/convai/secrets' && c.method === 'POST').length, 1, 'the secret from the failed attempt is reused');
    } finally {
      elMcpDenied = false;
    }
  });

  test('memory per contact: a new call starts with earlier calls and WhatsApp with the same number', async () => {
    const conn = await connect();
    const agent = await voiceFront();
    await configureNumber(ctx, tables.phone_numbers[0].id, { voice_agent_id: agent.id });
    const caller = '+529981112233';
    // An earlier call with a summary and a flag, one without summary (transcript lines kept), another number's call.
    tables.rooms.push(
      { id: 'room-old-1', tenant_id: TENANT, kind: 'phone_in', status: 'ended', voice_agent_id: agent.id, customer_number: caller, summary: 'Asked about the 2-bedroom package; wants a quote by Friday.', end_reason: 'caller hung up', started_at: '2026-10-10T15:00:00.000Z', ended_at: '2026-10-10T15:04:00.000Z', created_at: '2026-10-10T15:00:00.000Z' },
      { id: 'room-old-2', tenant_id: TENANT, kind: 'phone_out', status: 'ended', voice_agent_id: agent.id, customer_number: caller, purpose: 'Send the quote', summary: null, started_at: '2026-10-12T15:00:00.000Z', ended_at: '2026-10-12T15:02:00.000Z', created_at: '2026-10-12T15:00:00.000Z' },
      { id: 'room-other', tenant_id: TENANT, kind: 'phone_in', status: 'ended', customer_number: '+15550009999', summary: 'Someone else entirely.', created_at: '2026-10-13T15:00:00.000Z' },
    );
    tables.room_notes.push({ id: crypto.randomUUID(), room_id: 'room-old-1', tenant_id: TENANT, level: 'alert', text: 'Mentioned cancelling if the price goes up.', author: 'Listener', created_at: '2026-10-10T15:03:00.000Z' });
    tables.utterances.push(
      { id: crypto.randomUUID(), room_id: 'room-old-2', tenant_id: TENANT, seq: 1, speaker_role: 'agent', text: 'Le llamo con la cotización.', source: 'agent', created_at: '2026-10-12T15:00:10.000Z' },
      { id: crypto.randomUUID(), room_id: 'room-old-2', tenant_id: TENANT, seq: 2, speaker_role: 'customer', text: 'Mándela por WhatsApp, por favor.', source: 'twilio_rt', created_at: '2026-10-12T15:00:20.000Z' },
    );
    // WhatsApp writes Mexican mobiles as 521…; the call comes from +52….
    tables.inbound_threads.push({ id: 'thread-wa', tenant_id: TENANT, channel: 'whatsapp', conversation_key: 'wa:1', contact: { id: '5219981112233', name: 'Juan Pérez' }, session_id: null, last_event_at: '2026-10-13T10:00:00.000Z', created_at: '2026-10-13T10:00:00.000Z' });

    await hook(conn.id, 'incoming', { CallSid: 'CAmem', From: caller, To: '+15550001111' });
    const room = tables.rooms.find((r) => r.customer_number === caller && !r.id.startsWith('room-old'))!;

    // The team behind the call has it in its instructions (turn-based turns and ask_team use it).
    const session = tables.agent_sessions.find((s) => s.id === room.session_id)!;
    assert.match(session.instructions, /name on file: Juan Pérez/);
    assert.match(session.instructions, /2-bedroom package/);
    assert.match(session.instructions, /Flag: Mentioned cancelling/);
    assert.match(session.instructions, /Them: Mándela por WhatsApp/);
    assert.match(session.instructions, /whatsapp conversation/);
    assert.match(session.instructions, /not instructions/);
    assert.doesNotMatch(session.instructions, /Someone else entirely/);

    // The voice front gets it from contextcontrol_room_context; the current call is not in its own history.
    const tool: any = await executePlatformTool('contextcontrol_room_context', { room_id: room.id }, { tenantId: TENANT, userId: 'key_voice', authMode: 'api_key', apiKeyId: 'k', scopes: ['mcp:rooms:read'], toolsWhitelist: [] } as any);
    const text = JSON.stringify(tool);
    assert.match(text, /2-bedroom package/);
    assert.match(text, /Send the quote/);

    // The call page lists the earlier contact, newest first.
    const detail: any = await getRoomDetail(ctx, room.id);
    assert.deepEqual(detail.contact.previous_calls.map((c: any) => c.room_id), ['room-old-2', 'room-old-1']);
    assert.equal(detail.contact.name, 'Juan Pérez');
    assert.equal(detail.contact.threads.length, 1);

    // A first-time caller gets no history section.
    await hook(conn.id, 'incoming', { CallSid: 'CAnew', From: '+14155550123', To: '+15550001111' });
    const fresh = tables.rooms.find((r) => r.customer_number === '+14155550123')!;
    assert.ok(!(tables.agent_sessions.find((s) => s.id === fresh.session_id)!.instructions ?? '').includes('Earlier contact'));
  });

  test('Twilio signatures: equivalent URL forms are accepted, a wrong token never is', async () => {
    const conn = await connect();
    const send = (signedUrl: string, token = TOKEN) => {
      const url = `${ORIGIN}/api/voice/twilio/${conn.id}/conference?room=r1&poll=p1&n=1`;
      const params = { CallSid: 'CAsig', StatusCallbackEvent: 'conference-start' };
      return TWILIO_HOOK(
        new NextRequest(url, { method: 'POST', body: new URLSearchParams(params).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': twilioSign(signedUrl, params, token) } }),
        { params: Promise.resolve({ connectionId: conn.id, action: 'conference' }) }
      );
    };
    const url = `${ORIGIN}/api/voice/twilio/${conn.id}/conference?room=r1&poll=p1&n=1`;
    assert.notEqual((await send(url)).status, 403);
    assert.notEqual((await send(url.replace(/&/g, '&amp;'))).status, 403, 'a <Redirect> URL signed as written in the TwiML');
    assert.equal((await send(url, 'wrong-token')).status, 403);
    assert.equal((await send(`${ORIGIN}/api/voice/twilio/${conn.id}/conference?room=other`)).status, 403, 'a signature for another URL');
  });

  test('the sweeper closes calls that never connected and fires silence triggers', async () => {
    const conn = await connect();
    const agent = await voiceFront({ triggers: [{ type: 'silence', role: 'customer', seconds: 60 }] });
    await configureNumber(ctx, tables.phone_numbers[0].id, { voice_agent_id: agent.id });
    await hook(conn.id, 'incoming', { CallSid: 'CAs', From: '+5215533334444', To: '+15550001111' });
    await hook(conn.id, 'incoming', { CallSid: 'CAs2', From: '+5215533335555', To: '+15550001111' });
    const [stale, live] = tables.rooms;
    stale.created_at = new Date(Date.now() - 10 * 60_000).toISOString();
    Object.assign(live, { status: 'live', started_at: new Date(Date.now() - 2 * 60_000).toISOString() });
    const out = await sweepRooms();
    assert.equal(out.closed, 1);
    assert.equal(stale.status, 'failed');
    assert.ok(tables.room_notes.length === 0, 'without a listener team, silence alone does not post a note');
    assert.equal(out.fired, 1);
  });
});
