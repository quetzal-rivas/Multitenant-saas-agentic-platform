import { getSupabaseAdminClient } from '@/lib/supabase';
import {
  HARD_LIMITS,
  LIMIT_LABELS,
  PLANS,
  SIGNUP_TRIAL,
  TRIAL_DAYS,
  planRank,
  type LimitKey,
  type PlanFeatures,
  type PlanId,
} from '@/lib/billing/plans';
import { BUILT_IN_IDS } from '@/lib/agent/providers/registry';
import { LimitError } from './errors';

/**
 * The plan an organization is on right now and the limits that follow from it. Resolved on
 * the server from timestamps (no job or login needed for a trial to end), always for the
 * organization of the authenticated credential, never from anything the client sends.
 */
export interface EffectivePlan {
  tenantId: string;
  /** What applies now: the base plan, or a higher running trial. */
  plan: PlanId;
  /** The contracted plan (free unless a paid subscription is active or in its grace period). */
  basePlan: PlanId;
  billingStatus: 'free' | 'active' | 'past_due' | 'canceled';
  trial: { tier: PlanId; startedAt: string; endsAt: string } | null;
  limits: Record<LimitKey, number>;
  features: PlanFeatures;
}

interface EntitlementRow {
  plan_tier: PlanId | 'starter' | null;
  billing_status: EffectivePlan['billingStatus'] | null;
  grace_ends_at: string | null;
  trial_tier: PlanId | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  custom_limits: Partial<Record<LimitKey, number>> | null;
}

const ENTITLEMENT_COLUMNS = 'plan_tier, billing_status, grace_ends_at, trial_tier, trial_started_at, trial_ends_at, custom_limits';

/**
 * Plan for an organization without an entitlement row. Every organization gets one when it is
 * created (and the plans migration backfilled existing ones), so this is Free in production;
 * test suites that predate plans run as Unlimited.
 */
let planWithoutEntitlement: PlanId = 'free';
export function setPlanWithoutEntitlementForTests(plan: PlanId | null) {
  planWithoutEntitlement = plan ?? 'free';
  cache.clear();
}

/** Pure resolution, so tests can move the clock. */
export function resolvePlan(tenantId: string, row: EntitlementRow | null, now = new Date()): EffectivePlan {
  const t = now.getTime();
  let basePlan: PlanId = !row ? planWithoutEntitlement : row.plan_tier === 'starter' ? 'developer' : ((row.plan_tier as PlanId) ?? 'free');
  if (!PLANS[basePlan]) basePlan = 'free';
  const billingStatus = row?.billing_status ?? 'free';
  // A failed payment keeps the paid plan only until the grace period ends; never longer.
  if (billingStatus === 'canceled' || (billingStatus === 'past_due' && (!row?.grace_ends_at || new Date(row.grace_ends_at).getTime() <= t))) {
    basePlan = 'free';
  }
  const trialActive =
    !!row?.trial_tier && !!row.trial_ends_at && new Date(row.trial_ends_at).getTime() > t && planRank(row.trial_tier) > planRank(basePlan);
  const plan: PlanId = trialActive ? row!.trial_tier! : basePlan;

  const limits = { ...PLANS[plan].limits };
  for (const [k, v] of Object.entries(row?.custom_limits ?? {})) {
    if (k in limits && typeof v === 'number' && Number.isFinite(v) && v >= 0) limits[k as LimitKey] = v;
  }
  for (const [k, v] of Object.entries(HARD_LIMITS)) limits[k as LimitKey] = Math.min(limits[k as LimitKey], v!);

  return {
    tenantId,
    plan,
    basePlan,
    billingStatus,
    trial: trialActive ? { tier: row!.trial_tier!, startedAt: row!.trial_started_at!, endsAt: row!.trial_ends_at! } : null,
    limits,
    features: { ...PLANS[plan].features },
  };
}

