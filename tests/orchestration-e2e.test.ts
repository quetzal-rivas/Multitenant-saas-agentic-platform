import assert from 'assert';
import crypto from 'crypto';
import { test, describe, before, after, beforeEach } from 'node:test';
import { fakePostgrest, resetTables, tables } from './helpers/fake-postgrest';
import { executePlatformTool } from '../lib/mcp/platform-mcp-server';
import { getAuthorizedPlatformTools } from '../lib/mcp/tool-catalog';
import { setDefaultRunnerDepsForTests, setRunDispatcherForTests, recoverStaleRuns } from '../lib/services/agent-runs';
import { createTeam } from '../lib/services/teams';
import { scheduleTask } from '../lib/services/tasks';
import { processDueTasks } from '../lib/services/scheduled-tasks';
import type { LLMGenerateOptions, LLMGenerateResult } from '../lib/agent/providers/llm-adapter';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORCH_SCOPES = ['mcp:agents:read', 'mcp:agents:write', 'mcp:board:read', 'mcp:board:write', 'mcp:tasks:read'];
const keyCtx = (scopes = ORCH_SCOPES, keyId = 'key-orch', tenantId = TENANT) => ({ tenantId, userId: `key_${keyId}`, authMode: 'api_key' as const, apiKeyId: keyId, scopes, toolsWhitelist: [] as string[] });
const human = { tenantId: TENANT, userId: crypto.randomUUID(), authMode: 'session' as const, scopes: ['*'] };
const call = (name: string, args: unknown, ctx: any = keyCtx()) => executePlatformTool(name, args, ctx) as Promise<any>;

/** Scripted model: behaviour per agent instruction keyword. */
let tokensPerStep = 10;
let holdAll = false;
const held: string[] = [];
const seenInputs: string[][] = [];
const seenTools: string[][] = [];
const timeline: Array<{ id: string; start: number; end: number }> = [];

async function generate(o: LLMGenerateOptions): Promise<LLMGenerateResult> {
  seenInputs.push(o.messages.map((m) => String(m.content)));
  seenTools.push((o.tools ?? []).map((t) => t.name));
  const usage = { inputTokens: tokensPerStep / 2, outputTokens: tokensPerStep / 2, totalTokens: tokensPerStep };
  await new Promise((r) => setTimeout(r, 120));
  if (/LOOP/.test(o.systemPrompt || '')) {
    return { text: 'working', usage, finishReason: 'tool_calls', toolCalls: [{ id: crypto.randomUUID(), name: 'contextcontrol_board_list_tasks', arguments: {} }] } as LLMGenerateResult;
  }
  if (/JSON/.test(o.systemPrompt || '')) return { text: '```json\n{"section":"pricing","issues":["too long"],"suggestions":["shorten"]}\n```', usage, finishReason: 'stop' } as LLMGenerateResult;
  return { text: 'All good.', usage, finishReason: 'stop' } as LLMGenerateResult;
}

