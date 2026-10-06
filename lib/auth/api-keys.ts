import crypto from 'crypto';
import { getSupabaseAdminClient } from '@/lib/supabase';

export type ApiKeyEnvironment = 'live' | 'test';

/** Least-privilege scopes granted when a caller does not ask for any. */
export const DEFAULT_API_KEY_SCOPES = ['mcp:profiles:read', 'mcp:tasks:read'];

/** Canonical key format: ctx_live_<48 hex> / ctx_test_<48 hex>. */
const CANONICAL_KEY_PATTERN = /^ctx_(live|test)_[0-9a-f]{48}$/;
/** Profile keys minted before the key contract was unified. Accepted, read-only. */
const LEGACY_KEY_PATTERN = /^cc_live_[0-9a-f]{32}$/;

export interface PlatformApiKeyRecord {
  id: string;
  tenant_id: string;
  name: string;
  key_prefix: string;
  environment: ApiKeyEnvironment;
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

export interface VerifiedApiKey {
  id: string;
  tenantId: string;
  scopes: string[];
  toolsWhitelist: string[];
  /** MCP profile the key is bound to (limits which functions it can call). */
  profileId: string | null;
  rateLimitRpm: number;
  legacy: boolean;
}

export class ApiKeyError extends Error {
  constructor(message: string, public code: 'INVALID_KEY' | 'KEY_EXPIRED' | 'RATE_LIMITED') {
    super(message);
    this.name = 'ApiKeyError';
  }
}

const KEY_COLUMNS =
  'id, tenant_id, name, key_prefix, environment, scopes, tools_whitelist, rate_limit_rpm, revoked_at, expires_at, last_used_at, created_at';

/** Strip an optional "Bearer " prefix and surrounding whitespace. */
export function extractRawApiKey(header: string | null | undefined): string {
  if (!header) return '';
  return header.replace(/^Bearer\s+/i, '').trim();
}

export function isPlatformApiKeyFormat(rawKey: string): boolean {
  return CANONICAL_KEY_PATTERN.test(rawKey) || LEGACY_KEY_PATTERN.test(rawKey);
}

/** key_hash is a BYTEA column; PostgREST accepts it as a \x-prefixed hex literal. */
export function apiKeyHashLiteral(rawKey: string): string {
  return `\\x${crypto.createHash('sha256').update(rawKey).digest('hex')}`;
}

export function generateRawApiKey(environment: ApiKeyEnvironment): string {
  return `ctx_${environment}_${crypto.randomBytes(24).toString('hex')}`;
}

// Per-instance sliding window. Serverless instances each keep their own window,
// so this bounds bursts per instance rather than enforcing a global quota.
const rateWindows = new Map<string, number[]>();

export function consumeRateLimit(keyId: string, limitRpm: number, now = Date.now()): boolean {
  if (!limitRpm || limitRpm <= 0) return true;
  const windowStart = now - 60_000;
  const hits = (rateWindows.get(keyId) || []).filter((t) => t > windowStart);
  if (hits.length >= limitRpm) {
    rateWindows.set(keyId, hits);
    return false;
  }
  hits.push(now);
  rateWindows.set(keyId, hits);
  return true;
}

/**
 * Resolve a raw API key to its tenant and grants. Uses the service-role client
 * because the caller has no session and key_hash is hidden from authenticated roles.
 * Returns null when the key is unknown, malformed, or revoked.
 */
export async function verifyApiKey(rawKey: string): Promise<VerifiedApiKey | null> {
  if (!isPlatformApiKeyFormat(rawKey)) return null;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('mcp_api_keys')
    .select('id, tenant_id, scopes, tools_whitelist, profile_id, rate_limit_rpm, revoked_at, expires_at')
    .eq('key_hash', apiKeyHashLiteral(rawKey))
    .maybeSingle();

  if (error || !data || data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    throw new ApiKeyError('API key has expired', 'KEY_EXPIRED');
  }
  if (!consumeRateLimit(data.id, data.rate_limit_rpm)) {
    throw new ApiKeyError('API key rate limit exceeded', 'RATE_LIMITED');
  }

  const legacy = LEGACY_KEY_PATTERN.test(rawKey);
  if (legacy) {
    console.warn(`[api-keys] Deprecated cc_live_ key ${data.id} used; it is limited to read scopes.`);
  }

  // Best-effort usage stamp; never block the request on it.
  void supabase
    .from('mcp_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => undefined, () => undefined);

  const scopes: string[] = data.scopes || [];
  return {
    id: data.id,
    tenantId: data.tenant_id,
    scopes: legacy ? scopes.filter((s) => s === '*' || s.endsWith(':read')).map((s) => (s === '*' ? 'mcp:*:read' : s)) : scopes,
    toolsWhitelist: data.tools_whitelist || [],
    profileId: data.profile_id ?? null,
    rateLimitRpm: data.rate_limit_rpm,
    legacy,
  };
}

export interface CreateApiKeyInput {
  name: string;
  environment?: ApiKeyEnvironment;
  scopes?: string[];
  toolsWhitelist?: string[];
  expiresAt?: string | null;
  createdBy?: string | null;
  /** Optional link to the MCP profile this key was issued for. */
  profileId?: string | null;
}

/**
 * Generate a CSPRNG platform API key. Only the SHA-256 hash is stored.
 */
export async function createPlatformApiKey(
  tenantId: string,
  input: CreateApiKeyInput
): Promise<CreatedPlatformApiKey> {
  const environment = input.environment === 'test' ? 'test' : 'live';
  const rawKey = generateRawApiKey(environment);
  const scopes = input.scopes && input.scopes.length > 0 ? input.scopes : DEFAULT_API_KEY_SCOPES;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('mcp_api_keys')
    .insert({
      org_id: tenantId,
      tenant_id: tenantId,
      name: input.name,
      label: input.name,
      key_prefix: rawKey.slice(0, 16),
      key_hash: apiKeyHashLiteral(rawKey),
      environment,
      scopes,
      tools_whitelist: input.toolsWhitelist || [],
      expires_at: input.expiresAt || null,
      created_by: input.createdBy || null,
      profile_id: input.profileId || null,
    })
    .select(KEY_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to create platform API key: ${error?.message}`);
  }

  return { ...(data as PlatformApiKeyRecord), rawKey };
}

/**
 * List active platform API keys for a tenant (never includes key_hash).
 */
export async function listPlatformApiKeys(tenantId: string): Promise<PlatformApiKeyRecord[]> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('mcp_api_keys')
    .select(KEY_COLUMNS)
    .eq('tenant_id', tenantId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list platform API keys: ${error.message}`);
  }

  return (data || []) as PlatformApiKeyRecord[];
}

/**
 * Update the grants on an existing key. The secret itself never changes.
 */
export async function updatePlatformApiKey(
  tenantId: string,
  keyId: string,
  patch: { name?: string; scopes?: string[]; toolsWhitelist?: string[]; expiresAt?: string | null }
): Promise<PlatformApiKeyRecord | null> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.scopes !== undefined) update.scopes = patch.scopes;
  if (patch.toolsWhitelist !== undefined) update.tools_whitelist = patch.toolsWhitelist;
  if (patch.expiresAt !== undefined) update.expires_at = patch.expiresAt;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('mcp_api_keys')
    .update(update)
    .eq('id', keyId)
    .eq('tenant_id', tenantId)
    .is('revoked_at', null)
    .select(KEY_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update platform API key: ${error.message}`);
  }
  return (data as PlatformApiKeyRecord) || null;
}

/**
 * Revoke a platform API key. Returns false when no active key matched this tenant.
 */
export async function revokePlatformApiKey(tenantId: string, keyId: string): Promise<boolean> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('mcp_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('tenant_id', tenantId)
    .is('revoked_at', null)
    .select('id');

  if (error) {
    throw new Error(`Failed to revoke platform API key: ${error.message}`);
  }

  return (data || []).length > 0;
}
