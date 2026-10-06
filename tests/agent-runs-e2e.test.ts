import assert from 'assert';
import crypto from 'crypto';
import { test, describe, before, after, beforeEach } from 'node:test';
import { fakePostgrest, resetTables, tables } from './helpers/fake-postgrest';
import { createSession, latestCheckpoint } from '../lib/services/agent-sessions';
import {
  claimRun, executeRun, getRun, recoverStaleRuns, setDefaultRunnerDepsForTests, setRunDispatcherForTests, startRun,
} from '../lib/services/agent-runs';
import { checkTurn, startTurn } from '../lib/services/agent-run-api';
import { createTeam, getTeam } from '../lib/services/teams';
import { runTeamHeartbeat } from '../lib/services/heartbeats';
import type { LLMGenerateOptions, LLMGenerateResult } from '../lib/agent/providers/llm-adapter';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ctx = { tenantId: TENANT, userId: crypto.randomUUID(), authMode: 'session' as const, scopes: ['*'] };
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

/** A model that calls list_profiles `toolSteps` times, then answers. Counts its calls. */
function scriptedModel(toolSteps: number) {
  let calls = 0;
  const generate = async (o: LLMGenerateOptions) => {
    calls++;
    const toolResults = o.messages.filter((m) => m.role === 'tool').length;
    const sinceLastUser = o.messages.length - 1 - [...o.messages].reverse().findIndex((m) => m.role === 'user');
    const toolsThisTurn = o.messages.slice(sinceLastUser).filter((m) => m.role === 'tool').length;
    if (toolsThisTurn < toolSteps) {
      return { text: '', usage, finishReason: 'tool_calls', toolCalls: [{ id: `c${toolResults + 1}`, name: 'contextcontrol_list_profiles', arguments: {} }] } as LLMGenerateResult;
    }
    return { text: `Done after ${toolsThisTurn} tool calls.`, usage, finishReason: 'stop' } as LLMGenerateResult;
  };
  return { generate, calls: () => calls, deps: { generate, getSecret: async () => 'k' } };
}

