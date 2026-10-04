import type { SupabaseClient } from '@supabase/supabase-js';

export type MemberRole = 'owner' | 'admin' | 'member';

export interface Membership {
  organizationId: string;
  role: MemberRole;
}

/**
 * Resolve the organization a user belongs to. organization_members is keyed by
 * organization_id (see 01_organizations_auth.sql); owners win over other roles
 * when a user belongs to several organizations.
 */
export async function getMembership(supabase: SupabaseClient, userId: string): Promise<Membership | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id, role, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error || !data || data.length === 0) return null;

  const rank: Record<string, number> = { owner: 0, admin: 1, member: 2 };
  const best = [...data].sort((a, b) => (rank[a.role] ?? 3) - (rank[b.role] ?? 3))[0];
  const role = (['owner', 'admin', 'member'].includes(best.role) ? best.role : 'member') as MemberRole;
  return { organizationId: best.organization_id, role };
}
