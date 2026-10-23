/**
 * The plan catalog: one source of truth for prices, limits and features. The server enforces
 * it (lib/services/plan-limits.ts); the landing page and Account & Billing only display it.
 * Prices are provisional and the Stripe price ids come from the environment, so changing a
 * price never needs code. Only features that exist are listed or gated.
 */

export type PlanId = 'free' | 'developer' | 'pro' | 'unlimited' | 'enterprise';

/** Tier order: a trial only ever moves an organization up. */
export const PLAN_ORDER: PlanId[] = ['free', 'developer', 'pro', 'unlimited', 'enterprise'];
export const planRank = (p: PlanId) => PLAN_ORDER.indexOf(p);

/** Counted limits. Resource limits count active items; *_month quotas reset on the 1st (UTC). */
export type LimitKey =
  | 'agents'
  | 'teams'
  | 'workers_per_team'
  | 'runs_month'
  | 'concurrent_runs'
  | 'schedules'
  | 'functions'
  | 'context_profiles'
  | 'mcp_profiles'
  | 'api_keys'
  | 'api_ops_month'
  | 'api_rpm'
  | 'connections'
  | 'inbound_endpoints'
  | 'phone_numbers'
  | 'llm_keys'
  | 'members';

export interface PlanFeatures {
  /** Choose a provider (preferred or locked) per agent, team or worker. Otherwise: the organization order. */
  per_agent_provider: boolean;
  /** Rotate to the next provider when one is out of quota, overloaded or slow. */
  provider_fallback: boolean;
  /** Store ElevenLabs / Twilio credentials, connect numbers and run phone calls. */
  voice_telephony: boolean;
  /** Scheduled tasks retry failed runs (max_retries). */
  task_retries: boolean;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  /** Monthly USD; null = not sold on its own (trial only, or by contract). */
  priceUsd: number | null;
  /** Shown as a plan card; otherwise mentioned as a note. */
  listed: boolean;
  /** Buying this plan grants a one-time 7-day trial of this tier. */
  trialOnPurchase: PlanId | null;
  /** The trial this plan comes with, in one line (landing page and Billing). */
  trialLine: string;
  /** Publish the numeric limits. Unlimited's stay internal until capacity is load-tested. */
  limitsPublic: boolean;
  limits: Record<LimitKey, number>;
  features: PlanFeatures;
}

export const TRIAL_DAYS = 7;
/** Every new organization gets a 7-day trial of this tier. */
export const SIGNUP_TRIAL: PlanId = 'developer';

const unlimitedLimits: Record<LimitKey, number> = {
  agents: 250,
  teams: 100,
  workers_per_team: 8,
  runs_month: 100_000,
  concurrent_runs: 25,
  schedules: 500,
  functions: 250,
  context_profiles: 250,
  mcp_profiles: 250,
  api_keys: 250,
  api_ops_month: 1_000_000,
  api_rpm: 2_000,
  connections: 250,
  inbound_endpoints: 100,
  phone_numbers: 25,
  llm_keys: 50,
  members: 50,
};

