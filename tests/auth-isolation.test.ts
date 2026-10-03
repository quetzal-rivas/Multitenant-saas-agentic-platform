import assert from 'assert';
import { test, describe } from 'node:test';
import { NextRequest } from 'next/server';
import { requireAuth, hashApiKey, AuthError } from '../lib/auth/require-auth';

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


  test('requireAuth validates tenant identity from verified client JWT claims', async () => {
    const payload = {
      iss: 'https://api.contextcontrol.dev',
      sub: 'usr_verified_777',
      tenant_id: 'tenant_acme_corp',
      exp: Math.floor(Date.now() / 1000) + 3600,
      tools_whitelist: ['crm.search_contact', 'gmail.send_draft'],
    };
    const b64 = (val: any) =>
      Buffer.from(JSON.stringify(val)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const token = `header.${b64(payload)}.sig`;

    const req = new NextRequest('https://api.contextcontrol.dev/api/v1/context/resolve', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    const auth = await requireAuth(req, ['client_token']);
    assert.strictEqual(auth.tenantId, 'tenant_acme_corp');
    assert.strictEqual(auth.userId, 'usr_verified_777');
    assert.strictEqual(auth.authMode, 'client_token');
    assert.deepStrictEqual(auth.scopes, ['crm.search_contact', 'gmail.send_draft']);
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
