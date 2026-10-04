import crypto from 'crypto';

let ecKeyPair: { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject } | null = null;
const keyId = process.env.CLIENT_TOKEN_KID || 'ctx_es256_key_2026';

export const CLIENT_TOKEN_ISSUER = 'https://api.contextcontrol.dev';
export const CLIENT_TOKEN_AUDIENCE = 'context-control-client';

/**
 * Get or initialize the ES256 keypair.
 * CLIENT_TOKEN_SIGNING_KEY holds a P-256 PKCS#8 PEM (raw or base64-encoded) so every
 * server instance signs and verifies with the same key. Outside production an
 * ephemeral key is generated for local development and tests.
 */
export function getES256KeyPair() {
  if (!ecKeyPair) {
    const configured = process.env.CLIENT_TOKEN_SIGNING_KEY;
    if (configured) {
      const pem = configured.includes('BEGIN') ? configured : Buffer.from(configured, 'base64').toString('utf8');
      const privateKey = crypto.createPrivateKey(pem.replace(/\\n/g, '\n'));
      ecKeyPair = { privateKey, publicKey: crypto.createPublicKey(privateKey) };
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error('CLIENT_TOKEN_SIGNING_KEY must be configured in production');
    } else {
      ecKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    }
  }
  return { ...ecKeyPair, kid: keyId };
}

/**
 * Returns JWKS (JSON Web Key Set) containing the public key
 */
export function getPublicJWKS() {
  const { publicKey, kid } = getES256KeyPair();
  const jwk = publicKey.export({ format: 'jwk' });

  return {
    keys: [
      {
        kty: jwk.kty || 'EC',
        crv: jwk.crv || 'P-256',
        x: jwk.x,
        y: jwk.y,
        use: 'sig',
        alg: 'ES256',
        kid,
      },
    ],
  };
}

/**
 * Mint an ES256 signed JWT client token
 */
export function mintClientToken(payload: {
  tenantId: string;
  userId: string;
  profileSlug: string;
  ttlSeconds: number;
  toolsWhitelist?: string[];
}) {
  const { privateKey, kid } = getES256KeyPair();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + payload.ttlSeconds;

  const header = {
    alg: 'ES256',
    typ: 'JWT',
    kid,
  };

  const claims = {
    iss: CLIENT_TOKEN_ISSUER,
    sub: payload.userId,
    aud: CLIENT_TOKEN_AUDIENCE,
    tenant_id: payload.tenantId,
    profile_slug: payload.profileSlug,
    iat: now,
    nbf: now,
    exp,
    jti: `jti_${crypto.randomBytes(12).toString('hex')}`,
    tools_whitelist: payload.toolsWhitelist || [],
  };

  const b64Url = (val: any) =>
    Buffer.from(JSON.stringify(val))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const unsignedToken = `${b64Url(header)}.${b64Url(claims)}`;

  // ES256 signature (IEEE P1363 encoding)
  const signer = crypto.createSign('SHA256');
  signer.update(unsignedToken);
  const signature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });

  const signatureB64Url = signature
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return {
    token: `${unsignedToken}.${signatureB64Url}`,
    claims,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export interface VerifiedClientTokenClaims {
  sub: string;
  tenant_id: string;
  profile_slug?: string;
  tools_whitelist: string[];
  exp: number;
}

function b64UrlDecode(segment: string): Buffer {
  return Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Verify an ES256 client token minted by mintClientToken.
 * Returns null for anything that is malformed, unsigned, signed by another key,
 * expired, not yet valid, or issued for a different issuer/audience.
 */
export function verifyClientToken(token: string): VerifiedClientTokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, claimsB64, signatureB64] = parts;

  try {
    const header = JSON.parse(b64UrlDecode(headerB64).toString('utf8'));
    if (header.alg !== 'ES256') return null;

    const { publicKey, kid } = getES256KeyPair();
    if (header.kid && header.kid !== kid) return null;

    const verifier = crypto.createVerify('SHA256');
    verifier.update(`${headerB64}.${claimsB64}`);
    const valid = verifier.verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, b64UrlDecode(signatureB64));
    if (!valid) return null;

    const claims = JSON.parse(b64UrlDecode(claimsB64).toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== CLIENT_TOKEN_ISSUER || claims.aud !== CLIENT_TOKEN_AUDIENCE) return null;
    if (typeof claims.exp !== 'number' || claims.exp <= now) return null;
    if (typeof claims.nbf === 'number' && claims.nbf > now + 30) return null;
    if (typeof claims.sub !== 'string' || typeof claims.tenant_id !== 'string') return null;

    return {
      sub: claims.sub,
      tenant_id: claims.tenant_id,
      profile_slug: claims.profile_slug,
      tools_whitelist: Array.isArray(claims.tools_whitelist) ? claims.tools_whitelist : [],
      exp: claims.exp,
    };
  } catch {
    return null;
  }
}