describe('Agent runs: durable, resumable, auto-continued', () => {
  const realFetch = globalThis.fetch;
  let sessionId: string;

  before(() => {
    globalThis.fetch = fakePostgrest as typeof fetch;
  });
  beforeEach(async () => {
    resetTables(['agent_sessions', 'agent_runs', 'checkpoints', 'mcp_profiles', 'context_profiles', 'encrypted_secrets', 'run_events', 'agent_teams', 'team_workers', 'board_tasks']);
    tables.encrypted_secrets.push({ tenant_id: TENANT, provider: 'gemini', updated_at: '2026-01-01', encrypted_payload: {} });
    sessionId = (await createSession(ctx, { name: 'Long worker', provider: 'gemini', allowed_tools: ['contextcontrol_list_profiles'] })).id;
    setRunDispatcherForTests(null);
    setDefaultRunnerDepsForTests(null);
  });
  after(() => {
    globalThis.fetch = realFetch;
    setRunDispatcherForTests(null);
    setDefaultRunnerDepsForTests(null);
  });

  test('a slice pauses between steps and the next slice continues without repeating work', async () => {
    const model = scriptedModel(3);
    const run = await startRun(ctx, sessionId, 'Do three things');
    assert.ok(await claimRun(run.id, 'w1', 60_000));
    // Deadline already passed: the slice still makes one step of progress, then pauses.
    const first = await executeRun(run.id, { owner: 'w1', deadlineAt: Date.now() - 1, deps: model.deps });
    assert.equal(first.status, 'paused');
    const mid = await getRun(ctx, run.id);
    assert.equal(mid.status, 'running');
    assert.equal(mid.progress.step, 1);
    assert.equal(mid.progress.last_tool, 'contextcontrol_list_profiles');

    assert.ok(await claimRun(run.id, 'w2', 60_000), 'released lease is claimable at once');
    const second = await executeRun(run.id, { owner: 'w2', deadlineAt: Date.now() + 60_000, deps: model.deps });
    assert.equal(second.status, 'done');
    assert.equal(model.calls(), 4, 'three tool steps + final answer, none repeated');

    const checkpoint = await latestCheckpoint(ctx, sessionId);
    const roles = checkpoint!.state.map((m) => m.role);
    assert.deepEqual(roles, ['user', 'assistant', 'tool', 'assistant', 'tool', 'assistant', 'tool', 'assistant']);
    const done = await getRun(ctx, run.id);
    assert.equal(done.status, 'done');
    assert.equal(done.result!.message, 'Done after 3 tool calls.');
    assert.equal(done.result!.tool_executions.length, 3);
  });

  test('only one executor can hold a run; an expired lease is recovered by the tick', async () => {
    const run = await startRun(ctx, sessionId, 'hi');
    const a = await claimRun(run.id, 'a', 60_000);
    const b = await claimRun(run.id, 'b', 60_000);
    assert.ok(a);
    assert.equal(b, null);
    // Simulate the worker dying: lease in the past.
    tables.agent_runs.find((r) => r.id === run.id)!.lease_expires_at = new Date(Date.now() - 1000).toISOString();
    const dispatched: string[] = [];
    setRunDispatcherForTests(async (id) => (dispatched.push(id), true));
    const res = await recoverStaleRuns();
    assert.equal(res.restarted, 1);
    assert.deepEqual(dispatched, [run.id]);
    assert.ok(await claimRun(run.id, 'c', 60_000), 'stale lease can be taken over');
  });

  test('chat API: short turns return 200 as before; long turns return 202 and finish via polling', async () => {
    const fast = scriptedModel(1);
    const ok = await startTurn(ctx, sessionId, 'quick', { deps: fast.deps });
    assert.equal(ok.status, 200);
    assert.equal((ok.body as any).message, 'Done after 1 tool calls.');
    assert.ok(Array.isArray((ok.body as any).transcript));

    const slow = scriptedModel(4);
    const started = await startTurn(ctx, sessionId, 'long job', { waitMs: 0, deps: slow.deps });
    assert.equal(started.status, 202);
    const runId = (started.body as any).run_id;
    await assert.rejects(startTurn(ctx, sessionId, 'another', { deps: slow.deps }), /still working/);
    await assert.rejects(getRun({ tenantId: OTHER }, runId), /not found/i);

    const finished = await checkTurn(ctx, runId, { deps: slow.deps });
    assert.equal(finished.status, 200);
    assert.equal((finished.body as any).message, 'Done after 4 tool calls.');
  });

  test('worker: each invocation runs a slice and re-invokes itself until the run is done', async () => {
    process.env.AGENT_WORKER_BUDGET_MS = '1'; // force a pause after every step
    const { handler } = await import('../lib/agent/worker-entry');
    const model = scriptedModel(3);
    setDefaultRunnerDepsForTests(model.deps);
    const invocations: string[] = [];
    setRunDispatcherForTests(async (id) => {
      invocations.push(id);
      await handler({ run_id: id }, { awsRequestId: `req-${invocations.length}` });
      return true;
    });
    try {
      const res = await startTurn(ctx, sessionId, 'three steps please', { waitMs: 0 });
      // The dispatcher ran the whole chain synchronously; the run is done.
      const runId = (res.body as any).run_id ?? (await getRun(ctx, tables.agent_runs[0].id)).run_id;
      const final = await getRun(ctx, runId);
      assert.equal(final.status, 'done');
      assert.ok(invocations.length >= 3, `continued across ${invocations.length} invocations`);
      assert.equal(tables.agent_runs.find((r) => r.id === runId)!.invocations >= 3, true);
      assert.equal(model.calls(), 4);
    } finally {
      delete process.env.AGENT_WORKER_BUDGET_MS;
    }
  });

  test('heartbeats queue a run in the worker and report ok when it finishes', async () => {
    const model = scriptedModel(1);
    setDefaultRunnerDepsForTests(model.deps);
    const { handler } = await import('../lib/agent/worker-entry');
    setRunDispatcherForTests(async (id) => {
      await handler({ run_id: id }, { awsRequestId: 'hb' });
      return true;
    });
    const team = await createTeam(ctx, {
      name: 'Night shift',
      llm: { provider: 'gemini' },
      supervisor: { tools: ['contextcontrol_list_profiles'] },
      heartbeat: { enabled: true, goal: 'Check profiles', schedule: { mode: 'interval', every: 5, unit: 'minutes', timezone: 'UTC' } },
    });
    const outcome = await runTeamHeartbeat(ctx, await getTeam(ctx, team.id));
    assert.equal(outcome.status, 'ok');
    assert.match(outcome.detail!, /Started run/);
    const run = tables.agent_runs.find((r) => r.origin === 'heartbeat')!;
    assert.equal(run.status, 'done');
    assert.equal(run.team_id, team.id);
    assert.equal(tables.agent_teams.find((t) => t.id === team.id)!.heartbeat_last_status, 'ok');
  });
});
