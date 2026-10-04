import crypto from 'crypto';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { getMembership, type MemberRole } from '@/lib/auth/membership';
import { setTenantSecret, testProviderConnection, type BYOKProvider } from '@/lib/secrets/secrets-service';
import { ServiceError } from './errors';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: MemberRole;
  created: boolean;
}

/** Onboarding form field names → encrypted secret providers. */
const BYOK_PROVIDER_BY_FIELD: Record<string, BYOKProvider> = {
  OPENAI_API_KEY: 'openai',
  ANTHROPIC_API_KEY: 'anthropic',
  ELEVENLABS_API_KEY: 'elevenlabs',
  GEMINI_API_TOKEN: 'gemini',
  GEMINI_API_KEY: 'gemini',
};

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48) || 'workspace';
}

/**
 * Create an organization and make the user its owner. Idempotent per user: a user who
 * already belongs to an organization gets that organization back instead of a duplicate.
 *
 * Uses the service-role client because organizations / organization_members have no
 * INSERT policy for authenticated users (the creator is not a member until this runs).
 */
export async function createOrganizationWithOwner(userId: string, name: string): Promise<OrganizationSummary> {
  const trimmed = name.trim();
  if (!trimmed) throw new ServiceError('Organization name is required', 'INVALID');
  if (trimmed.length > 120) throw new ServiceError('Organization name is too long', 'INVALID');

  const supabase = getSupabaseAdminClient();

  const existing = await getMembership(supabase, userId);
  if (existing) {
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, slug')
      .eq('id', existing.organizationId)
      .single();
    if (org) return { ...org, role: existing.role, created: false };
  }

  const baseSlug = slugify(trimmed);
  let organization: { id: string; name: string; slug: string } | null = null;
  for (let attempt = 0; attempt < 5 && !organization; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;
    const { data, error } = await supabase
      .from('organizations')
      // NOTE: preserves the existing behaviour of activating new workspaces immediately.
      .insert({ slug, name: trimmed, subscription_status: 'active' })
      .select('id, name, slug')
      .single();
    if (error?.code === '23505') continue; // slug taken
    if (error) throw new Error(`Failed to create organization: ${error.message}`);
    organization = data;
  }
  if (!organization) throw new ServiceError('Could not allocate a unique organization slug', 'CONFLICT');

  const { error: memberError } = await supabase
    .from('organization_members')
    .insert({ organization_id: organization.id, user_id: userId, role: 'owner' });

  if (memberError) {
    // Compensate so a failed onboarding does not leave an ownerless organization.
    await supabase.from('organizations').delete().eq('id', organization.id);
    throw new Error(`Failed to assign organization owner: ${memberError.message}`);
  }

  return { ...organization, role: 'owner', created: true };
}

export interface OnboardingSecretResult {
  stored: BYOKProvider[];
  failed: Array<{ field: string; reason: string }>;
}

/**
 * Store onboarding BYOK credentials envelope-encrypted. Each key is verified with its
 * provider first, so an invalid paste is reported instead of silently stored.
 * Unknown field names are ignored. `verify` is injectable for tests and the migration script.
 */
export async function storeOnboardingSecrets(
  tenantId: string,
  apiKeys: Array<{ name?: unknown; value?: unknown }>,
  options: { verify?: boolean } = {}
): Promise<OnboardingSecretResult> {
  const verify = options.verify ?? true;
  const result: OnboardingSecretResult = { stored: [], failed: [] };
  for (const entry of apiKeys) {
    const field = typeof entry?.name === 'string' ? entry.name : '';
    const value = typeof entry?.value === 'string' ? entry.value.trim() : '';
    const provider = BYOK_PROVIDER_BY_FIELD[field];
    if (!provider || !value) continue;
    try {
      if (verify) {
        const check = await testProviderConnection(provider, value);
        if (!check.success) {
          result.failed.push({ field, reason: check.message });
          continue;
        }
      }
      await setTenantSecret(tenantId, provider, value);
      result.stored.push(provider);
    } catch (err) {
      console.error(`[onboarding] failed to store ${provider} secret`, err);
      result.failed.push({ field, reason: 'Could not store the key. Try again from Account & Billing → LLM keys.' });
    }
  }
  return result;
}