describe('Orchestration over MCP: agents, batch runs, limits, stop/resume', () => {
  const realFetch = globalThis.fetch;
  before(async () => {
    globalThis.fetch = fakePostgrest as typeof fetch;
    const { handler } = await import('../lib/agent/worker-entry');
    setDefaultRunnerDepsForTests({ generate, getSecret: async () => 'k' });
    setRunDispatcherForTests(async (id) => {
      if (holdAll) {
        held.push(id);
        return true;
      }
      const start = Date.now();
      // Like the real worker: each run is its own invocation (not awaited one after another).
      void handler({ run_id: id }, { awsRequestId: crypto.randomUUID() }).then(() => timeline.push({ id, start, end: Date.now() }));
      return true;
    });
  });
  after(() => {
    globalThis.fetch = realFetch;
    setRunDispatcherForTests(null);
    setDefaultRunnerDepsForTests(null);
  });
  beforeEach(() => {
    tokensPerStep = 10;
    holdAll = false;
    held.length = 0;
    seenInputs.length = 0;
    timeline.length = 0;
    resetTables(['organizations', 'agent_runs', 'agent_sessions', 'agent_teams', 'team_workers', 'checkpoints', 'run_events', 'encrypted_secrets', 'agent_run_messages', 'board_tasks', 'board_task_events', 'supervisor_tasks', 'mcp_profiles', 'context_profiles']);
    tables.organizations.push({ id: TENANT, name: 'Acme', agent_limits: {}, agents_paused_at: null });
    tables.encrypted_secrets.push({ tenant_id: TENANT, provider: 'gemini', updated_at: '2026-01-01', encrypted_payload: {} });
  });

  const waitAll = async (ids: string[]) => {
    for (let i = 0; i < 10; i++) {
      const res = await call('contextcontrol_wait_for_runs', { run_ids: ids, timeout_seconds: 5 });
      if (res.done) return res;
    }
    throw new Error('runs never finished');
  };

  test('create agents, run a labelled idempotent batch in parallel, wait, read structured output', async () => {
    // Tools the key may not use are refused with the reason, never dropped silently.
    await assert.rejects(
      () => call('contextcontrol_create_agent', { name: 'SEO', tools: ['contextcontrol_board_claim_task', 'contextcontrol_place_call', 'contextcontrol_list_api_keys', 'nope_tool'] }),
      (err: any) => /contextcontrol_place_call \(the key needs the mcp:calls:write scope\)/.test(err.message) && /contextcontrol_list_api_keys/.test(err.message) && /nope_tool \(unknown tool/.test(err.message),
    );
    const a = await call('contextcontrol_create_agent', { name: 'SEO', instructions: 'Review copy. Answer in JSON.', tools: ['contextcontrol_board_claim_task'] });
    assert.deepEqual(a.agent.tools, ['contextcontrol_board_claim_task']);
    const b = await call('contextcontrol_create_agent', { name: 'Competitors', instructions: 'Compare competitors.' });
    const c = await call('contextcontrol_create_agent', { name: 'Pricing', instructions: 'Review pricing.' });
    const schema = { type: 'object', properties: { section: { type: 'string' }, issues: { type: 'array', items: { type: 'string' } }, suggestions: { type: 'array', items: { type: 'string' } } }, required: ['section', 'issues', 'suggestions'] };
    const runs = [
      { agent_id: a.agent.agent_id, message: 'Audit the copy', client_ref: 'audit-seo', labels: { project: 'welcomeaitoday', component: 'seo' }, output_schema: schema },
      { agent_id: b.agent.agent_id, message: 'Compare', client_ref: 'audit-comp', labels: { project: 'welcomeaitoday', component: 'competitors' } },
      { agent_id: c.agent.agent_id, message: 'Pricing', client_ref: 'audit-pricing', labels: { project: 'welcomeaitoday', component: 'pricing' } },
      { agent_id: crypto.randomUUID(), message: 'nope' },
    ];
    const started = await call('contextcontrol_run_agents', { runs });
    assert.equal(started.runs.filter((r: any) => r.run_id).length, 3);
    assert.match(started.runs[3].error, /not found/i, 'one bad item fails alone');

    // Retrying the same call never duplicates runs.
    const retry = await call('contextcontrol_run_agents', { runs: runs.slice(0, 3) });
    assert.ok(retry.runs.every((r: any) => r.reused));
    assert.deepEqual(retry.runs.map((r: any) => r.run_id), started.runs.slice(0, 3).map((r: any) => r.run_id));
    assert.equal(tables.agent_runs.length, 3);

    const ids = started.runs.slice(0, 3).map((r: any) => r.run_id);
    const waited = await waitAll(ids);
    assert.equal(waited.runs.every((r: any) => r.status === 'done'), true);

    // The three ran at the same time, not one after another.
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(timeline.length, 3);
    const latestStart = Math.max(...timeline.map((t) => t.start));
    const earliestEnd = Math.min(...timeline.map((t) => t.end));
    assert.ok(latestStart < earliestEnd, 'runs overlap in time');

    const out = await call('contextcontrol_get_run_output', { run_id: ids[0] });
    assert.equal(out.untrusted, true);
    assert.equal(out.schema_valid, true);
    assert.deepEqual(out.output_json, { section: 'pricing', issues: ['too long'], suggestions: ['shorten'] });
    assert.ok(seenInputs.length > 0);

    const byLabel = await call('contextcontrol_list_runs', { label: 'component=pricing' });
    assert.equal(byLabel.runs.length, 1);
    assert.equal((await call('contextcontrol_list_runs', { label: 'project=welcomeaitoday', status: 'done' })).total_count, 3);
    const detail = await call('contextcontrol_get_run', { run_id: ids[0] });
    assert.equal(detail.run.labels.component, 'seo');
    assert.ok(detail.run.tokens_used > 0);
  });

  test('web_search: refused without the search scope, given to the agent with it', async () => {
    await assert.rejects(() => call('contextcontrol_create_agent', { name: 'Researcher', tools: ['web_search'] }), /web_search \(the key needs the mcp:search:invoke scope\)/);
    const searchKey = keyCtx([...ORCH_SCOPES, 'mcp:search:invoke'], 'key-search');
    const agent = await call('contextcontrol_create_agent', { name: 'Researcher', tools: ['web_search'] }, searchKey);
    assert.deepEqual(agent.agent.tools, ['web_search']);
    seenTools.length = 0;
    const started = await call('contextcontrol_run_agents', { runs: [{ agent_id: agent.agent.agent_id, message: 'Research the landing page' }] }, searchKey);
    await waitAll([started.runs[0].run_id]);
    assert.ok(seenTools.some((names) => names.includes('web_search')), 'the model is offered web_search');
  });

  test('limits: concurrency cap, token budget, step limit, daily cap; queue timeout', async () => {
    tables.organizations[0].agent_limits = { max_concurrent_runs: 2 };
    const agents = await Promise.all(['a', 'b', 'c'].map((n) => call('contextcontrol_create_agent', { name: n, instructions: 'LOOP forever' })));
    holdAll = true;
    const first = await call('contextcontrol_run_agents', { runs: agents.map((a: any) => ({ agent_id: a.agent.agent_id, message: 'go' })) });
    assert.equal(first.runs.filter((r: any) => r.run_id).length, 2);
    assert.match(first.runs.find((r: any) => r.error).error, /Concurrency limit reached: 2 runs are active \(limit 2\)/);

    // Token budget and step limit stop a looping agent, keeping its partial text.
    holdAll = false;
    tables.organizations[0].agent_limits = {};
    for (const r of tables.agent_runs) r.status = 'cancelled';
    tokensPerStep = 1000;
    const budget = await call('contextcontrol_run_agents', { runs: [{ agent_id: agents[0].agent.agent_id, message: 'loop', max_tokens: 2500 }] });
    await waitAll([budget.runs[0].run_id]);
    const budgetRun = tables.agent_runs.find((r) => r.id === budget.runs[0].run_id)!;
    assert.equal(budgetRun.status, 'error');
    assert.match(budgetRun.error, /Token budget of 2500 reached/);
    assert.equal(budgetRun.result.message, 'working');
    tokensPerStep = 10;
    const steps = await call('contextcontrol_run_agents', { runs: [{ agent_id: agents[1].agent.agent_id, message: 'loop', max_steps: 3 }] });
    await waitAll([steps.runs[0].run_id]);
    assert.match(tables.agent_runs.find((r) => r.id === steps.runs[0].run_id)!.error, /Step limit of 3 reached/);

    // Daily cap (UTC) refuses new runs.
    tables.organizations[0].agent_limits = { max_tokens_per_day: 1000 };
    const capped = await call('contextcontrol_run_agents', { runs: [{ agent_id: agents[2].agent.agent_id, message: 'go' }] });
    assert.match(capped.runs[0].error, /Daily token cap reached/);

    // A run stuck in the queue fails after max_queue_seconds.
    tables.organizations[0].agent_limits = {};
    holdAll = true;
    const queued = await call('contextcontrol_run_agents', { runs: [{ agent_id: agents[2].agent.agent_id, message: 'go' }] });
    tables.agent_runs.find((r) => r.id === queued.runs[0].run_id)!.created_at = new Date(Date.now() - 10 * 60_000).toISOString();
    await recoverStaleRuns();
    assert.match(tables.agent_runs.find((r) => r.id === queued.runs[0].run_id)!.error, /never started/);
  });

  test('messages reach the running agent at its next step; refused after it ends', async () => {
    const a = await call('contextcontrol_create_agent', { name: 'Worker', instructions: 'Answer.' });
    holdAll = true;
    const run = (await call('contextcontrol_run_agents', { runs: [{ agent_id: a.agent.agent_id, message: 'Review the landing' }] })).runs[0].run_id;
    await call('contextcontrol_message_run', { run_id: run, message: 'Focus only on the pricing section.' });
    const { handler } = await import('../lib/agent/worker-entry');
    await handler({ run_id: run }, { awsRequestId: 'w' });
    assert.ok(seenInputs.at(-1)!.some((m) => /Message from the orchestrator \(key:key-orch\): Focus only on the pricing section\./.test(m)));
    assert.ok(tables.agent_run_messages[0].consumed_at);
    assert.ok(tables.run_events.some((e) => e.run_id === run && e.event_type === 'orchestrator_message'));
    await assert.rejects(call('contextcontrol_message_run', { run_id: run, message: 'late' }), /already ended/);
  });

  test('Board claims are bound to the run, renewed while it lives, released when it is cancelled', async () => {
    const task = (await call('contextcontrol_board_post_task', { title: 'Pricing audit' }, human)).task;
    assert.equal(tables.board_tasks[0].author_kind, 'human');
    const a = await call('contextcontrol_create_agent', { name: 'Claimer', instructions: 'Claim work.', tools: ['contextcontrol_board_claim_task'] });
    holdAll = true;
    const run = (await call('contextcontrol_run_agents', { runs: [{ agent_id: a.agent.agent_id, message: 'go', labels: { board_task_id: task.id } }] })).runs[0].run_id;
    // The run claims the task (as its tool would), then the lease is renewed on the next step.
    Object.assign(tables.board_tasks[0], { status: 'claimed', claimed_by: 'agent', claim_run_id: run, lease_expires_at: new Date(Date.now() + 60_000).toISOString() });
    const { handler } = await import('../lib/agent/worker-entry');
    tables.agent_runs.find((r) => r.id === run)!.status = 'queued';
    await handler({ run_id: run }, { awsRequestId: 'w2' });
    assert.ok(new Date(tables.board_tasks[0].lease_expires_at).getTime() > Date.now() + 20 * 60_000 || tables.board_tasks[0].status === 'open', 'lease renewed while alive, parked when done');

    // Cancel parks claims.
    const run2 = (await call('contextcontrol_run_agents', { runs: [{ agent_id: a.agent.agent_id, message: 'again' }] })).runs[0].run_id;
    Object.assign(tables.board_tasks[0], { status: 'claimed', claim_run_id: run2, lease_expires_at: new Date(Date.now() + 60_000).toISOString() });
    await call('contextcontrol_cancel_run', { run_id: run2 });
    assert.notEqual(tables.board_tasks[0].claim_run_id, run2);

    // Agent-written notes are labelled as such.
    Object.assign(tables.board_tasks[0], { status: 'claimed', claimed_by: 'x', claim_run_id: 'r', lease_expires_at: new Date(Date.now() + 60_000).toISOString() });
    const got = await call('contextcontrol_board_get_task', { task_id: task.id });
    assert.equal(got.task.author_kind, 'human');
  });

  test("stop all: 'mine' touches only this key's runs; 'org' pauses every source until a person resumes", async () => {
    const a = await call('contextcontrol_create_agent', { name: 'A', instructions: 'x' });
    const b = await call('contextcontrol_create_agent', { name: 'B', instructions: 'x' }, keyCtx(ORCH_SCOPES, 'key-other'));
    holdAll = true;
    const mineRun = (await call('contextcontrol_run_agents', { runs: [{ agent_id: a.agent.agent_id, message: 'go' }] })).runs[0].run_id;
    const otherRun = (await call('contextcontrol_run_agents', { runs: [{ agent_id: b.agent.agent_id, message: 'go' }] }, keyCtx(ORCH_SCOPES, 'key-other'))).runs[0].run_id;
    const stopped = await call('contextcontrol_stop_all_runs', {});
    assert.equal(stopped.cancelled, 1);
    assert.equal(tables.agent_runs.find((r) => r.id === mineRun)!.status, 'cancelled');
    assert.equal(tables.agent_runs.find((r) => r.id === otherRun)!.status, 'queued');

    await call('contextcontrol_stop_all_runs', { scope: 'org' });
    assert.ok(tables.organizations[0].agents_paused_at);
    assert.equal(tables.organizations[0].agents_paused_by, 'key:key-orch');
    assert.equal(tables.agent_runs.find((r) => r.id === otherRun)!.status, 'cancelled', 'queued runs are cancelled');
    const refused = await call('contextcontrol_run_agents', { runs: [{ agent_id: a.agent.agent_id, message: 'go' }] });
    assert.match(refused.runs[0].error, /paused for this organization/);

    // Scheduled tasks are skipped (not escalated) while paused.
    const team = await createTeam(human, { name: 'Crew', llm: { provider: 'gemini' }, supervisor: { tools: [] } });
    const { task } = await scheduleTask(human, { title: 'Daily', instructions: 'x', team_id: team.id, schedule: { mode: 'interval', every: 1, unit: 'days', timezone: 'UTC' } });
    tables.supervisor_tasks.find((t) => t.id === task.id)!.next_run_at = new Date(Date.now() - 1000).toISOString();
    await processDueTasks();
    const row = tables.supervisor_tasks.find((t) => t.id === task.id)!;
    assert.equal(row.last_status, 'skipped_paused');
    assert.equal(row.status, 'scheduled');

    // Write keys can stop but not resume; the admin scope (a person) can.
    assert.ok(!getAuthorizedPlatformTools([], ORCH_SCOPES).some((t) => t.name === 'contextcontrol_resume_runs'));
    await call('contextcontrol_resume_runs', {}, keyCtx(['mcp:agents:admin'], 'key-admin'));
    assert.equal(tables.organizations[0].agents_paused_at, null);
    assert.ok(tables.run_events.some((e) => e.event_type === 'runs_stopped') && tables.run_events.some((e) => e.event_type === 'runs_resumed'));
  });

  test('isolation and scopes', async () => {
    const a = await call('contextcontrol_create_agent', { name: 'A', instructions: 'x' });
    holdAll = true;
    const run = (await call('contextcontrol_run_agents', { runs: [{ agent_id: a.agent.agent_id, message: 'go' }] })).runs[0].run_id;
    const other = keyCtx(ORCH_SCOPES, 'k2', OTHER);
    await assert.rejects(call('contextcontrol_get_run', { run_id: run }, other), /not found/i);
    assert.equal((await call('contextcontrol_list_runs', {}, other)).total_count, 0);
    const started = await call('contextcontrol_run_agents', { runs: [{ agent_id: a.agent.agent_id, message: 'go' }] }, other);
    assert.match(started.runs[0].error, /not found/i);
    const readOnly = getAuthorizedPlatformTools([], ['mcp:agents:read']).map((t) => t.name);
    assert.ok(readOnly.includes('contextcontrol_wait_for_runs') && !readOnly.includes('contextcontrol_run_agents'));
  });
});

describe('Provider rate limits are retried with backoff', () => {
  test('OpenAI 429 with Retry-After is retried, then succeeds; a persistent 429 is reported as a rate limit', async () => {
    const { generateLLMResponse, setRetryBaseMsForTests } = await import('../lib/agent/providers/llm-adapter');
    setRetryBaseMsForTests(1);
    const realFetch = globalThis.fetch;
    let calls = 0;
    let always429 = false;
    globalThis.fetch = (async () => {
      calls++;
      if (always429 || calls === 1) return new Response('{"error":"slow down"}', { status: 429, headers: { 'retry-after': '0' } });
      return Response.json({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
    }) as typeof fetch;
    try {
      const res = await generateLLMResponse({ provider: 'openai', model: 'gpt-x', apiKey: 'k', messages: [{ role: 'user', content: 'hi' }] } as any);
      assert.equal(res.text, 'ok');
      assert.equal(calls, 2);
      always429 = true;
      calls = 0;
      await assert.rejects(generateLLMResponse({ provider: 'openai', model: 'gpt-x', apiKey: 'k', messages: [{ role: 'user', content: 'hi' }] } as any), /Rate limited by the provider/);
      assert.equal(calls, 3);
    } finally {
      globalThis.fetch = realFetch;
      setRetryBaseMsForTests(1000);
    }
  });
});
