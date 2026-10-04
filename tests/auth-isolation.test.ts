import assert from 'assert';
import { test, describe } from 'node:test';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { requireAuth, hashApiKey, AuthError } from '../lib/auth/require-auth';
import { mintClientToken, verifyClientToken } from '../lib/auth/jwks';
import {
  apiKeyHashLiteral,
  consumeRateLimit,
  generateRawApiKey,
  isPlatformApiKeyFormat,
  verifyApiKey,
} from '../lib/auth/api-keys';

describe('Phase 1: Identity & Tenant Isolation Tests', () => {
  test('hashApiKey generates consistent SHA-256 hex string', () => {
    const rawKey = 'ctx_live_98a72f1bc0934e81a947d102e3b8a1';
    const hash = hashApiKey(rawKey);
    assert.strictEqual(typeof hash, 'string');
    assert.strictEqual(hash.length, 64);
    assert.strictEqual(hashApiKey(rawKey), hash);
  });

  test('requireAuth throws AuthError on unauthenticated request when DEMO_MODE=false', async () => {
    const originalDemo = process.env.DEMO_MODE;
    const originalPublicDemo = process.env.NEXT_PUBLIC_DEMO_MODE;
    process.env.DEMO_MODE = 'false';
    process.env.NEXT_PUBLIC_DEMO_MODE = 'false';

    const req = new NextRequest('https://api.contextcontrol.dev/api/v1/organizations/me', {
      method: 'GET',
    });

    try {
      await requireAuth(req, ['session', 'api_key']);
      assert.fail('Should have thrown AuthError');
    } catch (err: any) {
      assert.ok(err instanceof AuthError);
      assert.strictEqual(err.statusCode, 401);
      assert.strictEqual(err.code, 'UNAUTHORIZED');
    } finally {
      process.env.DEMO_MODE = originalDemo;
      process.env.NEXT_PUBLIC_DEMO_MODE = originalPublicDemo;
    }
  });


  test('requireAuth accepts a client token signed by the platform key', async () => {
    const { token } = mintClientToken({
      tenantId: 'tenant_acme_corp',
      userId: 'usr_verified_777',
      profileSlug: 'sales-agent',
      ttlSeconds: 3600,
      toolsWhitelist: ['crm.search_contact', 'gmail.send_draft'],
    });

    const req = new NextRequest('https://api.contextcontrol.dev/api/v1/context/resolve', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });

    const auth = await requireAuth(req, ['client_token']);
    assert.strictEqual(auth.tenantId, 'tenant_acme_corp');
    assert.strictEqual(auth.userId, 'usr_verified_777');
    assert.strictEqual(auth.authMode, 'client_token');
    assert.deepStrictEqual(auth.scopes, ['crm.search_contact', 'gmail.send_draft']);
  });

  test('requireAuth rejects forged client tokens (unsigned, tampered, or foreign key)', async () => {
    const b64 = (val: any) =>
      Buffer.from(JSON.stringify(val)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const claims = {
      iss: 'https://api.contextcontrol.dev',
      aud: 'context-control-client',
      sub: 'attacker',
      tenant_id: 'victim_tenant',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const unsigned = `${b64({ alg: 'ES256', typ: 'JWT' })}.${b64(claims)}.sig`;
    const noneAlg = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(claims)}.`;

    // Valid signature, then swap the tenant in the payload.
    const real = mintClientToken({ tenantId: 'tenant_a', userId: 'u1', profileSlug: 'p', ttlSeconds: 600 }).token;
    const [h, p, sig] = real.split('.');
    const payload = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    const tampered = `${h}.${b64({ ...payload, tenant_id: 'victim_tenant' })}.${sig}`;

    // Correctly formed ES256 token signed by a different key.
    const foreignKey = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
    const header = b64({ alg: 'ES256', typ: 'JWT', kid: 'ctx_es256_key_2026' });
    const signer = crypto.createSign('SHA256');
    signer.update(`${header}.${b64(claims)}`);
    const foreignSig = signer.sign({ key: foreignKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    const foreign = `${header}.${b64(claims)}.${foreignSig}`;

    for (const token of [unsigned, noneAlg, tampered, foreign]) {
      assert.strictEqual(verifyClientToken(token), null);
      const req = new NextRequest('https://api.contextcontrol.dev/api/v1/context/resolve', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      await assert.rejects(requireAuth(req, ['client_token']), (err: any) => err instanceof AuthError && err.statusCode === 401);
    }
  });

  test('requireAuth rejects malformed or unknown API keys before touching the database', async () => {
    assert.strictEqual(await verifyApiKey('sk_live_' + 'a'.repeat(48)), null);
    assert.strictEqual(await verifyApiKey('ctx_live_short'), null);
    assert.ok(isPlatformApiKeyFormat(generateRawApiKey('live')));
    assert.ok(isPlatformApiKeyFormat(generateRawApiKey('test')));
    assert.match(generateRawApiKey('test'), /^ctx_test_[0-9a-f]{48}$/);
  });

  test('API key hash literal matches the BYTEA format used by every lookup', () => {
    const raw = generateRawApiKey('live');
    assert.strictEqual(apiKeyHashLiteral(raw), `\\x${hashApiKey(raw)}`);
  });

  test('per-key rate limiter blocks requests beyond the per-minute budget', () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) assert.ok(consumeRateLimit('rl-test-key', 3, now + i));
    assert.strictEqual(consumeRateLimit('rl-test-key', 3, now + 10), false);
    assert.ok(consumeRateLimit('rl-test-key', 3, now + 61_000));
  });

  test('requireAuth denies expired client tokens', async () => {
    const expiredPayload = {
      sub: 'usr_expired',
      tenant_id: 'tenant_acme',
      exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
    };
    const b64 = (val: any) =>
      Buffer.from(JSON.stringify(val)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const token = `header.${b64(expiredPayload)}.sig`;

    const req = new NextRequest('https://api.contextcontrol.dev/api/v1/context/resolve', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    try {
      await requireAuth(req, ['client_token']);
      assert.fail('Should have rejected expired token');
    } catch (err: any) {
      assert.ok(err instanceof AuthError);
    }
  });
});
