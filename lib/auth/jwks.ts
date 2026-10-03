import crypto from 'crypto';

let ecKeyPair: { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject } | null = null;
let keyId = 'ctx_es256_key_2026';

/**
 * Get or initialize ES256 keypair
 */
export function getES256KeyPair() {
  if (!ecKeyPair) {
    ecKeyPair = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });
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
    iss: 'https://api.contextcontrol.dev',
    sub: payload.userId,
    aud: 'context-control-client',
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
