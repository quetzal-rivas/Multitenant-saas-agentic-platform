import assert from 'assert';
import { test, describe, before, after, beforeEach } from 'node:test';
import { fakePostgrest, resetTables, tables } from './helpers/fake-postgrest';
import {
  assertCanStoreSecret,
  consumeApiRequest,
  effectivePlan,
  forgetPlan,
  forgetPlatformCapacity,
  grantTrial,
  initializeEntitlement,
  resolvePlan,
  SCHEDULE_SLOT_STATUSES,
  usageSummary,
} from '../lib/services/plan-limits';
import { PLANS } from '../lib/billing/plans';
import { LimitError, isLimitError } from '../lib/services/errors';
import { errorResponse } from '../lib/http/route-errors';
import { createSession } from '../lib/services/agent-sessions';
import { createTeam } from '../lib/services/teams';
import { providerChain } from '../lib/services/llm-providers';
import { startRun } from '../lib/services/agent-runs';

const TENANT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ctx = { tenantId: TENANT, userId: 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', authMode: 'session' as const, role: 'owner' as const, scopes: ['*'] };
const DAY = 86_400_000;
const keys: Record<string, string> = { gemini: 'g-key', xai: 'x-key' };
const getSecret = async (_t: string, name: string) => keys[name] ?? null;

/** Put the organization on a plan (optionally with a running trial or custom limits). */
function setPlan(tenantId: string, plan: string, extra: Record<string, unknown> = {}) {
  tables.entitlements = tables.entitlements.filter((e) => e.tenant_id !== tenantId);
  tables.entitlements.push({ tenant_id: tenantId, plan_tier: plan, billing_status: plan === 'free' ? 'free' : 'active', status: 'active', ...extra });
  forgetPlan();
}

const reason = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    if (isLimitError(err)) return err.reason;
    throw err;
  }
  return 'ok';
};

