import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { isDemoMode } from '@/lib/demo';
import crypto from 'crypto';
import { ApiKeyError, extractRawApiKey, isPlatformApiKeyFormat, verifyApiKey } from '@/lib/auth/api-keys';
import { verifyClientToken } from '@/lib/auth/jwks';
import { getMembership } from '@/lib/auth/membership';

export type AuthMode = 'session' | 'api_key' | 'client_token' | 'webhook_signature';

export interface AuthContext {
  tenantId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'system';
  scopes: string[];
  authMode: AuthMode;
  /** Tool names an API key or client token is limited to. Empty = no extra restriction. */
  toolsWhitelist?: string[];
  apiKeyId?: string;
}

export class AuthError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 401, code = 'UNAUTHORIZED') {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function isAuthError(err: any): err is AuthError {
  return err instanceof AuthError || err?.name === 'AuthError';
}

/**
 * Hash raw API key string using SHA-256
 */
export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/** Session callers that manage the tenant (keys, members, billing). */
export function requireRole(auth: AuthContext, roles: Array<AuthContext['role']>): void {
  if (!roles.includes(auth.role)) {
    throw new AuthError(`This action requires one of: ${roles.join(', ')}`, 403, 'FORBIDDEN');
  }
}

/**
 * requireAuth: Enforces verified credential identification for all API routes.
 * Never accepts tenant_id from request body, query params, or unverified headers.
 */
export async function requireAuth(
  req: NextRequest,
  allowedModes: AuthMode | AuthMode[] = ['session', 'api_key', 'client_token']
): Promise<AuthContext> {
  const modes = Array.isArray(allowedModes) ? allowedModes : [allowedModes];
  const rawCredential = extractRawApiKey(req.headers.get('authorization') || req.headers.get('x-api-key'));

  // 1. Platform API key (ctx_live_... / ctx_test_...)
  if (modes.includes('api_key') && rawCredential && isPlatformApiKeyFormat(rawCredential)) {
    let key;
    try {
      key = await verifyApiKey(rawCredential);
    } catch (err) {
      if (err instanceof ApiKeyError) {
        throw new AuthError(err.message, err.code === 'RATE_LIMITED' ? 429 : 401, err.code);
      }
      throw err;
    }
    if (!key) {
      throw new AuthError('Invalid or revoked API key', 401, 'INVALID_KEY');
    }
    return {
      tenantId: key.tenantId,
      userId: `key_${key.id}`,
      role: 'system',
      scopes: key.scopes,
      toolsWhitelist: key.toolsWhitelist,
      authMode: 'api_key',
      apiKeyId: key.id,
    };
  }

  // 2. Signed client token (ES256 JWT minted by /api/v1/context/token)
  if (modes.includes('client_token') && rawCredential && rawCredential.split('.').length === 3) {
    const claims = verifyClientToken(rawCredential);
    if (!claims) {
      throw new AuthError('Invalid, expired, or unsigned client token', 401, 'INVALID_TOKEN');
    }
    return {
      tenantId: claims.tenant_id,
      userId: claims.sub,
      role: 'member',
      scopes: claims.tools_whitelist,
      toolsWhitelist: claims.tools_whitelist,
      authMode: 'client_token',
    };
  }

  // 3. Supabase session cookie
  if (modes.includes('session')) {
    let user = null;
    let supabase = null;
    try {
      supabase = await createClient();
      const { data, error } = await supabase.auth.getUser();
      if (!error) user = data.user;
    } catch {
      // Session cookies unavailable or outside Next.js request scope
    }

    if (user && supabase) {
      const membership = await getMembership(supabase, user.id);
      if (!membership) {
        throw new AuthError('Complete onboarding to create an organization first', 403, 'NO_ORGANIZATION');
      }
      return {
        tenantId: membership.organizationId,
        userId: user.id,
        role: membership.role,
        scopes: ['*'],
        authMode: 'session',
      };
    }
  }

  // 4. Demo Mode fallback for local playground testing only
  if (isDemoMode() && process.env.NODE_ENV !== 'production') {
    return {
      tenantId: '00000000-0000-0000-0000-000000000001',
      userId: 'user_demo_playground',
      role: 'admin',
      scopes: ['*'],
      authMode: 'session',
    };
  }

  // Strict Deny-By-Default: Unauthenticated call
  throw new AuthError('Authentication credentials required', 401, 'UNAUTHORIZED');
}

/**
 * Signed-in user without requiring an organization yet (onboarding, org picker).
 */
export async function requireSessionUser(): Promise<{ userId: string; email: string | null }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) return { userId: data.user.id, email: data.user.email ?? null };
  } catch {
    // Session cookies unavailable
  }
  throw new AuthError('Authentication credentials required', 401, 'UNAUTHORIZED');
}
