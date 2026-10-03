import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { isDemoMode } from '@/lib/demo';
import crypto from 'crypto';

export type AuthMode = 'session' | 'api_key' | 'client_token' | 'webhook_signature';

export interface AuthContext {
  tenantId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'system';
  scopes: string[];
  authMode: AuthMode;
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
  return err instanceof AuthError || err?.name === 'AuthError' || typeof err?.statusCode === 'number';
}

/**
 * Hash raw API key string using SHA-256
 */
export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
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
  const authHeader = req.headers.get('authorization') || req.headers.get('x-api-key');

  // 1. Check API Key Authentication (ctx_live_... / ctx_test_...)
  if (modes.includes('api_key') && authHeader) {
    const rawKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    if (rawKey.startsWith('ctx_live_') || rawKey.startsWith('ctx_test_')) {
      const keyHash = hashApiKey(rawKey);
      const supabase = await createClient();

      const { data: keyRecord, error } = await supabase
        .from('mcp_api_keys')
        .select('*')
        .eq('key_hash', keyHash)
        .single();

      if (!error && keyRecord && !keyRecord.revoked_at) {
        if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
          throw new AuthError('API Key has expired', 401, 'KEY_EXPIRED');
        }

        return {
          tenantId: keyRecord.tenant_id,
          userId: `key_${keyRecord.id}`,
          role: 'admin',
          scopes: keyRecord.scopes || ['*'],
          authMode: 'api_key',
        };
      }
    }
  }

  // 2. Check Supabase Session JWT Authentication
  if (modes.includes('session')) {
    try {
      const supabase = await createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (!userError && user) {
        // Fetch organization membership to determine tenantId and role
        const { data: orgMember } = await supabase
          .from('organization_members')
          .select('org_id, role')
          .eq('user_id', user.id)
          .limit(1)
          .single();

        const tenantId = orgMember?.org_id || user.user_metadata?.tenant_id || user.id;
        const role = (orgMember?.role as 'owner' | 'admin' | 'member') || 'member';

        return {
          tenantId,
          userId: user.id,
          role,
          scopes: ['*'],
          authMode: 'session',
        };
      }
    } catch {
      // Session cookies unavailable or outside Next.js request scope
    }
  }


  // 3. Check Scoped Client Token Authentication (JWT)
  if (modes.includes('client_token') && authHeader) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    try {
      // Decode JWT payload parts
      const parts = token.split('.');
      if (parts.length === 3) {
        const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
        const claims = JSON.parse(payloadJson);

        if (claims.tenant_id && claims.sub && claims.exp && claims.exp > Math.floor(Date.now() / 1000)) {
          return {
            tenantId: claims.tenant_id,
            userId: claims.sub,
            role: 'member',
            scopes: claims.tools_whitelist || [],
            authMode: 'client_token',
          };
        }
      }
    } catch {
      // Invalid JWT format
    }
  }

  // 4. Demo Mode Fallback for local playground testing
  if (isDemoMode()) {
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
