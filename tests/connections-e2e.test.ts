import assert from 'assert';
import crypto from 'crypto';
import { test, describe, before, after } from 'node:test';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { fakePostgrest, resetTables, tables } from './helpers/fake-postgrest';
import {
  completeGoogleConnect, connectorToolsFor, disconnectGoogle, googleAccessToken, listConnections, runConnectorTool, startGoogleConnect,
} from '../lib/services/connections';
import { setRemoteMcpFetchForTests } from '../lib/connectors/remote-mcp';
import { envelopeEncryptSecret } from '../lib/secrets/envelope-encryption';
import { registerFunctionTools, registerConnectorTools } from '../lib/mcp/platform-mcp-server';
import { createTeam, createTeamSession } from '../lib/services/teams';
import { runSessionTurn } from '../lib/agent/session-runner';
import { GET as callback } from '../app/api/oauth/callback/route';
import { NextRequest } from 'next/server';
import type { LLMGenerateResult } from '../lib/agent/providers/llm-adapter';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const user = { tenantId: TENANT, userId: crypto.randomUUID(), authMode: 'session' as const, scopes: ['*'] };
const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.modify';
const CAL_SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly';
const idToken = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`;

/** Fake Google: token endpoint, revoke, Calendar REST, Gemini grounding. */
const google = {
  tokenCalls: [] as URLSearchParams[],
  revoked: [] as string[],
  refreshFails: false,
  accessCounter: 0,
  remoteCalls: [] as Array<{ auth: string | null; tool: string; args: unknown }>,
  /** Simulates Google listing tools but refusing calls until Developer Preview enrollment. */
  gmailRefusesCalls: false,
};

async function fakeGoogle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token') {
    const body = new URLSearchParams(String(init?.body));
    google.tokenCalls.push(body);
    if (body.get('grant_type') === 'refresh_token' && google.refreshFails) {
      return Response.json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, { status: 400 });
    }
    return Response.json({
      access_token: `access-${++google.accessCounter}`,
      refresh_token: body.get('grant_type') === 'authorization_code' ? 'refresh-1' : undefined,
      expires_in: 3600,
      scope: `openid https://www.googleapis.com/auth/userinfo.email ${GMAIL_SCOPES} ${CAL_SCOPES}`,
      id_token: idToken({ email: 'ops@acme.mx', hd: 'acme.mx' }),
    });
  }
  if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/revoke') {
    google.revoked.push(url.searchParams.get('token') || '');
    return new Response(null, { status: 200 });
  }
  if (url.hostname === 'www.googleapis.com' && url.pathname.startsWith('/calendar/v3/calendars/primary/events')) {
    return Response.json({ items: [{ id: 'e1', summary: 'Standup', start: { dateTime: '2026-10-07T09:00:00-06:00' }, end: { dateTime: '2026-10-07T09:15:00-06:00' }, attendees: [{ email: 'a@acme.mx' }] }] });
  }
  if (url.hostname === 'generativelanguage.googleapis.com') {
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.tools, [{ google_search: {} }]);
    return Response.json({
      candidates: [{
        content: { parts: [{ text: 'The rate is about 18.2 MXN per USD.' }] },
        groundingMetadata: { groundingChunks: [{ web: { uri: 'https://banxico.org.mx', title: 'Banxico' } }, { web: { uri: 'https://banxico.org.mx', title: 'dup' } }] },
      }],
    });
  }
  return fakePostgrest(input, init);
}