const allFeatures: PlanFeatures = { per_agent_provider: true, provider_fallback: true, voice_telephony: true, task_retries: true };

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Build your first agents with your own AI key.',
    priceUsd: 0,
    listed: true,
    trialOnPurchase: null,
    trialLine: 'Includes a 7-day Developer trial. No card needed.',
    limitsPublic: true,
    limits: {
      agents: 3,
      teams: 1,
      workers_per_team: 3,
      runs_month: 200,
      concurrent_runs: 2,
      schedules: 2,
      functions: 2,
      context_profiles: 3,
      mcp_profiles: 2,
      api_keys: 2,
      api_ops_month: 1_000,
      api_rpm: 30,
      connections: 3,
      inbound_endpoints: 1,
      phone_numbers: 0,
      llm_keys: 1,
      members: 1,
    },
    features: { per_agent_provider: false, provider_fallback: false, voice_telephony: false, task_retries: false },
  },
  developer: {
    id: 'developer',
    name: 'Developer',
    tagline: 'Tools, automations and integrations with higher quotas.',
    priceUsd: 19,
    listed: true,
    trialOnPurchase: 'pro',
    trialLine: 'Includes a 7-day Pro trial when you subscribe.',
    limitsPublic: true,
    limits: {
      agents: 15,
      teams: 5,
      workers_per_team: 5,
      runs_month: 3_000,
      concurrent_runs: 5,
      schedules: 20,
      functions: 10,
      context_profiles: 15,
      mcp_profiles: 10,
      api_keys: 10,
      api_ops_month: 25_000,
      api_rpm: 120,
      connections: 10,
      inbound_endpoints: 5,
      phone_numbers: 1,
      llm_keys: 5,
      members: 3,
    },
    features: { per_agent_provider: true, provider_fallback: false, voice_telephony: true, task_retries: true },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'Orchestration, provider fallback, more concurrency and resources.',
    priceUsd: 49,
    listed: true,
    trialOnPurchase: 'unlimited',
    trialLine: 'Includes a 7-day Unlimited trial when you subscribe.',
    limitsPublic: true,
    limits: {
      agents: 50,
      teams: 25,
      workers_per_team: 8,
      runs_month: 15_000,
      concurrent_runs: 10,
      schedules: 100,
      functions: 50,
      context_profiles: 50,
      mcp_profiles: 50,
      api_keys: 50,
      api_ops_month: 150_000,
      api_rpm: 600,
      connections: 50,
      inbound_endpoints: 25,
      phone_numbers: 5,
      llm_keys: 20,
      members: 10,
    },
    features: allFeatures,
  },
  unlimited: {
    id: 'unlimited',
    name: 'Unlimited',
    tagline: 'Every feature and the highest limits, for teams running agents at scale.',
    priceUsd: null,
    listed: true,
    trialOnPurchase: null,
    trialLine: 'Try it for 7 days when you subscribe to Pro. Price to be announced.',
    limitsPublic: false,
    limits: unlimitedLimits,
    features: allFeatures,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Custom limits, onboarding and support by contract.',
    priceUsd: null,
    listed: false,
    trialOnPurchase: null,
    trialLine: 'Contact us.',
    limitsPublic: false,
    // Starting point; each contract sets entitlements.custom_limits.
    limits: unlimitedLimits,
    features: allFeatures,
  },
};

/** Hard platform ceilings that no plan or custom limit can exceed (abuse and capacity protection). */
export const HARD_LIMITS: Partial<Record<LimitKey, number>> = {
  concurrent_runs: 25,
  api_rpm: 2_000,
  workers_per_team: 8,
};

/** What a limit means, for messages and the usage panel. */
export const LIMIT_LABELS: Record<LimitKey, string> = {
  agents: 'agents',
  teams: 'teams',
  workers_per_team: 'workers per team',
  runs_month: 'agent runs this month',
  concurrent_runs: 'simultaneous runs',
  schedules: 'active scheduled tasks and heartbeats',
  functions: 'AI functions',
  context_profiles: 'context profiles',
  mcp_profiles: 'MCP profiles',
  api_keys: 'API keys',
  api_ops_month: 'API and MCP operations this month',
  api_rpm: 'API and MCP requests per minute',
  connections: 'connected apps',
  inbound_endpoints: 'inbound webhooks',
  phone_numbers: 'phone numbers',
  llm_keys: 'stored AI provider keys',
  members: 'members (including pending invitations)',
};

/** Marketing lines for a plan card, generated from the real limits so they never drift. */
export function planHighlights(plan: PlanDefinition): string[] {
  if (!plan.limitsPublic) {
    return [
      'Bring your own AI key (BYOK)',
      'Every feature, including provider fallback and phone calls',
      'The highest agent, run and API limits',
      'Still protected by platform capacity and abuse limits',
    ];
  }
  const l = plan.limits;
  const n = (v: number) => v.toLocaleString('en-US');
  const lines = [
    'Bring your own AI key (BYOK)',
    `${n(l.agents)} agents · ${n(l.teams)} ${l.teams === 1 ? 'team' : 'teams'} (up to ${l.workers_per_team} workers)`,
    `${n(l.runs_month)} agent runs / month · ${l.concurrent_runs} at a time`,
    `${n(l.api_ops_month)} API + MCP operations / month`,
    `${n(l.functions)} AI functions · ${n(l.schedules)} scheduled tasks`,
    `${n(l.members)} ${l.members === 1 ? 'member' : 'members'}`,
  ];
  if (plan.features.provider_fallback) lines.push('Provider fallback and rotation');
  else if (plan.features.per_agent_provider) lines.push('Pick the AI provider per agent');
  else lines.push('One AI provider for the whole workspace');
  lines.push(plan.features.voice_telephony ? `Phone calls with your Twilio + ElevenLabs (${l.phone_numbers} ${l.phone_numbers === 1 ? 'number' : 'numbers'})` : 'No phone calls');
  return lines;
}

/** Stripe price id of a sellable plan for this environment (undefined until configured). */
export function stripePriceId(plan: PlanId): string | undefined {
  if (plan === 'developer') return process.env.STRIPE_PRICE_DEVELOPER || undefined;
  if (plan === 'pro') return process.env.STRIPE_PRICE_PRO || undefined;
  return undefined;
}
