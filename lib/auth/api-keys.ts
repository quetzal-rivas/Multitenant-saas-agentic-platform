import crypto from 'crypto';
import { getSupabaseAdminClient } from '@/lib/supabase';

export interface PlatformApiKeyRecord {
  id: string;
  tenant_id: string;
  name: string;
  key_prefix: string;
  environment: 'live' | 'test';
  scopes: string[];
  tools_whitelist: string[];
  rate_limit_rpm: number;
  revoked_at?: string | null;
  expires_at?: string | null;
  last_used_at?: string | null;
  created_at: string;
}

export interface CreatedPlatformApiKey extends PlatformApiKeyRecord {
  rawKey: string; // Provided ONLY ONCE upon creation
}

/**
 * Generate a CSPRNG platform API key with SHA-256 hash storage.
 */
export async function createPlatformApiKey(
  tenantId: string,
  name: string,
  environment: 'live' | 'test' = 'live',
  scopes: string[] = ['*'],
  toolsWhitelist: string[] = []
): Promise<CreatedPlatformApiKey> {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  const rawKey = `sk_${environment}_${randomBytes}`;
  const keyPrefix = rawKey.slice(0, 14);
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('mcp_api_keys')
    .insert({
      tenant_id: tenantId,
      name,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      environment,
      scopes,
      tools_whitelist: toolsWhitelist,
    })
    .select('id, tenant_id, name, key_prefix, environment, scopes, tools_whitelist, rate_limit_rpm, created_at')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create platform API key: ${error?.message}`);
  }

  return {
    ...data,
    rawKey,
  };
}

/**
 * List platform API keys for a tenant (excluding key_hash).
 */
export async function listPlatformApiKeys(tenantId: string): Promise<PlatformApiKeyRecord[]> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('mcp_api_keys')
    .select('id, tenant_id, name, key_prefix, environment, scopes, tools_whitelist, rate_limit_rpm, revoked_at, expires_at, last_used_at, created_at')
    .eq('tenant_id', tenantId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as PlatformApiKeyRecord[];
}

/**
 * Revoke a platform API key.
 */
export async function revokePlatformApiKey(tenantId: string, keyId: string): Promise<boolean> {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from('mcp_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(`Failed to revoke platform API key: ${error.message}`);
  }

  return true;
}