/** In-process stand-in for Google's official Gmail MCP server; Calendar's refuses (not in preview). */
async function remoteMcpFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input as any, init);
  const url = new URL(req.url);
  if (url.hostname === 'calendarmcp.googleapis.com') return new Response('Forbidden: not enrolled in the preview', { status: 403 });
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer access-')) return new Response('Unauthorized', { status: 401 });
  const server = new McpServer({ name: 'fake-gmail', version: '1.0.0' });
  server.registerTool(
    'search_threads',
    { description: 'Search Gmail threads', inputSchema: { query: z.string() }, annotations: { readOnlyHint: true } },
    async (args) => {
      google.remoteCalls.push({ auth, tool: 'search_threads', args });
      return { content: [{ type: 'text', text: 'found 1' }], structuredContent: { threads: [{ id: 't1', subject: 'Welcome' }] } };
    }
  );
  server.registerTool('list_labels', { description: 'List labels', annotations: { readOnlyHint: true } }, async () =>
    google.gmailRefusesCalls
      ? { isError: true, content: [{ type: 'text', text: 'Access requires the Google Cloud project to be enrolled in the Google Workspace Developer Preview Program.' }] }
      : { content: [{ type: 'text', text: 'INBOX, SENT' }] }
  );
  server.registerTool('create_draft', { description: 'Create a draft', inputSchema: { to: z.string() } }, async () => ({ content: [{ type: 'text', text: 'draft d1' }] }));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

