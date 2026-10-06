import assert from 'assert';
import crypto from 'crypto';
import { test, describe, before, after, beforeEach } from 'node:test';
import { NextRequest } from 'next/server';
import { fakePostgrest, resetTables, tables } from './helpers/fake-postgrest';
import { createTeam } from '../lib/services/teams';
import { cancelTask, scheduleTask, setTaskPaused, taskHistory, upcomingRuns } from '../lib/services/tasks';
import { processDueTasks, runTaskNow } from '../lib/services/scheduled-tasks';
import { setDefaultRunnerDepsForTests, setRunDispatcherForTests } from '../lib/services/agent-runs';
import { calendarItems } from '../lib/services/calendar';
import { executePlatformTool } from '../lib/mcp/platform-mcp-server';
import { GET as LIST_TASKS } from '../app/api/v1/tasks/route';
import type { LLMGenerateResult } from '../lib/agent/providers/llm-adapter';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ctx = { tenantId: TENANT, userId: crypto.randomUUID(), authMode: 'session' as const, scopes: ['*'] };
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
const inAMinute = () => new Date(Date.now() + 60_000).toISOString();
const makeDue = (id: string) => {
  tables.supervisor_tasks.find((t) => t.id === id)!.next_run_at = new Date(Date.now() - 1000).toISOString();
};

let failing = false;
const deps = {
  getSecret: async () => 'k',
  generate: async () => {
    if (failing) throw new Error('Gmail API error (500): backend unavailable');
    return { text: 'Inbox checked: 2 new emails.', usage, finishReason: 'stop' } as LLMGenerateResult;
  },
};

