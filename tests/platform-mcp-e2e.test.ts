import assert from 'assert';
import crypto from 'crypto';
import { test, describe, before, after } from 'node:test';
import { handlePlatformMcpRequest } from '../lib/mcp/platform-mcp-server';
import { apiKeyHashLiteral, generateRawApiKey } from '../lib/auth/api-keys';

// End-to-end through the official MCP SDK transport and the real supabase-js client,
// against an in-memory PostgREST.
import { fakePostgrest, tables, type Row } from './helpers/fake-postgrest';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function seedKey(tenantId: string, scopes: string[], extra: Row = {}) {
  const raw = generateRawApiKey('live');
  tables.mcp_api_keys.push({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    org_id: tenantId,
    key_hash: apiKeyHashLiteral(raw),
    scopes,
    tools_whitelist: [],
    rate_limit_rpm: 1000,
    revoked_at: null,
    expires_at: null,
    ...extra,
  });
  return raw;
}

let rpcId = 0;
async function rpc(key: string | null, method: string, params?: unknown, accept = 'application/json, text/event-stream') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: accept };
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await handlePlatformMcpRequest(
    new Request('https://app.test/api/mcp/platform', {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, ...(params === undefined ? {} : { params }) }),
    })
  );
  const text = await res.text();
  return { statusCode: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}
const call = (key: string, name: string, args: Row = {}) => rpc(key, 'tools/call', { name, arguments: args });