describe('MCP Hub connections (fake Google + in-process remote MCP server)', () => {
  const realFetch = globalThis.fetch;

  before(async () => {
    globalThis.fetch = fakeGoogle as typeof fetch;
    setRemoteMcpFetchForTests(remoteMcpFetch as typeof fetch);
    resetTables(['oauth_states', 'connections', 'connector_states', 'mcp_profiles', 'encrypted_secrets', 'agent_teams', 'team_workers', 'agent_sessions', 'checkpoints', 'run_events', 'context_profiles', 'custom_functions', 'function_secrets', 'function_invocations']);
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  });
  after(() => {
    globalThis.fetch = realFetch;
    setRemoteMcpFetchForTests(undefined);
  });

  let state: string;

  test('without a configured OAuth client the flow fails clearly (no fake tokens)', async () => {
    await assert.rejects(startGoogleConnect(user, 'https://app.test'), /Google is not configured/);
    const view = await listConnections(user);
    assert.equal(view.google.configured, false);
    assert.equal(view.google.connected, false);
    assert.equal(view.web_search.available, false);
  });

  test('connect: PKCE consent URL, code exchange, encrypted tokens, official vs direct detection', async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid.apps.googleusercontent.com';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'secret';
    const { url } = await startGoogleConnect(user, 'https://app.test');
    const u = new URL(url);
    assert.equal(u.hostname, 'accounts.google.com');
    assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(u.searchParams.get('redirect_uri'), 'https://app.test/api/oauth/callback');
    assert.match(u.searchParams.get('scope')!, /gmail\.readonly.*calendar\.events/);
    state = u.searchParams.get('state')!;

    const { email } = await completeGoogleConnect('code-1', state);
    assert.equal(email, 'ops@acme.mx');
    assert.equal(google.tokenCalls[0].get('code_verifier')!.length > 40, true, 'PKCE verifier sent');
    const conn = tables.connections[0];
    assert.equal(conn.account_domain, 'acme.mx');
    assert.ok(!JSON.stringify(conn.encrypted_tokens).includes('access-1'), 'tokens are encrypted at rest');

    const view = await listConnections(user);
    const gmail = view.google.connectors.find((c) => c.id === 'gmail')!;
    const calendar = view.google.connectors.find((c) => c.id === 'calendar')!;
    assert.equal(gmail.mode, 'official');
    assert.deepEqual(gmail.tools.map((t) => t.name).sort(), ['gmail__create_draft', 'gmail__list_labels', 'gmail__search_threads']);
    assert.equal(calendar.mode, 'direct', 'refused official server falls back to the direct API');
    assert.deepEqual(calendar.tools.map((t) => t.name).sort(), ['calendar_create_event', 'calendar_list_events']);

    await assert.rejects(completeGoogleConnect('code-1', state), /already used/);
  });

  test('a server that lists tools but refuses calls (preview not enrolled) falls back to direct', async () => {
    const { probeConnectors } = await import('../lib/services/connections');
    google.gmailRefusesCalls = true;
    try {
      await probeConnectors(TENANT);
      const gmail = (await listConnections(user)).google.connectors.find((c) => c.id === 'gmail')!;
      assert.equal(gmail.mode, 'direct');
      assert.match(gmail.detail!, /Developer Preview/);
      assert.deepEqual(gmail.tools.map((t) => t.name).sort(), ['gmail_create_draft', 'gmail_read', 'gmail_search']);
    } finally {
      google.gmailRefusesCalls = false;
      await probeConnectors(TENANT);
    }
  });

  test('tools run through the official MCP server (bearer token) and the direct API', async () => {
    const tools = await connectorToolsFor(TENANT, null, true);
    const search = tools.find((t) => t.name === 'gmail__search_threads')!;
    const out: any = await runConnectorTool(user, search, { query: 'from:google' });
    assert.deepEqual(out.threads, [{ id: 't1', subject: 'Welcome' }]);
    assert.match(google.remoteCalls[0].auth!, /^Bearer access-/);

    const events: any = await runConnectorTool(user, tools.find((t) => t.name === 'calendar_list_events')!, {});
    assert.equal(events.events[0].title, 'Standup');
  });

  test('expired access tokens are refreshed; a revoked grant marks the connection for reconnect', async () => {
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 2 * 3600_000;
      const before = google.tokenCalls.length;
      const { token } = await googleAccessToken(TENANT);
      assert.equal(google.tokenCalls[before].get('grant_type'), 'refresh_token');
      assert.equal(token, `access-${google.accessCounter}`);

      Date.now = () => realNow() + 6 * 3600_000;
      google.refreshFails = true;
      await assert.rejects(googleAccessToken(TENANT), /Reconnect Google/);
      assert.equal(tables.connections[0].status, 'error');
      const view = await listConnections(user);
      assert.equal(view.google.status, 'error');
    } finally {
      Date.now = realNow;
      google.refreshFails = false;
    }
    // Reconnecting restores it.
    const { url } = await startGoogleConnect(user, 'https://app.test');
    await completeGoogleConnect('code-2', new URL(url).searchParams.get('state')!);
    assert.equal(tables.connections.length, 1);
    assert.equal(tables.connections[0].status, 'active');
  });

  test('web_search uses the org LLM key (Gemini grounding) and returns sources', async () => {
    tables.encrypted_secrets.push({ tenant_id: TENANT, provider: 'gemini', updated_at: '2026-10-01', encrypted_payload: await envelopeEncryptSecret('gem-key', TENANT, 'gemini') });
    const view = await listConnections(user);
    assert.equal(view.web_search.provider, 'gemini');
    const tool = (await connectorToolsFor(TENANT, null, true)).find((t) => t.name === 'web_search')!;
    const res: any = await runConnectorTool(user, tool, { query: 'MXN USD rate today' });
    assert.match(res.answer, /18\.2/);
    assert.deepEqual(res.sources, [{ title: 'Banxico', url: 'https://banxico.org.mx' }]);
  });

  test('profiles select app tools: agent runs and profile-bound MCP keys only get the selection', async () => {
    const profileId = crypto.randomUUID();
    tables.mcp_profiles.push({ id: profileId, org_id: TENANT, name: 'Assistant', description: null, token_budget: 1000, settings: { connector_tools: ['gmail__search_threads', 'web_search'] }, is_active: true, archived_at: null, created_at: '2026-10-01', updated_at: '2026-10-01' });

    const ctx = { tenantId: TENANT, userId: 'key_1', authMode: 'api_key' as const, apiKeyId: 'k1' };
    const unbound = await registerConnectorTools(new McpServer({ name: 't', version: '1' }), ctx, null);
    assert.ok(unbound.includes('calendar_list_events'));
    const bound = await registerConnectorTools(new McpServer({ name: 't', version: '1' }), ctx, profileId);
    assert.deepEqual(bound.sort(), ['gmail__search_threads', 'web_search']);
    assert.deepEqual(await registerFunctionTools(new McpServer({ name: 't', version: '1' }), ctx, profileId), []);

    const team = await createTeam(user, { name: 'Inbox team', llm: { provider: 'gemini' }, supervisor: { tools: [], mcp_profile_id: profileId } });
    const session = await createTeamSession(user, team.id);
    const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
    let offered: string[] = [];
    const script: Array<() => Partial<LLMGenerateResult>> = [
      () => ({ finishReason: 'tool_calls', toolCalls: [{ id: 'c1', name: 'gmail__search_threads', arguments: { query: 'newer_than:1d' } }] }),
      () => ({ text: 'You have 1 new thread: Welcome.' }),
    ];
    const generate = async (o: any) => {
      offered = (o.tools || []).map((t: any) => t.name);
      return { text: '', usage, finishReason: 'stop', ...script.shift()!() } as LLMGenerateResult;
    };
    const before = google.remoteCalls.length;
    const turn = await runSessionTurn(user, session.id, 'Any new mail?', { generate, getSecret: async () => 'k' });
    assert.deepEqual(offered.filter((n) => !n.startsWith('contextcontrol_')).sort(), ['gmail__search_threads', 'web_search']);
    assert.equal(google.remoteCalls.length, before + 1);
    assert.equal(turn.message, 'You have 1 new thread: Welcome.');
  });

  test('callback page escapes errors and only posts to our own origin', async () => {
    const res = await callback(new NextRequest('https://app.test/api/oauth/callback?error=%3Cscript%3Ealert(1)%3C/script%3E'));
    const html = await res.text();
    assert.equal(res.status, 400);
    assert.ok(!html.includes('<script>alert(1)'), 'error text is escaped');
    assert.ok(html.includes('"https://app.test"'), 'postMessage targets our origin');
    assert.ok(!html.includes("'*'"));
  });

  test('disconnect revokes at Google and removes tokens and tools', async () => {
    await disconnectGoogle(user);
    assert.ok(google.revoked.includes('refresh-1'));
    assert.equal(tables.connections.length, 0);
    assert.equal(tables.connector_states.length, 0);
    const tools = await connectorToolsFor(TENANT, null, true);
    assert.deepEqual(tools.map((t) => t.name), ['web_search']);
    const view = await listConnections(user);
    assert.equal(view.google.connected, false);
  });
});

