import { getSupabaseAdminClient } from '@/lib/supabase';

export interface PlanLimits {
  planTier: 'free' | 'starter' | 'pro' | 'enterprise';
  maxAgents: number;
  maxRunsPerMonth: number;
  maxScheduledTasks: number;
}

export const PLAN_TIER_LIMITS: Record<string, PlanLimits> = {
  free: { planTier: 'free', maxAgents: 1, maxRunsPerMonth: 100, maxScheduledTasks: 5 },
  starter: { planTier: 'starter', maxAgents: 3, maxRunsPerMonth: 1000, maxScheduledTasks: 50 },
  pro: { planTier: 'pro', maxAgents: 10, maxRunsPerMonth: 10000, maxScheduledTasks: 500 },
  enterprise: { planTier: 'enterprise', maxAgents: 100, maxRunsPerMonth: 100000, maxScheduledTasks: 5000 },
};

export interface TenantEntitlements {
  tenantId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  planTier: 'free' | 'starter' | 'pro' | 'enterprise';
  status: string;
  maxAgents: number;
  maxRunsPerMonth: number;
  maxScheduledTasks: number;
  currentPeriodEndsAt?: string;
}

/**
 * Check if a Stripe webhook event has already been processed (idempotency deduping).
 */
export async function isStripeEventProcessed(eventId: string): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from('processed_stripe_events')
    .select('event_id')
    .eq('event_id', eventId)
    .single();

  return Boolean(data);
}

/**
 * Record a Stripe webhook event as processed.
 */
export async function markStripeEventProcessed(eventId: string, eventType: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  await supabase.from('processed_stripe_events').insert({
    event_id: eventId,
    event_type: eventType,
  });
}

/**
 * Update tenant subscription entitlements in Postgres.
 */
export async function updateTenantEntitlements(
  tenantId: string,
  planTier: 'free' | 'starter' | 'pro' | 'enterprise',
  status = 'active',
  stripeCustomerId?: string,
  stripeSubscriptionId?: string,
  periodEndsAt?: string
): Promise<TenantEntitlements> {
  const limits = PLAN_TIER_LIMITS[planTier] || PLAN_TIER_LIMITS.free;
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('entitlements')
    .upsert(
      {
        tenant_id: tenantId,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        plan_tier: planTier,
        status,
        max_agents: limits.maxAgents,
        max_runs_per_month: limits.maxRunsPerMonth,
        max_scheduled_tasks: limits.maxScheduledTasks,
        current_period_ends_at: periodEndsAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id' }
    )
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to update tenant entitlements: ${error?.message}`);
  }

  return {
    tenantId: data.tenant_id,
    stripeCustomerId: data.stripe_customer_id,
    stripeSubscriptionId: data.stripe_subscription_id,
    planTier: data.plan_tier,
    status: data.status,
    maxAgents: data.max_agents,
    maxRunsPerMonth: data.max_runs_per_month,
    maxScheduledTasks: data.max_scheduled_tasks,
    currentPeriodEndsAt: data.current_period_ends_at,
  };
}

/**
 * Check if tenant has entitlement capacity to execute a run or schedule a task.
 */
export async function checkTenantEntitlementLimit(
  tenantId: string,
  resourceType: 'agents' | 'runs' | 'tasks'
): Promise<{ allowed: boolean; limit: number; currentUsage: number }> {
  const supabase = getSupabaseAdminClient();

  const { data: entitlement } = await supabase
    .from('entitlements')
    .select('*')
    .eq('tenant_id', tenantId)
    .single();

  const limits = entitlement
    ? {
        maxAgents: entitlement.max_agents,
        maxRunsPerMonth: entitlement.max_runs_per_month,
        maxScheduledTasks: entitlement.max_scheduled_tasks,
      }
    : PLAN_TIER_LIMITS.starter; // Default starter tier

  let limit = limits.maxRunsPerMonth;
  let currentUsage = 0;

  if (resourceType === 'agents') {
    limit = limits.maxAgents;
  } else if (resourceType === 'tasks') {
    limit = limits.maxScheduledTasks;
    const { count } = await supabase
      .from('supervisor_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);
    currentUsage = count || 0;
  }

  return {
    allowed: currentUsage < limit,
    limit,
    currentUsage,
  };
}
