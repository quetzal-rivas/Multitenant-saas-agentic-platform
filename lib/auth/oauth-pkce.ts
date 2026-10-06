import crypto from 'crypto';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { ServiceError } from '@/lib/services/errors';
import { googleScopes } from '@/lib/connectors/registry';

/**
 * Google OAuth (authorization code + PKCE) for MCP Hub connections. The state row binds
 * the flow to the organization and member that started it. There is no demo fallback:
 * without a configured client the flow fails with a clear message.
 */

export type OAuthProviderType = 'google';

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** PKCE code_verifier and S256 code_challenge (RFC 7636). */
export function generatePKCE() {
  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const codeChallenge = base64UrlEncode(crypto.createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

export function googleClient(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new ServiceError('Google is not configured on this server yet (missing GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET).', 'CONFLICT');
  }
  return { clientId, clientSecret };
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // epoch ms
  scope: string;
  id_token?: string;
}

export async function buildGoogleAuthUrl(tenantId: string, userId: string, origin: string): Promise<string> {
  const { clientId } = googleClient();
  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = crypto.randomBytes(24).toString('hex');
  const redirectUri = `${origin.replace(/\/$/, '')}/api/oauth/callback`;
  const { error } = await getSupabaseAdminClient().from('oauth_states').insert({
    tenant_id: tenantId,
    user_id: userId,
    provider: 'google',
    state,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw new Error(`Could not start the Google connection: ${error.message}`);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: googleScopes().join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline', // refresh token, so agents keep working
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function toTokens(body: any, previousRefresh?: string): GoogleTokens {
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? previousRefresh,
    expires_at: Date.now() + Math.max(60, Number(body.expires_in || 3600) - 60) * 1000,
    scope: body.scope || '',
    id_token: body.id_token,
  };
}

/** Claims from Google's id_token (received directly from Google's token endpoint over TLS). */
export function idTokenClaims(idToken?: string): { email?: string; hd?: string } {
  if (!idToken) return {};
  try {
    return JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

/** Validate and consume the state, then exchange the code. */
export async function exchangeGoogleCode(code: string, state: string) {
  const db = getSupabaseAdminClient();
  const { data: row } = await db.from('oauth_states').select('*').eq('state', state).maybeSingle();
  if (!row) throw new ServiceError('This connection link is invalid or was already used. Start again from MCP Hub.', 'INVALID');
  await db.from('oauth_states').delete().eq('state', state);
  if (new Date(row.expires_at) < new Date()) throw new ServiceError('The connection took too long (over 10 minutes). Start again from MCP Hub.', 'INVALID');
  if (row.provider !== 'google') throw new ServiceError('Unsupported provider.', 'INVALID');

  const { clientId, clientSecret } = googleClient();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: row.redirect_uri,
      grant_type: 'authorization_code',
      code_verifier: row.code_verifier,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ServiceError(`Google refused the sign-in: ${body.error_description || body.error || res.status}`, 'CONFLICT');
  return { tenantId: row.tenant_id as string, userId: row.user_id as string, tokens: toTokens(body) };
}

/** Exchange a refresh token. Throws ServiceError('...reconnect...') when Google revoked it. */
export async function refreshGoogleTokens(current: GoogleTokens): Promise<GoogleTokens> {
  if (!current.refresh_token) throw new ServiceError('Google access expired and no refresh token was granted. Reconnect Google in MCP Hub.', 'CONFLICT');
  const { clientId, clientSecret } = googleClient();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: current.refresh_token, grant_type: 'refresh_token' }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ServiceError(
      body.error === 'invalid_grant'
        ? 'Google access was revoked or expired. Reconnect Google in MCP Hub.'
        : `Could not refresh Google access: ${body.error_description || body.error || res.status}`,
      'CONFLICT'
    );
  }
  return toTokens(body, current.refresh_token);
}

export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => undefined);
}
