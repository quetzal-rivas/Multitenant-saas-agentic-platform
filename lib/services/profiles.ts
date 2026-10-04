import type { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import type {
  archiveProfileArgs,
  createProfileArgs,
  getProfileArgs,
  listProfilesArgs,
  updateProfileArgs,
} from '@/lib/mcp/tool-catalog';
import { ServiceError } from './errors';

const PROFILE_COLUMNS = 'id, name, description, token_budget, settings, is_active, created_at, updated_at';

type Ctx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode' | 'apiKeyId'>;

export async function listProfiles(ctx: Ctx, args: z.infer<typeof listProfilesArgs>) {
  let query = getSupabaseAdminClient()
    .from('mcp_profiles')
    .select(PROFILE_COLUMNS)
    .eq('org_id', ctx.tenantId)
    .order('created_at', { ascending: false })
    .limit(args.limit || 20);
  if (!args.include_inactive) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw new Error(`Could not list MCP profiles: ${error.message}`);
  return { profiles: data || [] };
}

export async function getProfile(ctx: Ctx, args: z.infer<typeof getProfileArgs>) {
  const { data, error } = await getSupabaseAdminClient()
    .from('mcp_profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', args.profile_id)
    .eq('org_id', ctx.tenantId)
    .maybeSingle();
  if (error) throw new Error(`Could not load MCP profile: ${error.message}`);
  if (!data) throw new ServiceError('Profile not found in this organization.', 'NOT_FOUND');
  return { profile: data };
}

/** True when the profile exists, is active and belongs to the tenant. */
export async function assertActiveProfile(ctx: Ctx, profileId: string): Promise<void> {
  const { data, error } = await getSupabaseAdminClient()
    .from('mcp_profiles')
    .select('id')
    .eq('id', profileId)
    .eq('org_id', ctx.tenantId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(`Could not validate MCP profile: ${error.message}`);
  if (!data) throw new ServiceError('profile_id is not an active profile owned by this organization.', 'NOT_FOUND');
}

export async function createProfile(ctx: Ctx, args: z.infer<typeof createProfileArgs>) {
  const { data, error } = await getSupabaseAdminClient()
    .from('mcp_profiles')
    .insert({
      org_id: ctx.tenantId,
      created_by: ctx.authMode === 'session' ? ctx.userId : null,
      created_via_api_key_id: ctx.apiKeyId || null,
      name: args.name,
      description: args.description || null,
      token_budget: args.token_budget,
      settings: args.settings || {},
    })
    .select(PROFILE_COLUMNS)
    .single();
  if (error?.code === '23505') throw new ServiceError(`A profile named '${args.name}' already exists.`, 'CONFLICT');
  if (error || !data) throw new Error(`Could not create MCP profile: ${error?.message}`);
  return { profile: data };
}

export async function updateProfile(ctx: Ctx, args: z.infer<typeof updateProfileArgs>) {
  const { profile_id, ...fields } = args;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) patch[key] = value;
  }
  if (Object.keys(patch).length === 1) throw new ServiceError('Nothing to update.', 'INVALID');

  const { data, error } = await getSupabaseAdminClient()
    .from('mcp_profiles')
    .update(patch)
    .eq('id', profile_id)
    .eq('org_id', ctx.tenantId)
    .select(PROFILE_COLUMNS)
    .maybeSingle();
  if (error?.code === '23505') throw new ServiceError(`A profile named '${args.name}' already exists.`, 'CONFLICT');
  if (error) throw new Error(`Could not update MCP profile: ${error.message}`);
  if (!data) throw new ServiceError('Profile not found in this organization.', 'NOT_FOUND');
  return { profile: data };
}

export async function archiveProfile(ctx: Ctx, args: z.infer<typeof archiveProfileArgs>) {
  return updateProfileFields(ctx, args.profile_id, { is_active: false });
}

async function updateProfileFields(ctx: Ctx, profileId: string, patch: Record<string, unknown>) {
  const { data, error } = await getSupabaseAdminClient()
    .from('mcp_profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', profileId)
    .eq('org_id', ctx.tenantId)
    .select(PROFILE_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Could not update MCP profile: ${error.message}`);
  if (!data) throw new ServiceError('Profile not found in this organization.', 'NOT_FOUND');
  return { profile: data };
}
