import assert from 'assert';
import crypto from 'crypto';
import { test, describe, before, after, beforeEach } from 'node:test';
import { NextRequest } from 'next/server';
import { fakePostgrest, resetTables, tables } from './helpers/fake-postgrest';
import { createTeam } from '../lib/services/teams';
import {
  createEndpoint, dryRun, getEndpoint, isSafeReplyUrl, listEvents, receiveWebhook, replayEvent, setEndpointSecret,
  setInboundDispatcherForTests, processInboundEvents, sweepInbound, verifyChallenge,
} from '../lib/services/inbound';
import { setDefaultRunnerDepsForTests, setRunDispatcherForTests } from '../lib/services/agent-runs';
import { setLambdaClientForTests } from '../lib/services/functions';
import { setAudioCacheForTests } from '../lib/voice/audio-cache';
import { listConversations, getConversation } from '../lib/services/conversations';
import { ROUTER_INPUT_SCHEMA } from '../lib/inbound/router-template';
import { GET as LIST_ENDPOINTS } from '../app/api/v1/inbound/endpoints/route';
import { POST as HOOK } from '../app/api/hooks/[id]/route';
import type { LLMGenerateResult } from '../lib/agent/providers/llm-adapter';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ctx = { tenantId: TENANT, userId: crypto.randomUUID(), authMode: 'session' as const, scopes: ['*'] };
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
const URL_BASE = 'https://app.test/api/hooks/';

/** What the scripted team "says"; set per test. */
let reply = 'Thanks! The Pro plan is $49/month.';
let modelInputs: string[] = [];
/** Make runs hang (stay 'running') so queued messages can be observed. */
let holdRuns = false;
const heldRuns: string[] = [];

const graph: Array<{ url: string; auth: string | null; body: any }> = [];
const replyPosts: Array<{ url: string; sig: string | null; body: any }> = [];
let graphFails = false;

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === 'graph.facebook.com') {
    graph.push({ url: url.href, auth: new Headers(init?.headers).get('authorization'), body: JSON.parse(String(init?.body)) });
    if (graphFails) return Response.json({ error: { message: 'Re-engagement message', code: 131047 } }, { status: 400 });
    return Response.json({ messages: [{ id: 'wamid.OUT' }] });
  }
  if (url.hostname === 'hooks.example.com') {
    replyPosts.push({ url: url.href, sig: new Headers(init?.headers).get('x-signature'), body: JSON.parse(String(init?.body)) });
    return new Response('ok');
  }
  return fakePostgrest(input, init);
}

const hmac = (secret: string, data: string, algo: 'sha256' | 'sha1' = 'sha256', enc: 'hex' | 'base64' = 'hex') => crypto.createHmac(algo, secret).update(data).digest(enc);

function whatsapp(messages: Array<{ id: string; from: string; text: string; name?: string }>) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'WABA', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: '15550001111', phone_number_id: 'PNID' },
      contacts: messages.map((m) => ({ profile: { name: m.name ?? 'Ana' }, wa_id: m.from })),
      messages: messages.map((m) => ({ from: m.from, id: m.id, timestamp: '1760000000', type: 'text', text: { body: m.text } })),
    } }] }],
  });
}

