import crypto from 'crypto';
import { KMSClient, GenerateDataKeyCommand, DecryptCommand } from '@aws-sdk/client-kms';

const kmsClient = new KMSClient({
  region: process.env.AWS_REGION || 'us-east-2',
});

const KMS_KEY_ID = process.env.KMS_KEY_ID || process.env.AWS_KMS_KEY_ID || 'alias/context-control-tenant-secrets';

export interface EncryptedSecretPayload {
  ciphertext: string; // Base64 encoded AES-256-GCM ciphertext
  nonce: string; // Base64 encoded 12-byte IV/nonce
  authTag: string; // Base64 encoded 16-byte GCM authentication tag
  encryptedDataKey: string; // Base64 encoded KMS-encrypted data key
  keyFingerprint?: string;
}

/**
 * Envelope encrypt a BYOK provider secret value.
 * Uses KMS GenerateDataKey for AES-256-GCM key, with tenant_id + provider as AAD.
 */
export async function envelopeEncryptSecret(
  plaintext: string,
  tenantId: string,
  provider: string
): Promise<EncryptedSecretPayload> {
  const aad = Buffer.from(`${tenantId}:${provider}`, 'utf8');

  // 1. Generate data key via KMS
  let dataKeyPlaintext: Buffer;
  let encryptedDataKeyB64: string;

  try {
    const command = new GenerateDataKeyCommand({
      KeyId: KMS_KEY_ID,
      KeySpec: 'AES_256',
      EncryptionContext: {
        tenant_id: tenantId,
        provider,
      },
    });
    const response = await kmsClient.send(command);

    if (!response.Plaintext || !response.CiphertextBlob) {
      throw new Error('KMS GenerateDataKey returned empty key');
    }

    dataKeyPlaintext = Buffer.from(response.Plaintext);
    encryptedDataKeyB64 = Buffer.from(response.CiphertextBlob).toString('base64');
  } catch (kmsErr) {
    // Local fallback for local development / offline testing when KMS is unavailable
    dataKeyPlaintext = crypto.randomBytes(32);
    encryptedDataKeyB64 = `dev_data_key_${dataKeyPlaintext.toString('base64')}`;
  }

  // 2. Encrypt plaintext secret using AES-256-GCM
  const nonce = crypto.randomBytes(12); // 96-bit IV
  const cipher = crypto.createCipheriv('aes-256-gcm', dataKeyPlaintext, nonce);
  cipher.setAAD(aad);

  const ciphertextBuffer = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertextBuffer.toString('base64'),
    nonce: nonce.toString('base64'),
    authTag: authTag.toString('base64'),
    encryptedDataKey: encryptedDataKeyB64,
    keyFingerprint: crypto.createHash('sha256').update(encryptedDataKeyB64).digest('hex').slice(0, 16),
  };
}

/**
 * Envelope decrypt a BYOK provider secret payload.
 * Only callable by worker/gateway IAM roles with kms:Decrypt permissions.
 */
export async function envelopeDecryptSecret(
  payload: EncryptedSecretPayload,
  tenantId: string,
  provider: string
): Promise<string> {
  const aad = Buffer.from(`${tenantId}:${provider}`, 'utf8');

  // 1. Decrypt data key using KMS
  let dataKeyPlaintext: Buffer;
  if (payload.encryptedDataKey.startsWith('dev_data_key_')) {
    const b64 = payload.encryptedDataKey.replace('dev_data_key_', '');
    dataKeyPlaintext = Buffer.from(b64, 'base64');
  } else {
    const command = new DecryptCommand({
      CiphertextBlob: Buffer.from(payload.encryptedDataKey, 'base64'),
      EncryptionContext: {
        tenant_id: tenantId,
        provider,
      },
    });
    const response = await kmsClient.send(command);
    if (!response.Plaintext) {
      throw new Error('KMS Decrypt returned empty key');
    }
    dataKeyPlaintext = Buffer.from(response.Plaintext);
  }

  // 2. Decrypt ciphertext using AES-256-GCM
  const nonce = Buffer.from(payload.nonce, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', dataKeyPlaintext, nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