describe('Scheduled tasks run as team runs', () => {
  const realFetch = globalThis.fetch;
  let teamId: string;
  let escalationTeam: string;
  let dispatched: string[];

  before(async () => {
    globalThis.fetch = fakePostgrest as typeof fetch;
    const { handler } = await import('../lib/agent/worker-entry');
    setDefaultRunnerDepsForTests(deps);
    setRunDispatcherForTests(async (id) => {
      dispatched.push(id);
      await handler({ run_id: id }, { awsRequestId: `w-${dispatched.length}` });
      return true;
    });
  });
  beforeEach(async () => {
    failing = false;
    dispatched = [];
    resetTables(['supervisor_tasks', 'agent_runs', 'agent_sessions', 'agent_teams', 'team_workers', 'checkpoints', 'board_tasks', 'board_task_events', 'encrypted_secrets', 'run_events', 'mcp_profiles', 'context_profiles']);
    tables.encrypted_secrets.push({ tenant_id: TENANT, provider: 'gemini', updated_at: '2026-01-01', encrypted_payload: {} });
    teamId = (await createTeam(ctx, { name: 'Inbox team', llm: { provider: 'gemini' }, supervisor: { tools: ['contextcontrol_list_profiles'] } })).id;
    escalationTeam = (await createTeam(ctx, { name: 'Humans', llm: { provider: 'gemini' }, supervisor: { tools: [] } })).id;
  });
  after(() => {
    globalThis.fetch = realFetch;
    setRunDispatcherForTests(null);
    setDefaultRunnerDepsForTests(null);
  });

  test('a due one-off task runs exactly once (concurrent ticks) and completes with its result', async () => {
    const { task } = await scheduleTask(ctx, { title: 'Check inbox', instructions: 'Check my inbox', team_id: teamId, target_time: inAMinute() });
    assert.equal(task.next_run_at, task.target_time);
    makeDue(task.id);
    const [a, b] = await Promise.all([processDueTasks(), processDueTasks()]);
    assert.equal(a.length + b.length, 1, 'only one tick claims it');
    assert.equal(dispatched.length, 1);

    const row = tables.supervisor_tasks.find((t) => t.id === task.id)!;
    assert.equal(row.status, 'completed');
    assert.equal(row.last_status, 'ok');
    assert.equal(row.last_result, 'Inbox checked: 2 new emails.');
    assert.equal(row.next_run_at, null);
    const run = tables.agent_runs.find((r) => r.id === row.last_run_id)!;
    assert.equal(run.origin, 'task');
    assert.equal(run.task_id, task.id);
    assert.equal(run.status, 'done');
    const { runs } = await taskHistory(ctx, task.id);
    assert.equal(runs[0].message, 'Inbox checked: 2 new emails.');
    assert.ok(row.session_id, 'the task has its own instance');
  });

  test('a repeating task advances to its next occurrence and stays scheduled', async () => {
    const { task } = await scheduleTask(ctx, {
      title: 'Every 15 min',
      instructions: 'Check',
      team_id: teamId,
      schedule: { mode: 'interval', every: 15, unit: 'minutes', timezone: 'UTC' },
    });
    assert.equal(upcomingRuns(task, 3).length, 3);
    makeDue(task.id);
    await processDueTasks();
    const row = tables.supervisor_tasks.find((t) => t.id === task.id)!;
    assert.equal(row.status, 'scheduled');
    assert.equal(row.last_status, 'ok');
    assert.ok(new Date(row.next_run_at).getTime() > Date.now() + 10 * 60_000);
    assert.equal(row.run_count, 1);
  });

  test('failures retry, then escalate to the Supervisor Board as an urgent task', async () => {
    failing = true;
    const { task } = await scheduleTask(ctx, { title: 'Send report', instructions: 'Email the weekly report', team_id: teamId, target_time: inAMinute(), max_retries: 1 });
    tables.supervisor_tasks.find((t) => t.id === task.id)!.escalation_team_id = escalationTeam;

    makeDue(task.id);
    await processDueTasks();
    let row = tables.supervisor_tasks.find((t) => t.id === task.id)!;
    assert.equal(row.status, 'scheduled', 'retry scheduled');
    assert.equal(row.attempt, 1);
    assert.equal(row.last_status, 'error');
    assert.match(row.last_error, /Gmail API error/);
    assert.ok(new Date(row.next_run_at).getTime() > Date.now() + 4 * 60_000, 'retries after the delay');
    assert.equal(tables.board_tasks.length, 0);

    makeDue(task.id);
    await processDueTasks();
    row = tables.supervisor_tasks.find((t) => t.id === task.id)!;
    assert.equal(row.status, 'escalated');
    assert.equal(row.last_status, 'escalated');
    const board = tables.board_tasks[0];
    assert.equal(board.priority, 'urgent');
    assert.equal(board.assigned_team_id, escalationTeam);
    assert.match(board.title, /Scheduled task failed: Send report/);
    assert.match(board.description, /Gmail API error/);
  });

  test('an occurrence is skipped while the previous run is still going', async () => {
    const { task } = await scheduleTask(ctx, {
      title: 'Long one',
      instructions: 'Work',
      team_id: teamId,
      schedule: { mode: 'interval', every: 15, unit: 'minutes', timezone: 'UTC' },
    });
    makeDue(task.id);
    await processDueTasks();
    const row = tables.supervisor_tasks.find((t) => t.id === task.id)!;
    // Simulate the previous run still running in the task's instance.
    tables.agent_runs.push({ id: crypto.randomUUID(), tenant_id: TENANT, session_id: row.session_id, origin: 'task', status: 'running', lease_owner: 'w', lease_expires_at: new Date(Date.now() + 600_000).toISOString(), created_at: new Date().toISOString(), invocations: 1, caller: ctx, input_message: 'x' });
    makeDue(task.id);
    await processDueTasks();
    assert.equal(tables.supervisor_tasks.find((t) => t.id === task.id)!.last_status, 'skipped');
  });

  test('agents schedule for their own team; a team is required otherwise; other orgs are rejected', async () => {
    const teamCtx = { ...ctx, authMode: 'webhook_signature' as const, userId: 'heartbeat', teamId };
    const res: any = await executePlatformTool('contextcontrol_schedule_task', { title: 'Follow up', instructions: 'Follow up on invoices', target_time: inAMinute() }, teamCtx);
    assert.equal(res.task.team_id, teamId);
    await assert.rejects(executePlatformTool('contextcontrol_schedule_task', { title: 'x', instructions: 'y', target_time: inAMinute() }, ctx), /team_id is required/);
    await assert.rejects(scheduleTask({ ...ctx, tenantId: OTHER }, { title: 'x', instructions: 'y', team_id: teamId, target_time: inAMinute() }), /not found/i);
    await assert.rejects(executePlatformTool('contextcontrol_schedule_task', { title: 'x', instructions: 'y', team_id: teamId }, ctx), /exactly one of target_time/);
  });

  test('run now, pause/resume and cancel', async () => {
    const { task } = await scheduleTask(ctx, { title: 'Daily', instructions: 'Do it', team_id: teamId, schedule: { mode: 'interval', every: 1, unit: 'days', timezone: 'UTC' } });
    const before = tables.supervisor_tasks.find((t) => t.id === task.id)!.next_run_at;
    const { run_id } = await runTaskNow(ctx, task.id);
    assert.ok(run_id);
    assert.equal(tables.supervisor_tasks.find((t) => t.id === task.id)!.next_run_at, before, 'run now keeps the schedule');

    const paused = await setTaskPaused(ctx, task.id, true);
    assert.equal(paused.task.next_run_at, null);
    assert.deepEqual(upcomingRuns(paused.task), []);
    const resumed = await setTaskPaused(ctx, task.id, false);
    assert.ok(resumed.task.next_run_at);

    const cancelled = await cancelTask(ctx, { task_id: task.id });
    assert.equal(cancelled.task.status, 'cancelled');
    await assert.rejects(runTaskNow(ctx, task.id), /cancelled/);
    await assert.rejects(runTaskNow({ tenantId: OTHER }, task.id), /not found/i);
  });

  test('calendar shows task occurrences, heartbeats and board due dates; routes need a session', async () => {
    await scheduleTask(ctx, { title: 'Hourly', instructions: 'x', team_id: teamId, schedule: { mode: 'interval', every: 1, unit: 'hours', timezone: 'UTC' } });
    const hb = tables.agent_teams.find((t) => t.id === teamId)!;
    Object.assign(hb, { heartbeat_enabled: true, heartbeat_schedule: { mode: 'interval', every: 6, unit: 'hours', timezone: 'UTC' } });
    tables.board_tasks.push({ id: crypto.randomUUID(), tenant_id: TENANT, title: 'Quarterly review', status: 'open', due_at: new Date(Date.now() + 86_400_000).toISOString(), assigned_team_id: null });

    const from = new Date();
    const to = new Date(Date.now() + 2 * 86_400_000);
    const { items } = await calendarItems(ctx, from, to);
    const kinds = new Set(items.map((i) => i.kind));
    assert.ok(kinds.has('task') && kinds.has('heartbeat') && kinds.has('board_due'));
    assert.ok(items.filter((i) => i.kind === 'task').length >= 40, 'hourly occurrences over two days');
    const beats = items.filter((i) => i.kind === 'heartbeat');
    assert.ok(beats.length <= 3, 'heartbeats are one item per team per day');
    assert.ok(beats.reduce((n, b) => n + (b.count ?? 0), 0) >= 7, 'with the number of runs that day');
    assert.equal((await calendarItems({ tenantId: OTHER }, from, to)).items.length, 0);

    const prev = { a: process.env.DEMO_MODE, b: process.env.NEXT_PUBLIC_DEMO_MODE };
    process.env.DEMO_MODE = 'false';
    process.env.NEXT_PUBLIC_DEMO_MODE = 'false';
    try {
      assert.equal((await LIST_TASKS(new NextRequest(`https://app.test/api/v1/tasks?tenant_id=${TENANT}`))).status, 401);
    } finally {
      process.env.DEMO_MODE = prev.a;
      process.env.NEXT_PUBLIC_DEMO_MODE = prev.b;
    }
  });
});
