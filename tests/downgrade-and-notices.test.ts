import assert from 'assert';
import { test, describe, before, after, beforeEach } from 'node:test';
import { fakePostgrest, resetTables, tables } from './helpers/fake-postgrest';
import { forgetPlan, forgetPlatformCapacity } from '../lib/services/plan-limits';
import { activation, keepActive, pausedResources } from '../lib/services/plan-activation';
import { noticesFor, sendBillingNotices } from '../lib/services/billing-notices';
import { isLimitError } from '../lib/services/errors';
import { createSession } from '../lib/services/agent-sessions';
import { startRun } from '../lib/services/agent-runs';
import { processDueTasks } from '../lib/services/scheduled-tasks';

const TENANT = 'abababab-abab-4bab-8bab-abababababab';
const USER = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2';
const ctx = { tenantId: TENANT, userId: USER, authMode: 'session' as const, role: 'owner' as const, scopes: ['*'] };
const DAY = 86_400_000;

function setPlan(plan: string, extra: Record<string, unknown> = {}) {
  tables.entitlements = tables.entitlements.filter((e) => e.tenant_id !== TENANT);
  tables.entitlements.push({ tenant_id: TENANT, plan_tier: plan, billing_status: plan === 'free' ? 'free' : 'active', status: 'active', ...extra });
  forgetPlan();
}