describe('Platform MCP end-to-end (SDK transport, fake PostgREST)', () => {
  const realFetch = globalThis.fetch;
  let keyA: string;
  let keyAWrite: string;
  let profileB: string;

  before(() => {
    globalThis.fetch = fakePostgrest as typeof fetch;
    tables.mcp_api_keys = [];
    tables.supervisor_tasks = [];
    profileB = crypto.randomUUID();
    tables.mcp_profiles = [
      { id: crypto.randomUUID(), org_id: TENANT_A, name: 'A support', description: null, token_budget: 8000, settings: {}, is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: profileB, org_id: TENANT_B, name: 'B secret', description: null, token_budget: 8000, settings: {}, is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ];
    keyA = seedKey(TENANT_A, ['mcp:profiles:read', 'mcp:tasks:read']);
    keyAWrite = seedKey(TENANT_A, ['mcp:profiles:read', 'mcp:profiles:write', 'mcp:tasks:read', 'mcp:tasks:write']);
  });

  after(() => {
    globalThis.fetch = realFetch;
  });

  test('initialize negotiates the protocol and identifies the server', async () => {
    const init = await rpc(keyA, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    assert.equal(init.statusCode, 200);
    assert.equal(init.body.result.protocolVersion, '2025-06-18');
    assert.equal(init.body.result.serverInfo.name, 'context-control-mcp-server');
    assert.ok(init.body.result.capabilities.tools);
  });

  test('tools/list reflects key scopes, with output schemas and full annotations', async () => {
    const list = await rpc(keyA, 'tools/list');
    const tools = list.body.result.tools;
    assert.deepEqual(tools.map((t: any) => t.name).sort(), [
      'contextcontrol_get_profile',
      'contextcontrol_get_task',
      'contextcontrol_list_profiles',
      'contextcontrol_list_tasks',
    ]);
    for (const t of tools) {
      assert.ok(t.title && t.description, `${t.name} has title/description`);
      assert.equal(t.inputSchema.type, 'object');
      assert.equal(t.outputSchema.type, 'object');
      assert.deepEqual(
        Object.keys(t.annotations).filter((k) => k.endsWith('Hint')).sort(),
        ['destructiveHint', 'idempotentHint', 'openWorldHint', 'readOnlyHint']
      );
      assert.equal(t.annotations.readOnlyHint, true);
      assert.equal(t.annotations.openWorldHint, false);
    }
  });

  test('list tools page results and render markdown or JSON', async () => {
    for (let i = 0; i < 3; i++) {
      tables.supervisor_tasks.push({ id: crypto.randomUUID(), tenant_id: TENANT_A, title: `Task ${i}`, description: null, status: 'scheduled', target_time: `2026-12-0${i + 1}T00:00:00Z`, metadata: {}, created_at: '2026-01-01' });
    }
    const first = await call(keyA, 'contextcontrol_list_tasks', { limit: 2 });
    const page1 = first.body.result.structuredContent;
    assert.deepEqual([page1.tasks.length, page1.total_count, page1.has_more, page1.next_offset], [2, 3, true, 2]);
    assert.match(first.body.result.content[0].text, /## Tasks[\s\S]*Pass offset=2 for more/);

    const second = await call(keyA, 'contextcontrol_list_tasks', { limit: 2, offset: 2, response_format: 'json' });
    const page2 = second.body.result.structuredContent;
    assert.deepEqual([page2.tasks.length, page2.has_more, page2.next_offset], [1, false, null]);
    assert.deepEqual(JSON.parse(second.body.result.content[0].text), page2);
    tables.supervisor_tasks = [];
  });

  test('a key only sees its own tenant profiles', async () => {
    const res = await call(keyA, 'contextcontrol_list_profiles');
    assert.deepEqual(res.body.result.structuredContent.profiles.map((p: any) => p.name), ['A support']);
  });

  test('tenant A cannot read or modify tenant B resources by id; errors say what to do next', async () => {
    const read = await call(keyA, 'contextcontrol_get_profile', { profile_id: profileB });
    assert.equal(read.body.result.isError, true);
    assert.match(read.body.result.content[0].text, /not found.*contextcontrol_list_profiles/i);

    const write = await call(keyAWrite, 'contextcontrol_update_profile', { profile_id: profileB, name: 'pwned' });
    assert.equal(write.body.result.isError, true);
    assert.equal(tables.mcp_profiles.find((p) => p.id === profileB)!.name, 'B secret');

    const task = await call(keyAWrite, 'contextcontrol_schedule_task', {
      title: 't',
      instructions: 'i',
      target_time: new Date(Date.now() + 60_000).toISOString(),
      profile_id: profileB,
    });
    assert.equal(task.body.result.isError, true);
    assert.equal(tables.supervisor_tasks.length, 0);
  });

  test('invalid arguments and unauthorized tools are rejected', async () => {
    const bad = await call(keyA, 'contextcontrol_get_profile', { profile_id: 'not-a-uuid' });
    assert.ok(bad.body.error || bad.body.result?.isError, 'invalid uuid is rejected');

    const extra = await call(keyA, 'contextcontrol_list_tasks', { tenant_id: TENANT_B });
    assert.ok(extra.body.error || extra.body.result?.isError, 'unknown argument is rejected');

    const write = await call(keyA, 'contextcontrol_create_profile', { name: 'x', token_budget: 1000 });
    assert.ok(write.body.error || write.body.result?.isError, 'write tool is not registered for a read key');
  });

  test('write key creates a profile and schedules then cancels a task in its own tenant', async () => {
    const created = await call(keyAWrite, 'contextcontrol_create_profile', { name: 'Created via MCP', token_budget: 4096 });
    assert.notEqual(created.body.result.isError, true);
    const row = tables.mcp_profiles.find((p) => p.name === 'Created via MCP')!;
    assert.equal(row.org_id, TENANT_A);
    assert.equal(row.created_by, null);
    assert.ok(row.created_via_api_key_id);

    // Scheduled tasks are run by a team of the same organization.
    const teamId = crypto.randomUUID();
    (tables.agent_teams ||= []).push({ id: teamId, tenant_id: TENANT_A, name: 'Ops', archived_at: null, provider: 'gemini', model: 'gemini-3.8-flash', supervisor_tools: [] });
    const scheduled = await call(keyAWrite, 'contextcontrol_schedule_task', {
      title: 'Follow up',
      instructions: 'Ping lead',
      team_id: teamId,
      target_time: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const taskId = scheduled.body.result.structuredContent.task.id;
    assert.equal(tables.supervisor_tasks[0].tenant_id, TENANT_A);

    const cancelled = await call(keyAWrite, 'contextcontrol_cancel_task', { task_id: taskId });
    assert.equal(cancelled.body.result.structuredContent.task.status, 'cancelled');

    const again = await call(keyAWrite, 'contextcontrol_cancel_task', { task_id: taskId });
    assert.equal(again.body.result.isError, true);
    assert.match(again.body.result.content[0].text, /contextcontrol_get_task/);
  });

  test('missing, revoked, expired and unknown keys get 401 with WWW-Authenticate', async () => {
    const missing = await rpc(null, 'tools/list');
    assert.equal(missing.statusCode, 401);
    assert.match(missing.headers.get('www-authenticate') || '', /Bearer/);

    const revoked = seedKey(TENANT_A, ['*'], { revoked_at: new Date().toISOString() });
    assert.equal((await rpc(revoked, 'tools/list')).statusCode, 401);

    const expired = seedKey(TENANT_A, ['*'], { expires_at: new Date(Date.now() - 1000).toISOString() });
    const res = await rpc(expired, 'tools/list');
    assert.equal(res.statusCode, 401);
    assert.match(res.body.error.message, /expired/);

    assert.equal((await rpc(generateRawApiKey('live'), 'tools/list')).statusCode, 401);
  });

  test('the transport enforces the Streamable HTTP Accept header', async () => {
    const res = await rpc(keyA, 'tools/list', undefined, 'application/json');
    assert.equal(res.statusCode, 406);
  });

  test('legacy whitelist names and cc_live_ keys keep working', async () => {
    const legacyWhitelist = seedKey(TENANT_A, ['*'], { tools_whitelist: ['list_scheduled_tasks'] });
    const names = (await rpc(legacyWhitelist, 'tools/list')).body.result.tools.map((t: any) => t.name);
    assert.deepEqual(names, ['contextcontrol_list_tasks']);

    const legacy = `cc_live_${crypto.randomBytes(16).toString('hex')}`;
    tables.mcp_api_keys.push({
      id: crypto.randomUUID(), tenant_id: TENANT_A, org_id: TENANT_A, key_hash: apiKeyHashLiteral(legacy),
      scopes: ['*'], tools_whitelist: [], rate_limit_rpm: 1000, revoked_at: null, expires_at: null,
    });
    const list = await rpc(legacy, 'tools/list');
    assert.equal(list.statusCode, 200);
    const tools = list.body.result.tools;
    assert.ok(tools.length > 0 && tools.every((t: any) => t.annotations.readOnlyHint));
  });
});