describe('public origin behind the CDN', () => {
  test('uses forwarded host headers instead of the internal server address', async () => {
    const { publicOrigin } = await import('../lib/http/public-origin');
    const req = new NextRequest('https://localhost:3000/api/v1/connections', { headers: { 'x-forwarded-host': 'www.contextcontrol.com.mx', 'x-forwarded-proto': 'https' } });
    assert.equal(publicOrigin(req), 'https://www.contextcontrol.com.mx');
    assert.equal(publicOrigin(new NextRequest('https://app.test/x')), 'https://app.test');
    assert.equal(publicOrigin(new NextRequest('https://localhost:3000/x', { headers: { host: 'evil.com/<x>' } })), 'https://localhost:3000');
  });
});

describe('LLM adapter: a hung model attempt does not stall the run', () => {
  test('a Gemini attempt that never answers times out and the next model is used', async () => {
    const adapter = await import('../lib/agent/providers/llm-adapter');
    const realFetch = globalThis.fetch;
    const realTimeout = AbortSignal.timeout;
    const tried: string[] = [];
    // Shrink the per-attempt timeout for the test.
    (AbortSignal as any).timeout = () => realTimeout.call(AbortSignal, 50);
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      const url = String(input);
      tried.push(url.match(/models\/([^:]+)/)?.[1] || url);
      if (tried.length === 1) {
        // Hang until aborted.
        return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)));
      }
      return Response.json({ candidates: [{ content: { parts: [{ text: 'ok from fallback' }] } }], usageMetadata: {} });
    }) as typeof fetch;
    // AbortSignal.timeout timers do not keep Node alive; hold the loop open for the test.
    const keepAlive = setInterval(() => undefined, 20);
    try {
      const res = await adapter.generateLLMResponse({ provider: 'gemini', apiKey: 'k', messages: [{ role: 'user', content: 'hi' }] });
      assert.equal(res.text, 'ok from fallback');
      assert.equal(tried.length, 2);
      assert.notEqual(tried[0], tried[1]);
    } finally {
      clearInterval(keepAlive);
      globalThis.fetch = realFetch;
      (AbortSignal as any).timeout = realTimeout;
    }
  });
});
