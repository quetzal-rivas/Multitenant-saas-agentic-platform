import assert from 'assert';
import crypto from 'crypto';
import { test, describe, before, after } from 'node:test';
import { handlePlatformMCPRPC } from '../lib/mcp/platform-mcp-server';
import { apiKeyHashLiteral, generateRawApiKey } from '../lib/auth/api-keys';

/**
 * End-to-end through the real supabase-js client: global fetch is replaced by a tiny
 * in-memory PostgREST that understands the filters the services use (eq, is, order, limit).
 */

type Row = Record<string, any>;
const tables: Record<string, Row[]> = {};

function matches(row: Row, params: URLSearchParams): boolean {
  for (const [col, expr] of params) {
    if (['select', 'order', 'limit', 'offset', 'columns'].includes(col)) continue;
    const dot = expr.indexOf('.');
    const op = expr.slice(0, dot);
    const raw = expr.slice(dot + 1);
    const value = row[col];
    if (op === 'eq' && String(value) !== raw) return false;
    if (op === 'is' && raw === 'null' && value !== null && value !== undefined) return false;
  }
  return true;
}

function project(row: Row, select: string | null): Row {
  if (!select || select === '*') return { ...row };
  const out: Row = {};
  for (const col of select.split(',').map((c) => c.trim())) out[col] = row[col];
  return out;
}

function respond(rows: Row[], accept: string | null, status = 200): Response {
  if (accept?.includes('vnd.pgrst.object+json')) {
    if (rows.length !== 1) {
      return new Response(JSON.stringify({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }), { status: 406 });
    }
    return new Response(JSON.stringify(rows[0]), { status });
  }
  return new Response(JSON.stringify(rows), { status });
}

async function fakePostgrest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const table = url.pathname.split('/rest/v1/')[1];
  const headers = new Headers(init?.headers);
  const accept = headers.get('Accept');
  const method = (init?.method || 'GET').toUpperCase();
  const rows = (tables[table] ||= []);
  const select = url.searchParams.get('select');

  if (method === 'GET') {
    let found = rows.filter((r) => matches(r, url.searchParams));
    const limit = url.searchParams.get('limit');
    if (limit) found = found.slice(0, Number(limit));
    return respond(found.map((r) => project(r, select)), accept);
  }
  if (method === 'POST') {
    const body = JSON.parse(String(init?.body));
    const inserted = (Array.isArray(body) ? body : [body]).map((r: Row) => ({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      revoked_at: null,
      is_active: true,
      ...r,
    }));
    rows.push(...inserted);
    return respond(inserted.map((r) => project(r, select)), accept, 201);
  }
  if (method === 'PATCH') {
    const patch = JSON.parse(String(init?.body));
    const updated = rows.filter((r) => matches(r, url.searchParams));
    updated.forEach((r) => Object.assign(r, patch));
    return respond(updated.map((r) => project(r, select)), accept);
  }
  return new Response('unsupported', { status: 500 });
}

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
const rpc = (key: string, method: string, params?: unknown) =>
  handlePlatformMCPRPC(`Bearer ${key}`, { jsonrpc: '2.0', id: ++rpcId, method, params });

describe('Platform MCP end-to-end (fake PostgREST)', () => {
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

  test('initialize + tools/list reflect the key scopes', async () => {
    const init = await rpc(keyA, 'initialize', { protocolVersion: '2025-06-18' });
    assert.equal(init.statusCode, 200);
    assert.equal(init.body.result.protocolVersion, '2025-06-18');

    const list = await rpc(keyA, 'tools/list');
    const names = list.body.result.tools.map((t: any) => t.name).sort();
    assert.deepEqual(names, ['get_mcp_profile', 'get_scheduled_task', 'list_mcp_profiles', 'list_scheduled_tasks']);
  });

  test('a key only sees its own tenant profiles', async () => {
    const res = await rpc(keyA, 'tools/call', { name: 'list_mcp_profiles', arguments: {} });
    const profiles = res.body.result.structuredContent.profiles;
    assert.deepEqual(profiles.map((p: any) => p.name), ['A support']);
  });

  test('tenant A cannot read or modify tenant B resources by id', async () => {
    const read = await rpc(keyA, 'tools/call', { name: 'get_mcp_profile', arguments: { profile_id: profileB } });
    assert.equal(read.body.result.isError, true);
    assert.match(read.body.result.content[0].text, /not found/i);

    const write = await rpc(keyAWrite, 'tools/call', {
      name: 'update_mcp_profile',
      arguments: { profile_id: profileB, name: 'pwned' },
    });
    assert.equal(write.body.result.isError, true);
    assert.equal(tables.mcp_profiles.find((p) => p.id === profileB)!.name, 'B secret');

    const task = await rpc(keyAWrite, 'tools/call', {
      name: 'schedule_deferred_task',
      arguments: { title: 't', instructions: 'i', target_time: new Date(Date.now() + 60_000).toISOString(), profile_id: profileB },
    });
    assert.equal(task.body.result.isError, true);
    assert.equal(tables.supervisor_tasks.length, 0);
  });

  test('read-only key cannot call write tools', async () => {
    const res = await rpc(keyA, 'tools/call', {
      name: 'create_mcp_profile',
      arguments: { name: 'x', token_budget: 1000 },
    });
    assert.equal(res.body.result.isError, true);
    assert.match(res.body.result.content[0].text, /not enabled/);
  });

  test('write key creates a profile and schedules then cancels a task in its own tenant', async () => {
    const created = await rpc(keyAWrite, 'tools/call', {
      name: 'create_mcp_profile',
      arguments: { name: 'Created via MCP', token_budget: 4096 },
    });
    assert.equal(created.body.result.isError, undefined);
    const row = tables.mcp_profiles.find((p) => p.name === 'Created via MCP')!;
    assert.equal(row.org_id, TENANT_A);
    assert.equal(row.created_by, null);
    assert.ok(row.created_via_api_key_id);

    const scheduled = await rpc(keyAWrite, 'tools/call', {
      name: 'schedule_deferred_task',
      arguments: { title: 'Follow up', instructions: 'Ping lead', target_time: new Date(Date.now() + 3_600_000).toISOString() },
    });
    const taskId = scheduled.body.result.structuredContent.task.id;
    assert.equal(tables.supervisor_tasks[0].tenant_id, TENANT_A);

    const cancelled = await rpc(keyAWrite, 'tools/call', { name: 'cancel_scheduled_task', arguments: { task_id: taskId } });
    assert.equal(cancelled.body.result.structuredContent.task.status, 'cancelled');

    const again = await rpc(keyAWrite, 'tools/call', { name: 'cancel_scheduled_task', arguments: { task_id: taskId } });
    assert.equal(again.body.result.isError, true);
  });

  test('revoked and expired keys are rejected with 401', async () => {
    const revoked = seedKey(TENANT_A, ['*'], { revoked_at: new Date().toISOString() });
    assert.equal((await rpc(revoked, 'tools/list')).statusCode, 401);

    const expired = seedKey(TENANT_A, ['*'], { expires_at: new Date(Date.now() - 1000).toISOString() });
    const res = await rpc(expired, 'tools/list');
    assert.equal(res.statusCode, 401);
    assert.match(res.body.error.message, /expired/);

    assert.equal((await rpc(generateRawApiKey('live'), 'tools/list')).statusCode, 401);
  });

  test('legacy cc_live_ keys are downgraded to read scopes', async () => {
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
