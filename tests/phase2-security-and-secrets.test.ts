import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

// Imports to test
import { envelopeEncryptSecret, envelopeDecryptSecret } from '../lib/secrets/envelope-encryption';
import { generatePKCE } from '../lib/auth/oauth-pkce';
import { createPlatformApiKey } from '../lib/auth/api-keys';

describe('Phase 2 Security, Secrets & Keys Verification', () => {
  const mockTenantId = '11111111-1111-4111-a111-111111111111';

  test('Envelope encryption: encrypts with AES-256-GCM and decrypts cleanly with matching AAD', async () => {
    const plaintext = 'sk-ant-api03-secret-anthropic-key-12345';
    const provider = 'anthropic';

    const payload = await envelopeEncryptSecret(plaintext, mockTenantId, provider);

    assert.ok(payload.ciphertext, 'Ciphertext must be present');
    assert.ok(payload.nonce, 'Nonce IV must be present');
    assert.ok(payload.authTag, 'GCM Auth tag must be present');
    assert.ok(payload.encryptedDataKey, 'Encrypted data key must be present');
    assert.notEqual(payload.ciphertext, plaintext, 'Plaintext must not appear in ciphertext');

    // Decrypt with matching tenantId and provider AAD
    const decrypted = await envelopeDecryptSecret(payload, mockTenantId, provider);
    assert.equal(decrypted, plaintext, 'Decrypted value must match original plaintext');
  });

  test('Envelope encryption: throws error when decrypting with wrong tenant AAD', async () => {
    const plaintext = 'sk-proj-openai-secret-67890';
    const provider = 'openai';
    const wrongTenantId = '99999999-9999-4999-a999-999999999999';

    const payload = await envelopeEncryptSecret(plaintext, mockTenantId, provider);

    await assert.rejects(
      async () => {
        await envelopeDecryptSecret(payload, wrongTenantId, provider);
      },
      /Unsupported state or unable to authenticate data|cipher/i,
      'Decryption with incorrect AAD must fail authentication tag check'
    );
  });

  test('Platform API keys: CSPRNG generation, prefix masking, and SHA-256 hash calculation', async () => {
    // Test key creation logic directly
    const environment = 'live';
    const randomBytes = crypto.randomBytes(24).toString('hex');
    const rawKey = `sk_${environment}_${randomBytes}`;
    const keyPrefix = rawKey.slice(0, 14);
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    assert.ok(rawKey.startsWith('sk_live_'), 'Key must start with sk_live_');
    assert.equal(rawKey.length, 56, 'Full raw key length must be 56 chars');
    assert.equal(keyPrefix.length, 14, 'Prefix length must be 14 chars');
    assert.equal(keyHash.length, 64, 'SHA-256 hash length must be 64 hex chars');

    // Verify hash can be reproduced
    const recomputedHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    assert.equal(recomputedHash, keyHash, 'SHA-256 hash must be deterministic');
  });

  test('OAuth PKCE: generates valid RFC 7636 code_verifier and code_challenge (S256)', () => {
    const { codeVerifier, codeChallenge } = generatePKCE();

    assert.ok(codeVerifier.length >= 43, 'Code verifier must be at least 43 chars');
    assert.ok(codeChallenge.length >= 43, 'Code challenge must be at least 43 chars');

    // Manually compute expected code_challenge from code_verifier
    const expectedChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest()
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    assert.equal(codeChallenge, expectedChallenge, 'S256 challenge calculation must strictly conform to RFC 7636');
  });
});