describe('Downgrades pause what exceeds the plan (nothing is deleted); billing notices are sent once', () => {
  const realFetch = globalThis.fetch;
  before(() => {
    globalThis.fetch = fakePostgrest as typeof fetch;
  });
  after(() => {
    globalThis.fetch = realFetch;
  });
  beforeEach(() => {
    resetTables([
      'organizations', 'entitlements', 'trial_grants', 'usage_counters', 'usage_events', 'agent_sessions', 'agent_teams', 'supervisor_tasks',
      'resource_activation', 'billing_notices', 'agent_runs', 'platform_settings', 'run_events', 'checkpoints', 'encrypted_secrets', 'llm_providers',
    ]);
    tables.organizations.push({ id: TENANT, name: 'Downgraded', llm_settings: {} });
    tables.encrypted_secrets.push({ tenant_id: TENANT, provider: 'gemini', updated_at: '2026-10-23', encrypted_payload: {} });
    forgetPlan();
    forgetPlatformCapacity();
  });

  test('after a downgrade the oldest agents stay active, the rest are paused and cannot run; nothing is deleted', async () => {
    setPlan('developer');
    const agents = [];
    for (let i = 0; i < 5; i++) agents.push(await createSession(ctx, { name: `Agent ${i}`, allowed_tools: [] }));
    setPlan('free'); // Free allows 3 agents

    const { items } = await activation(TENANT, 'agents');
    assert.deepEqual(items.filter((i) => i.active).map((i) => i.name), ['Agent 0', 'Agent 1', 'Agent 2']);
    assert.equal(tables.agent_sessions.length, 5, 'nothing deleted');

    const err = await startRun(ctx, agents[4].id, 'hi').catch((e) => e);
    assert.ok(isLimitError(err));
    assert.equal(err.reason, 'RESOURCE_PAUSED');
    assert.equal(err.statusCode, 402);
    assert.match(err.message, /Free allows 3 active agents/);

    // The organization keeps Agent 4 instead: the newest unpinned active one (Agent 2) pauses.
    await keepActive(ctx, 'agents', agents[4].id);
    const after = await pausedResources(TENANT);
    assert.deepEqual(after[0].paused.map((i) => i.name).sort(), ['Agent 2', 'Agent 3']);
    assert.ok(!isLimitError(await startRun(ctx, agents[4].id, 'hi').catch((e) => e)));

    // Upgrading reactivates everything, with no change to the data.
    setPlan('developer');
    assert.deepEqual(await pausedResources(TENANT), []);
  });

  test('a scheduled task beyond the plan is skipped (skipped_plan), keeps its schedule and is not deleted', async () => {
    setPlan('free'); // Free allows 2 scheduled items
    const past = new Date(Date.now() - 60_000).toISOString();
    for (let i = 0; i < 3; i++) {
      tables.supervisor_tasks.push({
        id: `0000000${i}-0000-4000-8000-000000000000`, tenant_id: TENANT, title: `Task ${i}`, status: 'scheduled', paused: false,
        schedule: { mode: 'interval', every: 60, unit: 'minutes', timezone: 'UTC' }, next_run_at: i === 2 ? past : new Date(Date.now() + DAY).toISOString(),
        created_at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), run_count: 0,
      });
    }
    const out = await processDueTasks();
    assert.equal(out.length, 1);
    assert.equal(out[0].run_id, null, 'no run started');
    const task = tables.supervisor_tasks.find((t) => t.title === 'Task 2')!;
    assert.equal(task.last_status, 'skipped_plan');
    assert.match(task.last_error, /paused by your plan/);
    assert.equal(task.status, 'scheduled');
    assert.equal(tables.agent_runs.length, 0);
  });

  test('trial and quota notices are emailed to owners once per period', async () => {
    const now = new Date('2026-10-20T12:00:00Z');
    const endsAt = new Date(now.getTime() + DAY).toISOString();
    setPlan('free', { trial_tier: 'developer', trial_started_at: new Date(now.getTime() - 6 * DAY).toISOString(), trial_ends_at: endsAt });
    // 2,600 of Developer's 3,000 runs this month (87%).
    for (let i = 0; i < 2600; i++) tables.agent_runs.push({ id: `r${i}`, tenant_id: TENANT, status: 'done', created_at: '2026-10-05T00:00:00.000Z' });
    tables.agent_runs.push({ id: 'recent', tenant_id: TENANT, status: 'done', created_at: new Date(now.getTime() - 60_000).toISOString() });

    const sent: Array<{ to: string[]; subject: string }> = [];
    const deps = { send: async (to: string[], subject: string) => (sent.push({ to, subject }), true), recipients: async () => ['owner@example.com'] };
    const first = await sendBillingNotices('https://app.example', now, deps);
    assert.equal(first.sent, 2);
    assert.deepEqual(sent.map((s) => s.subject).sort(), ["You've used 80% of your agent runs this month", 'Your Developer trial ends tomorrow']);
    assert.deepEqual(sent[0].to, ['owner@example.com']);

    const again = await sendBillingNotices('https://app.example', new Date(now.getTime() + 600_000), deps);
    assert.equal(again.sent, 0, 'never twice');
    assert.equal(tables.billing_notices.length, 2);

    // After the trial: an "ended" notice that names what the plan pauses.
    const later = new Date(new Date(endsAt).getTime() + 3_600_000);
    const notices = await noticesFor(TENANT, 'https://app.example', later);
    const ended = notices.find((n) => n.kind === 'trial_ended')!;
    assert.match(ended.text, /on Free now; nothing was deleted/);
    assert.match(ended.text, /https:\/\/app\.example\/dashboard\?billing=open/);
  });

  test('a notice that could not be emailed is released and retried on the next run', async () => {
    const now = new Date('2026-10-20T12:00:00Z');
    setPlan('free', { trial_tier: 'developer', trial_started_at: now.toISOString(), trial_ends_at: new Date(now.getTime() + DAY).toISOString() });
    const failing = { send: async () => Promise.reject(new Error('SES down')), recipients: async () => ['owner@example.com'] };
    assert.deepEqual(await sendBillingNotices('https://app.example', now, failing), { sent: 0, failed: 1 });
    assert.equal(tables.billing_notices.length, 0);
    const ok = { send: async () => true, recipients: async () => ['owner@example.com'] };
    assert.equal((await sendBillingNotices('https://app.example', now, ok)).sent, 1);
  });
});