// Short per-instance cache: plan lookups happen on every create and API request.
const CACHE_MS = 15_000;
const cache = new Map<string, { at: number; plan: EffectivePlan }>();
export function forgetPlan(tenantId?: string) {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

export async function effectivePlan(tenantId: string, now = new Date()): Promise<EffectivePlan> {
  const hit = cache.get(tenantId);
  if (hit && now.getTime() - hit.at < CACHE_MS && (!hit.plan.trial || new Date(hit.plan.trial.endsAt) > now)) return hit.plan;
  const { data } = await getSupabaseAdminClient().from('entitlements').select(ENTITLEMENT_COLUMNS).eq('tenant_id', tenantId).maybeSingle();
  const plan = resolvePlan(tenantId, (data as EntitlementRow | null) ?? null, now);
  cache.set(tenantId, { at: now.getTime(), plan });
  return plan;
}

// ---------------------------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------------------------

const upgradeHint = (p: EffectivePlan) =>
  p.plan === 'unlimited' || p.plan === 'enterprise' ? 'Contact us to raise it.' : 'Upgrade in Account & Billing to raise it.';

function planLabel(p: EffectivePlan) {
  return p.trial ? `${PLANS[p.plan].name} trial` : `${PLANS[p.plan].name} plan`;
}

export function limitReached(p: EffectivePlan, key: LimitKey, used: number): LimitError {
  const limit = p.limits[key];
  return new LimitError(
    `You have reached the limit of ${limit} ${LIMIT_LABELS[key]} on the ${planLabel(p)}. ${upgradeHint(p)}`,
    key.endsWith('_month') ? 'MONTHLY_QUOTA_EXCEEDED' : 'RESOURCE_LIMIT_REACHED',
    { limit_key: key, limit, used, plan: p.plan, upgrade: p.plan !== 'enterprise' }
  );
}

const FEATURE_TEXT: Record<keyof PlanFeatures, { what: string; from: PlanId }> = {
  per_agent_provider: { what: 'Choosing an AI provider per agent', from: 'developer' },
  provider_fallback: { what: 'Provider fallback and rotation', from: 'pro' },
  voice_telephony: { what: 'Phone calls and voice credentials (Twilio, ElevenLabs)', from: 'developer' },
  task_retries: { what: 'Automatic retries of scheduled tasks', from: 'developer' },
};

export async function assertFeature(tenantId: string, feature: keyof PlanFeatures): Promise<EffectivePlan> {
  const p = await effectivePlan(tenantId);
  if (!p.features[feature]) {
    const f = FEATURE_TEXT[feature];
    throw new LimitError(`${f.what} is included from the ${PLANS[f.from].name} plan; you are on the ${planLabel(p)}. Upgrade in Account & Billing.`, 'FEATURE_NOT_INCLUDED', {
      limit_key: feature,
      plan: p.plan,
      upgrade: true,
    });
  }
  return p;
}

// ---------------------------------------------------------------------------------------------
// Counting active resources
// ---------------------------------------------------------------------------------------------

type Db = ReturnType<typeof getSupabaseAdminClient>;

async function countRows(build: (db: Db) => any): Promise<number> {
  const { count, error } = await build(getSupabaseAdminClient());
  if (error) throw new Error(`Could not count usage: ${error.message}`);
  return count ?? 0;
}

const exact = { count: 'exact' as const };

/** supervisor_tasks statuses that hold a schedule slot (task_status enum: waiting or in progress). */
export const SCHEDULE_SLOT_STATUSES = ['scheduled', 'active'] as const;

/** Active items of a resource. Monthly quotas are counted where they are consumed. */
export const RESOURCE_COUNTERS: Partial<Record<LimitKey, (tenantId: string) => Promise<number>>> = {
  agents: (t) => countRows((db) => db.from('agent_sessions').select('id', exact).eq('tenant_id', t).eq('agent_type', 'single').is('archived_at', null).limit(1)),
  teams: (t) => countRows((db) => db.from('agent_teams').select('id', exact).eq('tenant_id', t).is('archived_at', null).limit(1)),
  schedules: async (t) => {
    const [tasks, heartbeats] = await Promise.all([
      countRows((db) => db.from('supervisor_tasks').select('id', exact).eq('tenant_id', t).in('status', [...SCHEDULE_SLOT_STATUSES]).eq('paused', false).limit(1)),
      countRows((db) => db.from('agent_teams').select('id', exact).eq('tenant_id', t).eq('heartbeat_enabled', true).is('archived_at', null).limit(1)),
    ]);
    return tasks + heartbeats;
  },
  functions: (t) => countRows((db) => db.from('custom_functions').select('id', exact).eq('tenant_id', t).is('archived_at', null).limit(1)),
  context_profiles: (t) => countRows((db) => db.from('context_profiles').select('id', exact).eq('tenant_id', t).is('archived_at', null).limit(1)),
  mcp_profiles: (t) => countRows((db) => db.from('mcp_profiles').select('id', exact).eq('org_id', t).eq('is_active', true).limit(1)),
  api_keys: (t) => countRows((db) => db.from('mcp_api_keys').select('id', exact).eq('tenant_id', t).is('revoked_at', null).limit(1)),
  connections: (t) => countRows((db) => db.from('connections').select('id', exact).eq('tenant_id', t).eq('status', 'active').limit(1)),
  inbound_endpoints: (t) => countRows((db) => db.from('inbound_endpoints').select('id', exact).eq('tenant_id', t).is('archived_at', null).limit(1)),
  phone_numbers: (t) => countRows((db) => db.from('phone_numbers').select('id', exact).eq('tenant_id', t).eq('configured', true).limit(1)),
  llm_keys: async (t) => {
    const { data } = await getSupabaseAdminClient().from('encrypted_secrets').select('provider').eq('tenant_id', t);
    return (data || []).filter((r: { provider: string }) => isLlmSecretName(r.provider)).length;
  },
  members: async (t) => {
    const [members, invites] = await Promise.all([
      countRows((db) => db.from('organization_members').select('user_id', exact).eq('organization_id', t).limit(1)),
      countRows((db) => db.from('organization_invites').select('id', exact).eq('organization_id', t).is('accepted_at', null).is('revoked_at', null).limit(1)),
    ]);
    return members + invites;
  },
};

/** Stored secret names that hold AI provider keys (built-ins and an organization's own providers). */
export const isLlmSecretName = (name: string) => BUILT_IN_IDS.includes(name) || name.startsWith('llm:');

/**
 * Refuse creating one more item when the organization is at its limit. `adding` > 1 checks
 * room for several at once. Throws LimitError (402).
 */
export async function assertCanCreate(tenantId: string, key: LimitKey, adding = 1): Promise<EffectivePlan> {
  const p = await effectivePlan(tenantId);
  const counter = RESOURCE_COUNTERS[key];
  if (!counter) throw new Error(`No counter for ${key}`);
  const used = await counter(tenantId);
  if (used + adding > p.limits[key]) {
    await recordUsageEvent(tenantId, 'limit_reached', { key, used, limit: p.limits[key], plan: p.plan });
    throw limitReached(p, key, used);
  }
  return p;
}

// ---------------------------------------------------------------------------------------------
// API and MCP requests (monthly operations + per-minute rate, counted atomically)
// ---------------------------------------------------------------------------------------------

export const monthPeriod = (now = new Date()) => now.toISOString().slice(0, 7);
export const minutePeriod = (now = new Date()) => now.toISOString().slice(0, 16);

/** Count one external request (API key or client token). Throws LimitError when over quota or rate. */
export async function consumeApiRequest(tenantId: string, now = new Date()): Promise<void> {
  const p = await effectivePlan(tenantId, now);
  const { data, error } = await getSupabaseAdminClient().rpc('consume_api_request', {
    p_tenant: tenantId,
    p_month: monthPeriod(now),
    p_minute: minutePeriod(now),
    p_ops_limit: p.limits.api_ops_month,
    p_rpm_limit: p.limits.api_rpm,
  });
  if (error) {
    // Metering must not take the API down; the per-key in-memory limiter still applies.
    console.error('[plan-limits] consume_api_request failed', error.message);
    return;
  }
  const res = data as { outcome: string; used: number; limit: number };
  if (res.outcome === 'monthly_quota') throw limitReached(p, 'api_ops_month', res.used);
  if (res.outcome === 'rate_limited') {
    throw new LimitError(`Too many requests: ${res.limit} per minute on the ${planLabel(p)}. Slow down and retry in a minute.`, 'RATE_LIMITED', {
      limit_key: 'api_rpm',
      limit: res.limit,
      used: res.used,
      plan: p.plan,
      upgrade: p.plan !== 'enterprise',
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Usage summary (Account & Billing)
// ---------------------------------------------------------------------------------------------

export async function usageSummary(tenantId: string, now = new Date()) {
  const p = await effectivePlan(tenantId, now);
  const db = getSupabaseAdminClient();
  const monthStart = `${monthPeriod(now)}-01T00:00:00.000Z`;
  const entries = await Promise.all(
    (Object.keys(RESOURCE_COUNTERS) as LimitKey[]).map(async (k) => [k, await RESOURCE_COUNTERS[k]!(tenantId)] as const)
  );
  const [{ count: runs }, { data: ops }] = await Promise.all([
    db.from('agent_runs').select('id', exact).eq('tenant_id', tenantId).gte('created_at', monthStart).limit(1),
    db.from('usage_counters').select('used').eq('tenant_id', tenantId).eq('metric', 'api_ops').eq('period', monthPeriod(now)).maybeSingle(),
  ]);
  const used: Partial<Record<LimitKey, number>> = Object.fromEntries(entries);
  used.runs_month = runs ?? 0;
  used.api_ops_month = (ops as { used?: number } | null)?.used ?? 0;
  return {
    plan: p.plan,
    base_plan: p.basePlan,
    billing_status: p.billingStatus,
    trial: p.trial ? { tier: p.trial.tier, started_at: p.trial.startedAt, ends_at: p.trial.endsAt } : null,
    period: monthPeriod(now),
    resets_at: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
    limits: p.limits,
    used,
    features: p.features,
  };
}

// ---------------------------------------------------------------------------------------------
// Entitlements and trials
// ---------------------------------------------------------------------------------------------

export async function recordUsageEvent(tenantId: string, kind: string, detail: Record<string, unknown>) {
  await getSupabaseAdminClient()
    .from('usage_events')
    .insert({ tenant_id: tenantId, kind, detail })
    .then(
      () => undefined,
      () => undefined
    );
}

/**
 * Grant a 7-day trial of `tier`, once per organization and tier (trial_grants primary key).
 * A trial never lowers what is running: if a higher trial is active, the grant is recorded
 * but the running one is kept. Returns false when the tier was already granted before.
 */
export async function grantTrial(tenantId: string, tier: PlanId, reason: string, now = new Date()): Promise<boolean> {
  const db = getSupabaseAdminClient();
  const endsAt = new Date(now.getTime() + TRIAL_DAYS * 86_400_000).toISOString();
  const { error } = await db.from('trial_grants').insert({ tenant_id: tenantId, tier, granted_at: now.toISOString(), expires_at: endsAt, reason });
  if (error) {
    if (error.code === '23505') return false;
    throw new Error(`Could not record the trial: ${error.message}`);
  }
  await reconcileTrial(tenantId, now);
  await recordUsageEvent(tenantId, 'trial_granted', { tier, reason, ends_at: endsAt });
  return true;
}

/**
 * Set the running trial from the grants: the highest unexpired one above the base plan. A trial
 * earned by a purchase ("purchase:pro") only counts while that plan, or a higher one, is paid;
 * so cancelling or downgrading ends it, and an earlier trial still in its 7 days (the sign-up
 * one) applies again. Grants are never deleted, so no trial is ever granted twice.
 */
async function reconcileTrial(tenantId: string, now: Date) {
  const db = getSupabaseAdminClient();
  const ent = await loadEntitlement(tenantId);
  const base = (ent?.plan_tier ?? 'free') as PlanId;
  const paid = ent?.billing_status === 'active' || ent?.billing_status === 'past_due';
  const { data } = await db.from('trial_grants').select('tier, granted_at, expires_at, reason').eq('tenant_id', tenantId);
  const best = ((data || []) as Array<{ tier: PlanId; granted_at: string; expires_at: string; reason: string }>)
    .filter((g) => new Date(g.expires_at) > now && planRank(g.tier) > planRank(base))
    .filter((g) => !g.reason.startsWith('purchase:') || (paid && planRank(base) >= planRank(g.reason.slice('purchase:'.length) as PlanId)))
    .sort((a, b) => planRank(b.tier) - planRank(a.tier))[0];
  const trial = best
    ? { trial_tier: best.tier, trial_started_at: best.granted_at, trial_ends_at: best.expires_at }
    : { trial_tier: null, trial_started_at: null, trial_ends_at: null };
  if (ent && ent.trial_tier === trial.trial_tier && ent.trial_ends_at === trial.trial_ends_at) return;
  await db.from('entitlements').update({ ...trial, updated_at: now.toISOString() }).eq('tenant_id', tenantId);
  forgetPlan(tenantId);
}

async function loadEntitlement(tenantId: string): Promise<EntitlementRow | null> {
  const { data } = await getSupabaseAdminClient().from('entitlements').select(ENTITLEMENT_COLUMNS).eq('tenant_id', tenantId).maybeSingle();
  return (data as EntitlementRow | null) ?? null;
}

/**
 * A confirmed paid subscription (from the Stripe webhook). The plan becomes the base plan, and
 * the one-time trial of the next tier starts (Developer → 7 days of Pro, Pro → 7 days of
 * Unlimited). Trials are internal: they never create a charge or a subscription.
 */
export async function applyPaidPlan(
  tenantId: string,
  plan: PlanId,
  opts: { now?: Date; stripeCustomerId?: string | null; stripeSubscriptionId?: string | null; periodEndsAt?: string | null; cancelAt?: string | null } = {}
) {
  if (plan === 'free') throw new Error('Free is not a paid plan; use endPaidPlan.');
  const now = opts.now ?? new Date();
  const db = getSupabaseAdminClient();
  const fields = {
    plan_tier: plan,
    billing_status: 'active',
    grace_ends_at: null,
    status: 'active',
    ...(opts.stripeCustomerId ? { stripe_customer_id: opts.stripeCustomerId } : {}),
    ...(opts.stripeSubscriptionId ? { stripe_subscription_id: opts.stripeSubscriptionId } : {}),
    ...(opts.periodEndsAt ? { current_period_ends_at: opts.periodEndsAt } : {}),
    // Every subscription event says whether it is set to end; a resumed one clears it.
    ...(opts.cancelAt !== undefined ? { cancel_at: opts.cancelAt } : {}),
    updated_at: now.toISOString(),
  };
  const before = await loadEntitlement(tenantId);
  const { data } = await db.from('entitlements').update(fields).eq('tenant_id', tenantId).select('tenant_id');
  if (!data?.length) await db.from('entitlements').insert({ tenant_id: tenantId, ...fields });
  forgetPlan(tenantId);
  // Renewals repeat this call; only real changes are audited.
  if (before?.plan_tier !== plan || before?.billing_status !== 'active') await recordUsageEvent(tenantId, 'plan_changed', { plan, billing_status: 'active' });
  const next = PLANS[plan].trialOnPurchase;
  const trialGranted = next ? await grantTrial(tenantId, next, `purchase:${plan}`, now) : false;
  // A downgrade (Pro → Developer) ends the trial that came with the higher plan.
  if (!trialGranted) await reconcileTrial(tenantId, now);
  return { plan, trial: trialGranted ? next : null };
}

/** A failed renewal: the paid plan stays during a grace period, then the organization is Free. */
export async function markPastDue(tenantId: string, graceDays = 7, now = new Date()) {
  const graceEnds = new Date(now.getTime() + graceDays * 86_400_000).toISOString();
  await getSupabaseAdminClient().from('entitlements').update({ billing_status: 'past_due', grace_ends_at: graceEnds, updated_at: now.toISOString() }).eq('tenant_id', tenantId);
  forgetPlan(tenantId);
  await recordUsageEvent(tenantId, 'payment_failed', { grace_ends_at: graceEnds });
}

/**
 * The subscription ended: back to Free. Data is kept. Trials earned by the purchase end with it;
 * the sign-up trial keeps its own end date.
 */
export async function endPaidPlan(tenantId: string, now = new Date()) {
  await getSupabaseAdminClient()
    .from('entitlements')
    .update({ plan_tier: 'free', billing_status: 'canceled', grace_ends_at: null, cancel_at: null, updated_at: now.toISOString() })
    .eq('tenant_id', tenantId);
  forgetPlan(tenantId);
  await reconcileTrial(tenantId, now);
  await recordUsageEvent(tenantId, 'plan_changed', { plan: 'free', billing_status: 'canceled' });
}

/** A new organization: Free, plus the one-time sign-up trial. Idempotent. */
export async function initializeEntitlement(tenantId: string, now = new Date()) {
  const db = getSupabaseAdminClient();
  const { data } = await db.from('entitlements').select('tenant_id').eq('tenant_id', tenantId).maybeSingle();
  if (!data) {
    const { error } = await db.from('entitlements').insert({ tenant_id: tenantId, plan_tier: 'free', billing_status: 'free', status: 'active' });
    if (error && error.code !== '23505') throw new Error(`Could not create the plan: ${error.message}`);
  }
  await grantTrial(tenantId, SIGNUP_TRIAL, 'signup', now);
}

/** Voice and telephony credentials (stored per organization). */
const VOICE_SECRET_NAMES = new Set(['elevenlabs', 'twilio']);

/**
 * Before storing a credential: voice/telephony credentials need the voice feature, and a new
 * AI provider key counts toward llm_keys (replacing a stored key never does).
 */
export async function assertCanStoreSecret(tenantId: string, name: string): Promise<void> {
  if (VOICE_SECRET_NAMES.has(name)) {
    await assertFeature(tenantId, 'voice_telephony');
    return;
  }
  if (!isLlmSecretName(name)) return;
  const { data } = await getSupabaseAdminClient().from('encrypted_secrets').select('provider').eq('tenant_id', tenantId).eq('provider', name).limit(1);
  if (data?.length) return;
  await assertCanCreate(tenantId, 'llm_keys');
}

/** A size limit on one item (e.g. workers in a team), not a count of items. */
export async function assertWithinLimit(tenantId: string, key: LimitKey, value: number): Promise<void> {
  const p = await effectivePlan(tenantId);
  if (value > p.limits[key]) throw limitReached(p, key, value);
}

// ---------------------------------------------------------------------------------------------
// Platform capacity (separate from plans: protects the service as a whole)
// ---------------------------------------------------------------------------------------------

/** Default platform-wide cap on simultaneous agent runs; override with platform_settings 'max_concurrent_runs'. */
// New AWS accounts run at most 10 Lambdas at once (worker + AI functions): stay below until the quota is raised.
export const DEFAULT_PLATFORM_MAX_CONCURRENT_RUNS = Number(process.env.PLATFORM_MAX_CONCURRENT_RUNS || 8);

let capacityCache: { at: number; maxConcurrentRuns: number } | null = null;
export function forgetPlatformCapacity() {
  capacityCache = null;
}

export async function platformCapacity(): Promise<{ maxConcurrentRuns: number }> {
  if (capacityCache && Date.now() - capacityCache.at < 30_000) return capacityCache;
  const { data } = await getSupabaseAdminClient().from('platform_settings').select('value').eq('key', 'max_concurrent_runs').maybeSingle();
  const configured = Number((data as { value?: string } | null)?.value);
  capacityCache = { at: Date.now(), maxConcurrentRuns: Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_PLATFORM_MAX_CONCURRENT_RUNS };
  return capacityCache;
}

export function platformCapacityError(kind: 'platform_paused' | 'platform_capacity'): LimitError {
  return new LimitError(
    kind === 'platform_paused'
      ? 'Context Control has paused new agent runs for maintenance. Your data is safe; try again shortly.'
      : 'Context Control is at capacity right now. Try again in a few minutes.',
    'INFRASTRUCTURE_CAPACITY_LIMIT',
    { upgrade: false }
  );
}
