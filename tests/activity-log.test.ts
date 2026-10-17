import assert from 'assert';
import { test, describe, before, after, beforeEach } from 'node:test';
import { fakePostgrest, resetTables, tables } from './helpers/fake-postgrest';
import { getRunTimeline, listActivity } from '../lib/services/activity-log';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const at = (min: number) => new Date(Date.UTC(2026, 9, 17, 12, min)).toISOString();

describe('Logs & Tracing feed', () => {
  const realFetch = globalThis.fetch;
  before(() => {
    globalThis.fetch = fakePostgrest as typeof fetch;
  });
  after(() => {
    globalThis.fetch = realFetch;
  });
  beforeEach(() => {
    resetTables(['agent_runs', 'agent_sessions', 'run_events', 'inbound_events', 'inbound_endpoints', 'function_invocations', 'custom_functions']);
    tables.agent_sessions.push({ id: 's1', tenant_id: TENANT, name: 'Copy auditor' });
    tables.inbound_endpoints.push({ id: 'e1', tenant_id: TENANT, name: 'WhatsApp' });
    tables.custom_functions.push({ id: 'f1', tenant_id: TENANT, name: 'Quote calculator' });
    tables.agent_runs.push(
      { id: 'r1', tenant_id: TENANT, session_id: 's1', origin: 'chat', kind: 'internal', status: 'done', input_message: 'Audit the hero', tokens_used: 1200, usage_by_worker: { agent: { steps: 2, tokens: 1200 } }, labels: { project: 'landing' }, result: { message: 'Looks fine.' }, created_at: at(0), started_at: at(1), finished_at: at(3) },
      { id: 'r2', tenant_id: TENANT, session_id: 's1', origin: 'inbound', kind: 'internal', status: 'error', input_message: 'Reply to customer', error: 'Rate limited by the provider', tokens_used: 0, created_at: at(10) },
      { id: 'r3', tenant_id: OTHER, session_id: 'sx', origin: 'chat', status: 'done', input_message: 'secret', created_at: at(20) },
    );
    tables.run_events.push(
      { run_id: 'r1', tenant_id: TENANT, event_type: 'agent_start', step_name: 'start', status: 'running', payload: {}, created_at: at(1) },
      { run_id: 'r1', tenant_id: TENANT, event_type: 'tool_result', step_name: 'researcher:web_search', status: 'completed', payload: { toolName: 'web_search', worker: 'researcher', latencyMs: 840 }, created_at: at(2) },
      { run_id: 'r1', tenant_id: OTHER, event_type: 'tool_result', step_name: 'leak', status: 'completed', payload: {}, created_at: at(2) },
    );
    tables.inbound_events.push({ id: 'i1', tenant_id: TENANT, endpoint_id: 'e1', provider_event_id: 'wamid.1', received_at: at(5), updated_at: at(5), signature_ok: true, status: 'routed' });
    tables.function_invocations.push({ id: 'fi1', tenant_id: TENANT, function_id: 'f1', caller: 'run', source: 'agent', status: 'timeout', duration_ms: 30000, error: 'Timed out', created_at: at(7) });
  });

  test('merges runs, webhooks and function calls newest first, scoped to the organization', async () => {
    const { entries } = await listActivity(TENANT);
    assert.deepStrictEqual(entries.map((e) => `${e.kind}:${e.id}`), ['run:r2', 'function:fi1', 'webhook:i1', 'run:r1']);
    const r1 = entries.find((e) => e.id === 'r1')!;
    assert.strictEqual(r1.title, 'Copy auditor');
    assert.strictEqual(r1.status, 'ok');
    assert.strictEqual(r1.duration_ms, 2 * 60_000);
    assert.strictEqual(entries.find((e) => e.id === 'fi1')!.status, 'error');
    assert.strictEqual(entries.find((e) => e.id === 'i1')!.title, 'WhatsApp');
  });

  test('filters by kind and status, and pages with a cursor', async () => {
    assert.deepStrictEqual((await listActivity(TENANT, { kind: 'run' })).entries.map((e) => e.id), ['r2', 'r1']);
    assert.deepStrictEqual((await listActivity(TENANT, { status: 'error' })).entries.map((e) => e.id), ['r2', 'fi1']);
    const first = await listActivity(TENANT, { limit: 2 });
    assert.deepStrictEqual(first.entries.map((e) => e.id), ['r2', 'fi1']);
    const second = await listActivity(TENANT, { limit: 2, before: first.next_before! });
    assert.deepStrictEqual(second.entries.map((e) => e.id), ['i1', 'r1']);
    assert.strictEqual(second.next_before, null);
  });

  test('a run timeline shows its tool calls with worker and latency, and never another org', async () => {
    const { run, timeline } = await getRunTimeline(TENANT, 'r1');
    assert.strictEqual(run.agent, 'Copy auditor');
    assert.strictEqual(run.queue_ms, 60_000);
    assert.strictEqual(run.answer, 'Looks fine.');
    assert.deepStrictEqual(timeline.map((t) => t.name), ['start', 'web_search']);
    assert.strictEqual(timeline[1].worker, 'researcher');
    assert.strictEqual(timeline[1].latency_ms, 840);
    await assert.rejects(() => getRunTimeline(TENANT, 'r3'), /not found/i);
  });
});