describe('Plans: resolution, trials, limits and quotas', () => {
  const realFetch = globalThis.fetch;
  before(() => {
    globalThis.fetch = fakePostgrest as typeof fetch;
  });
  after(() => {
    globalThis.fetch = realFetch;
  });
  beforeEach(() => {
    resetTables([
      'organizations', 'entitlements', 'trial_grants', 'usage_counters', 'usage_events', 'agent_sessions', 'agent_teams',
      'team_workers', 'encrypted_secrets', 'llm_providers', 'agent_runs', 'platform_settings', 'run_events', 'checkpoints',
    ]);
    tables.organizations.push({ id: TENANT, name: 'Acme', llm_settings: {} }, { id: OTHER, name: 'Other', llm_settings: {} });
    for (const name of Object.keys(keys)) tables.encrypted_secrets.push({ tenant_id: TENANT, provider: name, updated_at: '2026-10-23', encrypted_payload: {} });
    forgetPlan();
    forgetPlatformCapacity();
  });

  test('the effective plan comes from the base plan, a running higher trial and the billing status', () => {
    const now = new Date('2026-10-23T12:00:00Z');
    const row = (extra: Record<string, unknown>) => ({ plan_tier: 'free', billing_status: 'free', grace_ends_at: null, trial_tier: null, trial_started_at: null, trial_ends_at: null, custom_limits: null, ...extra }) as any;
    const trial = { trial_tier: 'developer', trial_started_at: now.toISOString(), trial_ends_at: new Date(now.getTime() + 7 * DAY).toISOString() };

    assert.equal(resolvePlan(TENANT, row(trial), now).plan, 'developer');
    assert.equal(resolvePlan(TENANT, row(trial), new Date(now.getTime() + 7 * DAY + 1)).plan, 'free', 'the trial ends on the server clock, no job needed');
    assert.equal(resolvePlan(TENANT, row({ plan_tier: 'pro', billing_status: 'active', ...trial }), now).plan, 'pro', 'a trial never lowers the plan');
    assert.equal(resolvePlan(TENANT, row({ plan_tier: 'starter', billing_status: 'active' }), now).plan, 'developer', 'legacy tier name');
    assert.equal(resolvePlan(TENANT, row({ plan_tier: 'pro', billing_status: 'canceled' }), now).plan, 'free');
    const grace = new Date(now.getTime() + DAY).toISOString();
    assert.equal(resolvePlan(TENANT, row({ plan_tier: 'pro', billing_status: 'past_due', grace_ends_at: grace }), now).plan, 'pro', 'in the grace period');
    assert.equal(resolvePlan(TENANT, row({ plan_tier: 'pro', billing_status: 'past_due', grace_ends_at: grace }), new Date(now.getTime() + 2 * DAY)).plan, 'free');

    const custom = resolvePlan(TENANT, row({ plan_tier: 'enterprise', billing_status: 'active', custom_limits: { agents: 1000, concurrent_runs: 500, bogus: 5 } }), now);
    assert.equal(custom.limits.agents, 1000, 'custom limits apply');
    assert.equal(custom.limits.concurrent_runs, 25, 'hard platform ceilings still apply');
    assert.equal(resolvePlan(TENANT, row({}), now).features.voice_telephony, false);
  });

  test('a new organization gets Free plus exactly 7 days of Developer, once', async () => {
    const t0 = new Date();
    await initializeEntitlement(TENANT, t0);
    const p = await effectivePlan(TENANT);
    assert.equal(p.basePlan, 'free');
    assert.equal(p.plan, 'developer');
    assert.equal(new Date(p.trial!.endsAt).getTime() - new Date(p.trial!.startedAt).getTime(), 7 * DAY);

    await initializeEntitlement(TENANT, new Date(t0.getTime() + 3 * DAY));
    assert.equal(tables.trial_grants.length, 1, 'signing in again or re-running onboarding grants nothing');
    assert.equal(await grantTrial(TENANT, 'developer', 'retry'), false);
    assert.equal(tables.entitlements.length, 1);
  });

  test('chained trials: buying Developer grants Pro once, buying Pro grants Unlimited once', async () => {
    setPlan(TENANT, 'developer');
    assert.equal(await grantTrial(TENANT, 'pro', 'purchase:developer'), true);
    assert.equal((await effectivePlan(TENANT)).plan, 'pro');
    setPlan(TENANT, 'pro', { trial_tier: 'pro', trial_started_at: new Date().toISOString(), trial_ends_at: new Date(Date.now() + 7 * DAY).toISOString() });
    assert.equal(await grantTrial(TENANT, 'unlimited', 'purchase:pro'), true);
    assert.equal((await effectivePlan(TENANT)).plan, 'unlimited');
    assert.equal(await grantTrial(TENANT, 'pro', 'purchase:developer'), false, 'cancel and re-buy does not grant again');
    assert.deepEqual(tables.trial_grants.map((g) => g.tier).sort(), ['pro', 'unlimited']);
  });

  test('creation limits: the item after the limit is refused with 402 and the plan in the message', async () => {
    setPlan(TENANT, 'free');
    for (let i = 0; i < PLANS.free.limits.agents; i++) await createSession(ctx, { name: `Agent ${i}`, allowed_tools: [] });
    const err = await createSession(ctx, { name: 'One too many', allowed_tools: [] }).catch((e) => e);
    assert.ok(err instanceof LimitError);
    assert.equal(err.reason, 'RESOURCE_LIMIT_REACHED');
    assert.equal(err.statusCode, 402);
    assert.match(err.message, /limit of 3 agents on the Free plan/);
    const res = errorResponse(err, 'test');
    assert.equal(res.status, 402);
    assert.deepEqual(await res.json(), { error: err.message, code: 'RESOURCE_LIMIT_REACHED', limit_key: 'agents', limit: 3, used: 3, plan: 'free', upgrade: true });

    // Limits are per organization.
    setPlan(OTHER, 'free');
    tables.encrypted_secrets.push({ tenant_id: OTHER, provider: 'gemini', updated_at: '2026-10-23', encrypted_payload: {} });
    await createSession({ ...ctx, tenantId: OTHER }, { name: 'Elsewhere', allowed_tools: [] });
    assert.ok(tables.usage_events.some((e) => e.kind === 'limit_reached' && e.tenant_id === TENANT));
  });

  test('a team must fit the plan: workers per team and an enabled heartbeat counts as a schedule', async () => {
    setPlan(TENANT, 'free');
    const worker = (n: number) => ({ name: `Worker ${n}`, role: 'Helps', tools: [] });
    const team = (workers: number) => ({ name: `Team ${workers}`, llm: { mode: 'auto' as const }, supervisor: { tools: [] }, workers: Array.from({ length: workers }, (_, i) => worker(i)) });
    assert.equal(await reason(createTeam(ctx, team(4))), 'RESOURCE_LIMIT_REACHED');
    await createTeam(ctx, team(3));
    assert.equal(await reason(createTeam(ctx, team(1))), 'RESOURCE_LIMIT_REACHED', 'Free has one team');
  });

  test('Free runs on the organization order with one provider; Developer picks per agent; Pro falls back', async () => {
    setPlan(TENANT, 'free');
    assert.equal(await reason(createSession(ctx, { name: 'Picky', provider: 'xai', allowed_tools: [] })), 'FEATURE_NOT_INCLUDED');
    let chain = await providerChain(TENANT, { provider: 'xai', model: null, mode: 'locked' }, { getSecret });
    assert.deepEqual(chain.map((c) => c.def.id), ['gemini'], 'a locked agent from a trial runs on the organization order on Free');

    setPlan(TENANT, 'developer');
    chain = await providerChain(TENANT, { provider: 'xai', model: null, mode: 'preferred' }, { getSecret });
    assert.deepEqual(chain.map((c) => c.def.id), ['xai'], 'no fallback on Developer');

    setPlan(TENANT, 'pro');
    chain = await providerChain(TENANT, { provider: 'xai', model: null, mode: 'preferred' }, { getSecret });
    assert.deepEqual(chain.map((c) => c.def.id), ['xai', 'gemini']);
  });

  test('credentials: Free keeps one AI key and no voice credentials; replacing a stored key is fine', async () => {
    setPlan(TENANT, 'free');
    tables.encrypted_secrets = tables.encrypted_secrets.filter((s) => s.provider === 'gemini');
    assert.equal(await reason(assertCanStoreSecret(TENANT, 'gemini')), 'ok');
    assert.equal(await reason(assertCanStoreSecret(TENANT, 'openai')), 'RESOURCE_LIMIT_REACHED');
    assert.equal(await reason(assertCanStoreSecret(TENANT, 'llm:deepseek')), 'RESOURCE_LIMIT_REACHED');
    assert.equal(await reason(assertCanStoreSecret(TENANT, 'elevenlabs')), 'FEATURE_NOT_INCLUDED');
    assert.equal(await reason(assertCanStoreSecret(TENANT, 'twilio')), 'FEATURE_NOT_INCLUDED');
    setPlan(TENANT, 'developer');
    assert.equal(await reason(assertCanStoreSecret(TENANT, 'elevenlabs')), 'ok');
  });

  test('API and MCP requests: monthly quota and per-minute rate, counted atomically', async () => {
    setPlan(TENANT, 'free', { custom_limits: { api_ops_month: 5, api_rpm: 100 } });
    const now = new Date('2026-10-23T10:00:00Z');
    const results = await Promise.all(Array.from({ length: 9 }, () => reason(consumeApiRequest(TENANT, now))));
    assert.equal(results.filter((r) => r === 'ok').length, 5, 'never past the limit under concurrency');
    assert.ok(results.slice(5).every((r) => r === 'MONTHLY_QUOTA_EXCEEDED'));
    assert.equal(await reason(consumeApiRequest(TENANT, new Date('2026-11-01T00:00:00Z'))), 'ok', 'the quota resets on the 1st (UTC)');

    setPlan(OTHER, 'free', { custom_limits: { api_rpm: 2 } });
    const minute = new Date('2026-10-23T10:05:00Z');
    assert.equal(await reason(consumeApiRequest(OTHER, minute)), 'ok');
    assert.equal(await reason(consumeApiRequest(OTHER, minute)), 'ok');
    assert.equal(await reason(consumeApiRequest(OTHER, minute)), 'RATE_LIMITED');
    assert.equal(await reason(consumeApiRequest(OTHER, new Date('2026-10-23T10:06:00Z'))), 'ok');
  });

  test('runs: monthly quota, and the platform switch and capacity refuse new runs', async () => {
    setPlan(TENANT, 'pro', { custom_limits: { runs_month: 1 } });
    const s1 = await createSession(ctx, { name: 'One', allowed_tools: [] });
    const s2 = await createSession(ctx, { name: 'Two', allowed_tools: [] });
    const run = await startRun(ctx, s1.id, 'hi');
    tables.agent_runs.find((r) => r.id === run.id)!.status = 'done';
    const quota = await startRun(ctx, s2.id, 'hi').catch((e) => e);
    assert.equal(quota.reason, 'MONTHLY_QUOTA_EXCEEDED');
    assert.match(quota.message, /1 agent runs this month on the Pro plan/);

    setPlan(TENANT, 'pro');
    tables.platform_settings.push({ key: 'runs_paused', value: 'true' });
    const paused = await startRun(ctx, s2.id, 'hi').catch((e) => e);
    assert.equal(paused.reason, 'INFRASTRUCTURE_CAPACITY_LIMIT');
    assert.equal(paused.statusCode, 503);
    assert.equal(paused.details.upgrade, false);

    tables.platform_settings = [{ key: 'max_concurrent_runs', value: '1' }];
    forgetPlatformCapacity();
    tables.agent_runs.push({ id: 'busy-elsewhere', tenant_id: OTHER, session_id: 'x', status: 'running', created_at: new Date().toISOString() });
    assert.equal((await startRun(ctx, s2.id, 'hi').catch((e) => e)).reason, 'INFRASTRUCTURE_CAPACITY_LIMIT');
  });

  test('the usage summary reports plan, trial, limits and what is used', async () => {
    await initializeEntitlement(TENANT);
    await createSession(ctx, { name: 'Counted', allowed_tools: [] });
    await consumeApiRequest(TENANT);
    const u = await usageSummary(TENANT);
    assert.equal(u.plan, 'developer');
    assert.equal(u.base_plan, 'free');
    assert.ok(u.trial);
    assert.equal(u.used.agents, 1);
    assert.equal(u.used.api_ops_month, 1);
    assert.equal(u.limits.agents, PLANS.developer.limits.agents);
  });
});

// The fake database does not check enums; this keeps the counter's filter valid for Postgres.
test('the schedules counter only filters on real task_status values', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const dir = path.join(__dirname, '..', 'supabase', 'migrations');
  const sql = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  const values = new Set<string>();
  for (const m of sql.matchAll(/CREATE TYPE task_status AS ENUM \(([^)]*)\)/g)) for (const v of m[1].matchAll(/'([^']+)'/g)) values.add(v[1]);
  for (const m of sql.matchAll(/ALTER TYPE task_status ADD VALUE IF NOT EXISTS '([^']+)'/g)) values.add(m[1]);
  assert.ok(values.size > 0, 'task_status enum not found in migrations');
  for (const s of SCHEDULE_SLOT_STATUSES) assert.ok(values.has(s), `"${s}" is not a task_status value`);
});
