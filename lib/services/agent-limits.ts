import { getSupabaseAdminClient } from '@/lib/supabase';

/**
 * Per-organization limits for agent runs (organizations.agent_limits, merged with these
 * defaults) and the kill switch (organizations.agents_paused_at). "Today" is UTC.
 */

export interface AgentLimits {
  max_concurrent_runs: number;
  max_batch: number;
  max_tokens_per_run: number;
  max_tokens_per_day: number;
  max_steps: number;
  max_duration_seconds: number;
  max_queue_seconds: number;
}

export const DEFAULT_AGENT_LIMITS: AgentLimits = {
  max_concurrent_runs: 10,
  max_batch: 10,
  max_tokens_per_run: 300_000,
  max_tokens_per_day: 3_000_000,
  max_steps: 60,
  max_duration_seconds: 3600,
  max_queue_seconds: 300,
};

export interface OrgAgentState {
  limits: AgentLimits;
  paused_at: string | null;
  paused_by: string | null;
}

export async function orgAgentState(tenantId: string): Promise<OrgAgentState> {
  const { data } = await getSupabaseAdminClient().from('organizations').select('agent_limits, agents_paused_at, agents_paused_by').eq('id', tenantId).maybeSingle();
  const custom = (data?.agent_limits ?? {}) as Partial<AgentLimits>;
  const limits = { ...DEFAULT_AGENT_LIMITS };
  for (const [k, v] of Object.entries(custom)) if (typeof v === 'number' && v > 0 && k in limits) (limits as any)[k] = v;
  return { limits, paused_at: data?.agents_paused_at ?? null, paused_by: data?.agents_paused_by ?? null };
}

export const utcDayStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

/** Tokens used today (UTC) by all runs of the organization. */
export async function tokensUsedToday(tenantId: string): Promise<number> {
  const { data } = await getSupabaseAdminClient().from('agent_runs').select('tokens_used').eq('tenant_id', tenantId).gte('created_at', utcDayStart()).limit(5000);
  return (data || []).reduce((n: number, r: { tokens_used?: number }) => n + (r.tokens_used ?? 0), 0);
}

/** A per-run limit: the requested value, never above the organization's limit. */
export const capped = (requested: number | null | undefined, orgLimit: number) => (requested && requested > 0 ? Math.min(requested, orgLimit) : orgLimit);