describe('Inbound Gateway: verify, store, route, reply', () => {
  const realFetch = globalThis.fetch;
  let support: string;
  let sales: string;

  before(async () => {
    globalThis.fetch = fakeFetch as typeof fetch;
    const { handler } = await import('../lib/agent/worker-entry');
    setDefaultRunnerDepsForTests({
      getSecret: async () => 'k',
      generate: async (o: any) => {
        modelInputs.push(o.messages[o.messages.length - 1]?.content ?? '');
        return { text: reply, usage, finishReason: 'stop' } as LLMGenerateResult;
      },
    });
    setRunDispatcherForTests(async (id) => {
      if (holdRuns) {
        heldRuns.push(id);
        return true;
      }
      await handler({ run_id: id }, { awsRequestId: crypto.randomUUID() });
      return true;
    });
    setInboundDispatcherForTests(async (ids) => {
      await handler({ inbound_event_ids: ids }, { awsRequestId: 'w' });
      return true;
    });
  });
  after(() => {
    globalThis.fetch = realFetch;
    setRunDispatcherForTests(null);
    setDefaultRunnerDepsForTests(null);
    setInboundDispatcherForTests(null);
    setLambdaClientForTests(null);
    setAudioCacheForTests(null);
  });
  beforeEach(async () => {
    reply = 'Thanks! The Pro plan is $49/month.';
    modelInputs = [];
    holdRuns = false;
    heldRuns.length = 0;
    graph.length = 0;
    replyPosts.length = 0;
    graphFails = false;
    resetTables(['inbound_endpoints', 'inbound_events', 'inbound_threads', 'agent_runs', 'agent_sessions', 'agent_teams', 'team_workers', 'checkpoints', 'run_events', 'encrypted_secrets', 'custom_functions', 'function_invocations', 'function_secrets', 'supervisor_tasks', 'mcp_profiles', 'context_profiles']);
    tables.encrypted_secrets.push({ tenant_id: TENANT, provider: 'gemini', updated_at: '2026-01-01', encrypted_payload: {} });
    support = (await createTeam(ctx, { name: 'Support', llm: { provider: 'gemini' }, supervisor: { tools: [] } })).id;
    sales = (await createTeam(ctx, { name: 'Sales', llm: { provider: 'gemini' }, supervisor: { tools: [] } })).id;
  });

  async function metaEndpoint(extra: Record<string, unknown> = {}) {
    const ep = await createEndpoint(ctx, { name: 'WhatsApp', preset: 'meta', default_team_id: support, ...extra });
    await setEndpointSecret(ctx, ep.id, 'app_secret', 'app-secret');
    await setEndpointSecret(ctx, ep.id, 'verify_token', 'verify-me');
    await setEndpointSecret(ctx, ep.id, 'access_token', 'EAAG-token');
    return ep;
  }
  const postMeta = (id: string, body: string, secret = 'app-secret') =>
    receiveWebhook(id, body, new Headers({ 'x-hub-signature-256': `sha256=${hmac(secret, body)}`, 'content-type': 'application/json' }), URL_BASE + id);

  test('Meta: challenge, signature check, idempotency, thread + team reply on WhatsApp', async () => {
    const ep = await metaEndpoint();
    assert.equal((await getEndpoint(ctx, ep.id)).secrets_set.sort().join(), 'access_token,app_secret,verify_token');
    assert.ok(!JSON.stringify(await getEndpoint(ctx, ep.id)).includes('app-secret'), 'secret values are never returned');

    const ok = await verifyChallenge(ep.id, new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '12345' }));
    assert.deepEqual(ok, { status: 200, body: '12345' });
    assert.equal((await verifyChallenge(ep.id, new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '1' }))).status, 403);

    const body = whatsapp([{ id: 'wamid.1', from: '5215512345678', text: 'Hola, ¿precio del plan Pro?' }]);
    assert.equal((await postMeta(ep.id, body, 'wrong-secret')).status, 401);
    assert.equal((await postMeta(ep.id, body.replace('Pro', 'Max'))).status, 200);
    const first = await postMeta(ep.id, body);
    assert.equal(first.status, 200);
    const dup = await postMeta(ep.id, body);
    assert.deepEqual(dup.body, { received: 1, accepted: 0, duplicates: 1 });

    const event = tables.inbound_events.find((e) => e.provider_event_id === 'wamid.1')!;
    assert.equal(event.status, 'routed');
    const thread = tables.inbound_threads.find((t) => t.conversation_key === 'whatsapp:PNID:5215512345678')!;
    assert.equal(thread.team_id, support);
    const run = tables.agent_runs.find((r) => r.id === event.run_id)!;
    assert.equal(run.origin, 'inbound');
    assert.equal(run.status, 'done');
    assert.match(run.input_message, /New WhatsApp message from Ana \(5215512345678\):\nHola/);

    const sent = graph.find((g) => g.url.endsWith('/PNID/messages'))!;
    assert.equal(sent.auth, 'Bearer EAAG-token');
    assert.deepEqual(sent.body, { messaging_product: 'whatsapp', recipient_type: 'individual', to: '5215512345678', type: 'text', text: { preview_url: false, body: reply } });
    assert.equal(tables.inbound_events.find((e) => e.id === event.id)!.reply_status.sent, true);

    // Same contact later: same thread and instance.
    await postMeta(ep.id, whatsapp([{ id: 'wamid.2', from: '5215512345678', text: 'Gracias' }]));
    assert.equal(tables.inbound_threads.length, 1);
    const runs = tables.agent_runs.filter((r) => r.inbound_thread_id === thread.id);
    assert.equal(new Set(runs.map((r) => r.session_id)).size, 1);

    // Status receipts are recorded and ignored.
    const statuses = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: 'PNID' }, statuses: [{ id: 'wamid.OUT', status: 'delivered', recipient_id: '5215512345678' }] } }] }] });
    await postMeta(ep.id, statuses);
    assert.equal(tables.inbound_events.find((e) => e.provider_event_id.startsWith('status:'))!.status, 'ignored');
  });

  test('rules route by content; first match wins; ignore rules; no team → ignored', async () => {
    const ep = await metaEndpoint({
      rules: [
        { name: 'test pings', when: [{ path: 'event.text', op: 'equals', value: 'ping' }], action: 'ignore', team_id: null },
        { name: 'sales', when: [{ path: 'event.text', op: 'regex', value: 'precio|price' }], team_id: sales, message_template: 'Lead {{event.sender.name}}: {{event.text}}' },
      ],
    });
    await postMeta(ep.id, whatsapp([{ id: 'a', from: '1', text: 'Price please' }, { id: 'b', from: '2', text: 'My order is late' }, { id: 'c', from: '3', text: 'ping' }]));
    const t1 = tables.inbound_threads.find((t) => t.conversation_key.endsWith(':1'))!;
    const t2 = tables.inbound_threads.find((t) => t.conversation_key.endsWith(':2'))!;
    assert.equal(t1.team_id, sales);
    assert.equal(t2.team_id, support, 'falls back to the default team');
    assert.equal(tables.inbound_events.find((e) => e.provider_event_id === 'c')!.status, 'ignored');
    assert.ok(modelInputs.some((m) => m === 'Lead Ana: Price please'));

    const noDefault = await createEndpoint(ctx, { name: 'Bare', preset: 'generic', verify_settings: { unsigned: true } });
    await receiveWebhook(noDefault.id, JSON.stringify({ id: 'x', text: 'hi' }), new Headers(), URL_BASE + noDefault.id);
    const ev = tables.inbound_events.find((e) => e.endpoint_id === noDefault.id)!;
    assert.equal(ev.status, 'ignored');
    assert.match(ev.error, /no default team/);
  });

  test('a router function from AI Function Studio decides; bad output or errors fail the event', async () => {
    let output: unknown = { action: 'route', team_id: sales, conversation_key: 'vip:ana', message: 'VIP: Ana wants a quote', reason: 'vip' };
    let crash = false;
    setLambdaClientForTests({
      async send(cmd: any) {
        const payload = JSON.parse(new TextDecoder().decode(cmd.input.Payload));
        assert.equal(payload.input.event.channel, 'whatsapp');
        assert.equal(payload.input.endpoint.preset, 'meta');
        if (crash) return { FunctionError: 'Unhandled', Payload: new TextEncoder().encode(JSON.stringify({ errorMessage: 'boom' })) };
        return { Payload: new TextEncoder().encode(JSON.stringify({ status: 'ok', output, logs: '', duration_ms: 3 })) };
      },
    });
    const fnId = crypto.randomUUID();
    tables.custom_functions.push({ id: fnId, tenant_id: TENANT, name: 'Router', function_slug: 'router', language: 'python', code: '', input_schema: ROUTER_INPUT_SCHEMA, status: 'deployed', lambda_name: 'ccfn-router', timeout_seconds: 10, memory_mb: 256, archived_at: null });
    const ep = await metaEndpoint({ router_function_id: fnId });

    await postMeta(ep.id, whatsapp([{ id: 'r1', from: '9', text: 'quote' }]));
    const thread = tables.inbound_threads.find((t) => t.conversation_key === 'vip:ana')!;
    assert.equal(thread.team_id, sales);
    assert.equal(modelInputs.at(-1), 'VIP: Ana wants a quote');
    assert.equal(tables.function_invocations.at(-1)!.source, 'inbound');

    output = { action: 'route', team_id: 'not-a-uuid' };
    await postMeta(ep.id, whatsapp([{ id: 'r2', from: '9', text: 'again' }]));
    const bad = tables.inbound_events.find((e) => e.provider_event_id === 'r2')!;
    assert.equal(bad.status, 'failed');
    assert.match(bad.error, /invalid decision/);

    crash = true;
    await postMeta(ep.id, whatsapp([{ id: 'r3', from: '9', text: 'boom' }]));
    assert.match(tables.inbound_events.find((e) => e.provider_event_id === 'r3')!.error, /Router function error: .*boom/);

    // Fixed function → replay routes the failed event.
    crash = false;
    output = { action: 'ignore', reason: 'spam' };
    assert.equal((await replayEvent(ctx, ep.id, bad.id)).status, 'ignored');

    const dry = await dryRun(ctx, ep.id, whatsapp([{ id: 'd', from: '9', text: 'x' }]));
    assert.equal(dry.events[0].decision.action, 'ignore');
    assert.equal(tables.inbound_events.filter((e) => e.provider_event_id === 'd').length, 0, 'dry runs store nothing');
  });

  test('messages that arrive while the team is answering are queued and answered together', async () => {
    const ep = await metaEndpoint();
    holdRuns = true;
    await postMeta(ep.id, whatsapp([{ id: 'q1', from: '7', text: 'first' }]));
    await postMeta(ep.id, whatsapp([{ id: 'q2', from: '7', text: 'second' }, { id: 'q3', from: '7', text: 'third' }]));
    assert.equal(tables.inbound_events.find((e) => e.provider_event_id === 'q1')!.status, 'routed');
    assert.deepEqual(['q2', 'q3'].map((id) => tables.inbound_events.find((e) => e.provider_event_id === id)!.status), ['queued', 'queued']);
    assert.equal(tables.inbound_threads[0].pending_count, 2);

    // The held run finishes → reply → queued messages go in one follow-up run.
    holdRuns = false;
    const { handler } = await import('../lib/agent/worker-entry');
    await handler({ run_id: heldRuns[0] }, { awsRequestId: 'late' });
    const followUp = tables.agent_runs.find((r) => /2 new messages arrived/.test(r.input_message))!;
    assert.ok(followUp, 'one follow-up run');
    assert.match(followUp.input_message, /second[\s\S]*third/);
    assert.equal(followUp.status, 'done');
    assert.equal(graph.length, 2, 'one reply per run');
    assert.equal(tables.inbound_threads[0].pending_count, 0);
  });

  test('ElevenLabs post-call: SDK-compatible signature, transcript thread, recording to S3', async () => {
    const stored = new Map<string, unknown>();
    setAudioCacheForTests({ get: async () => null, put: async (k, v) => void stored.set(k, v) });
    const ep = await createEndpoint(ctx, { name: 'Calls', preset: 'elevenlabs', default_team_id: support });
    await setEndpointSecret(ctx, ep.id, 'webhook_secret', 'wsec_123');
    const send = (body: unknown, t = Math.floor(Date.now() / 1000), secret = 'wsec_123') => {
      const raw = JSON.stringify(body);
      return receiveWebhook(ep.id, raw, new Headers({ 'elevenlabs-signature': `t=${t},v0=${hmac(secret, `${t}.${raw}`)}` }), URL_BASE + ep.id);
    };
    const transcript = {
      type: 'post_call_transcription',
      event_timestamp: 1,
      data: { agent_id: 'ag', agent_name: 'Reception', conversation_id: 'conv_9', has_audio: true, transcript: [{ role: 'agent', message: 'Hi!' }, { role: 'user', message: 'Reschedule me' }], metadata: { call_duration_secs: 30, phone_call: { external_number: '+5215500000000' } }, analysis: { transcript_summary: 'Wants to reschedule.' } },
    };
    assert.equal((await send(transcript, Math.floor(Date.now() / 1000) - 3600)).status, 401, 'stale timestamp');
    assert.equal((await send(transcript, undefined, 'wrong')).status, 401);
    assert.equal((await send(transcript)).status, 200);
    const thread = tables.inbound_threads.find((t) => t.conversation_key === 'call:+5215500000000')!;
    assert.equal(thread.channel, 'phone_call');
    const run = tables.agent_runs.find((r) => r.inbound_thread_id === thread.id)!;
    assert.match(run.input_message, /Summary: Wants to reschedule\.[\s\S]*Caller: Reschedule me/);
    assert.equal(tables.inbound_events[0].reply_status.sent, false, 'call results have no reply channel');

    const audio = { type: 'post_call_audio', event_timestamp: 2, data: { agent_id: 'ag', conversation_id: 'conv_9', full_audio: Buffer.from('mp3-bytes').toString('base64') } };
    assert.equal((await send(audio)).status, 200);
    assert.ok(stored.has(`inbound/${TENANT}/elevenlabs_conv_9.mp3`));
    const audioEvent = tables.inbound_events.find((e) => e.provider_event_id === 'audio:conv_9')!;
    assert.equal(audioEvent.body.data.full_audio, '[stored in S3]', 'the base64 audio is not kept in the database');
    assert.deepEqual(tables.inbound_threads.find((t) => t.id === thread.id)!.contact.recordings, [`inbound/${TENANT}/elevenlabs_conv_9.mp3`]);
  });

  test('generic: HMAC with timestamp, signed reply to your URL, SSRF-safe reply URLs', async () => {
    const ep = await createEndpoint(ctx, {
      name: 'Shop', preset: 'generic', default_team_id: support,
      verify_settings: { signature_header: 'X-Shop-Signature', timestamp_header: 'X-Shop-Timestamp' },
      reply: { enabled: true, url: 'https://hooks.example.com/replies' },
    });
    await setEndpointSecret(ctx, ep.id, 'signing_secret', 'shop-secret');
    await setEndpointSecret(ctx, ep.id, 'reply_secret', 'reply-secret');
    const raw = JSON.stringify({ id: 'evt_1', conversation_id: 'order-1001', from: 'ana@example.com', name: 'Ana', text: 'Where is my order?' });
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await receiveWebhook(ep.id, raw, new Headers({ 'x-shop-signature': `sha256=${hmac('shop-secret', `${ts}.${raw}`)}`, 'x-shop-timestamp': ts }), URL_BASE + ep.id);
    assert.equal(res.status, 200);
    assert.equal(replyPosts.length, 1);
    assert.equal(replyPosts[0].body.conversation_key, 'webhook:order-1001');
    assert.equal(replyPosts[0].body.text, reply);
    assert.equal(replyPosts[0].sig, `sha256=${hmac('reply-secret', JSON.stringify(replyPosts[0].body))}`);
    assert.equal((await receiveWebhook(ep.id, raw, new Headers({ 'x-shop-signature': hmac('shop-secret', raw) }), URL_BASE + ep.id)).status, 401, 'timestamp required');

    for (const bad of ['http://hooks.example.com/x', 'https://localhost/x', 'https://10.0.0.5/x', 'https://169.254.169.254/latest', 'https://[::1]/x']) assert.equal(isSafeReplyUrl(bad), false, bad);
    await assert.rejects(createEndpoint(ctx, { name: 'Bad', preset: 'generic', reply: { enabled: true, url: 'https://192.168.1.10/hook' } }), /public https URL/);
    await assert.rejects(createEndpoint(ctx, { name: 'Bad2', preset: 'meta', verify_settings: { unsigned: true } }), /Only generic/);
  });

  test('Twilio signature (URL + sorted params, SHA1 base64) and body limits', async () => {
    const ep = await createEndpoint(ctx, { name: 'SMS', preset: 'twilio', default_team_id: support });
    await setEndpointSecret(ctx, ep.id, 'auth_token', 'tw-token');
    const url = URL_BASE + ep.id;
    const params = { MessageSid: 'SM1', From: '+5215511111111', To: '+15550001111', Body: 'Hello' };
    const raw = new URLSearchParams(params).toString();
    const signed = Object.keys(params).sort().reduce((a, k) => a + k + (params as any)[k], url);
    const good = await receiveWebhook(ep.id, raw, new Headers({ 'x-twilio-signature': hmac('tw-token', signed, 'sha1', 'base64') }), url);
    assert.equal(good.status, 200);
    assert.equal(tables.inbound_threads.find((t) => t.conversation_key === 'sms:+15550001111:+5215511111111')!.channel, 'sms');
    assert.equal((await receiveWebhook(ep.id, raw, new Headers({ 'x-twilio-signature': 'bad' }), url)).status, 401);
    assert.equal((await receiveWebhook(ep.id, 'x'.repeat(1024 * 1024 + 1), new Headers(), url)).status, 413);

    // Route: unknown endpoints and other orgs.
    assert.equal((await receiveWebhook(crypto.randomUUID(), raw, new Headers(), url)).status, 404);
    const hook = await HOOK(new NextRequest(`https://app.test/api/hooks/${ep.id}`, { method: 'POST', body: raw, headers: { 'x-twilio-signature': 'bad' } }), { params: Promise.resolve({ id: ep.id }) });
    assert.equal(hook.status, 401);
  });

  test('isolation, auth, Conversations, failed replies, the sweeper and retention', async () => {
    const ep = await metaEndpoint();
    await assert.rejects(getEndpoint({ tenantId: OTHER }, ep.id), /not found/i);
    await assert.rejects(listEvents({ tenantId: OTHER }, ep.id), /not found/i);
    await assert.rejects(createEndpoint({ ...ctx, tenantId: OTHER }, { name: 'x', preset: 'meta', default_team_id: support }), /not found/i);

    graphFails = true;
    await postMeta(ep.id, whatsapp([{ id: 'f1', from: '55', text: 'late reply' }]));
    const ev = tables.inbound_events.find((e) => e.provider_event_id === 'f1')!;
    assert.equal(ev.reply_status.sent, false);
    assert.match(ev.reply_status.error, /24-hour reply window/);

    const { conversations, counts } = await listConversations(ctx, { kind: 'inbound' });
    assert.equal(counts.inbound, 1);
    assert.equal(conversations[0].channel, 'whatsapp');
    assert.equal(conversations[0].contact?.name, 'Ana');
    const detail = await getConversation(ctx, conversations[0].id);
    assert.equal(detail.inbound![0].text, 'late reply');
    assert.match(detail.inbound![0].reply!.error!, /24-hour/);

    // Sweeper: an event the worker never picked up gets routed; old events are purged.
    tables.inbound_events.push({ id: crypto.randomUUID(), tenant_id: TENANT, endpoint_id: ep.id, provider_event_id: 'stuck', received_at: new Date(Date.now() - 5 * 60_000).toISOString(), updated_at: new Date(Date.now() - 5 * 60_000).toISOString(), status: 'received', normalized: { event_id: 'stuck', type: 'message', channel: 'whatsapp', conversation_key: 'whatsapp:PNID:66', sender: { id: '66' }, text: 'hello?', reply_target: { kind: 'whatsapp', phone_number_id: 'PNID', to: '66' } }, body: {} });
    tables.inbound_events.push({ id: crypto.randomUUID(), tenant_id: TENANT, endpoint_id: ep.id, provider_event_id: 'old', received_at: new Date(Date.now() - 40 * 86_400_000).toISOString(), status: 'routed' });
    const swept = await sweepInbound();
    assert.equal(swept.routed, 1);
    assert.equal(swept.purged, 1);
    assert.equal(tables.inbound_events.find((e) => e.provider_event_id === 'stuck')!.status, 'routed');
    assert.deepEqual(await processInboundEvents([tables.inbound_events.find((e) => e.provider_event_id === 'stuck')!.id]), [], 'already processed events are not claimed twice');

    const prev = { a: process.env.DEMO_MODE, b: process.env.NEXT_PUBLIC_DEMO_MODE };
    process.env.DEMO_MODE = 'false';
    process.env.NEXT_PUBLIC_DEMO_MODE = 'false';
    try {
      assert.equal((await LIST_ENDPOINTS(new NextRequest('https://app.test/api/v1/inbound/endpoints'))).status, 401);
    } finally {
      process.env.DEMO_MODE = prev.a;
      process.env.NEXT_PUBLIC_DEMO_MODE = prev.b;
    }
  });
});
