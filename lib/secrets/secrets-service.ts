import { getSupabaseAdminClient } from '@/lib/supabase';
import { envelopeEncryptSecret, envelopeDecryptSecret, EncryptedSecretPayload } from './envelope-encryption';

export type BYOKProvider = 'gemini' | 'anthropic' | 'openai' | 'elevenlabs' | 'twilio' | 'tenant_supabase' | 'google_oauth' | 'slack_oauth';

export interface SecretMetadata {
  provider: BYOKProvider;
  isConfigured: boolean;
  updatedAt?: string;
  fingerprint?: string;
}

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
}

export interface TenantSupabaseCredentials {
  url: string;
  apiKey: string;
}

/**
 * Validate a BYOK secret against the provider's live test endpoint.
 */
export async function testProviderConnection(provider: BYOKProvider, secretValue: string): Promise<{ success: boolean; message: string }> {
  try {
    switch (provider) {
      case 'gemini': {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(secretValue.trim())}`);
        if (!res.ok) {
          const errText = await res.text();
          return { success: false, message: `Gemini API key verification failed (${res.status}): ${errText.slice(0, 150)}` };
        }
        return { success: true, message: 'Gemini API key successfully verified.' };
      }

      case 'anthropic': {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: {
            'x-api-key': secretValue.trim(),
            'anthropic-version': '2023-06-01',
          },
        });
        if (!res.ok) {
          const errText = await res.text();
          return { success: false, message: `Anthropic API key verification failed (${res.status}): ${errText.slice(0, 150)}` };
        }
        return { success: true, message: 'Anthropic API key successfully verified.' };
      }

      case 'openai': {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: {
            'Authorization': `Bearer ${secretValue.trim()}`,
          },
        });
        if (!res.ok) {
          const errText = await res.text();
          return { success: false, message: `OpenAI API key verification failed (${res.status}): ${errText.slice(0, 150)}` };
        }
        return { success: true, message: 'OpenAI API key successfully verified.' };
      }

      case 'elevenlabs': {
        const res = await fetch('https://api.elevenlabs.io/v1/user', {
          headers: {
            'xi-api-key': secretValue.trim(),
          },
        });
        if (!res.ok) {
          const errText = await res.text();
          return { success: false, message: `ElevenLabs API key verification failed (${res.status}): ${errText.slice(0, 150)}` };
        }
        return { success: true, message: 'ElevenLabs API key successfully verified.' };
      }

      case 'twilio': {
        // Expected format: accountSid:authToken or JSON { accountSid, authToken }
        let sid = '';
        let token = '';
        if (secretValue.includes('{')) {
          const parsed = JSON.parse(secretValue) as TwilioCredentials;
          sid = parsed.accountSid;
          token = parsed.authToken;
        } else if (secretValue.includes(':')) {
          const parts = secretValue.split(':');
          sid = parts[0];
          token = parts[1];
        } else {
          return { success: false, message: 'Twilio secret must be provided as accountSid:authToken or JSON object.' };
        }

        const authHeader = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
          headers: { Authorization: authHeader },
        });

        if (!res.ok) {
          const errText = await res.text();
          return { success: false, message: `Twilio verification failed (${res.status}): ${errText.slice(0, 150)}` };
        }
        return { success: true, message: 'Twilio credentials successfully verified.' };
      }

      case 'tenant_supabase': {
        let url = '';
        let apiKey = '';
        if (secretValue.includes('{')) {
          const parsed = JSON.parse(secretValue) as TenantSupabaseCredentials;
          url = parsed.url;
          apiKey = parsed.apiKey;
        } else if (secretValue.includes('|')) {
          const parts = secretValue.split('|');
          url = parts[0];
          apiKey = parts[1];
        } else {
          return { success: false, message: 'Tenant Supabase secret must be provided as url|apiKey or JSON object.' };
        }

        const formattedUrl = url.replace(/\/$/, '') + '/rest/v1/';
        const res = await fetch(formattedUrl, {
          headers: { apikey: apiKey },
        });

        if (!res.ok && res.status !== 404 && res.status !== 200) {
          return { success: false, message: `Tenant Supabase verification failed (${res.status}).` };
        }
        return { success: true, message: 'Tenant Supabase connection successfully verified.' };
      }

      case 'google_oauth':
      case 'slack_oauth':
        return { success: true, message: 'OAuth credentials managed via PKCE authorization flow.' };

      default:
        return { success: false, message: `Unsupported provider: ${provider}` };
    }
  } catch (err: any) {
    return { success: false, message: `Connection test error: ${err?.message || 'Unknown network error'}` };
  }
}

/**
 * Store an envelope-encrypted provider secret for a tenant.
 */
export async function setTenantSecret(
  tenantId: string,
  provider: BYOKProvider,
  plaintextValue: string
): Promise<SecretMetadata> {
  const encryptedPayload = await envelopeEncryptSecret(plaintextValue, tenantId, provider);
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from('encrypted_secrets')
    .upsert(
      {
        tenant_id: tenantId,
        provider,
        encrypted_payload: encryptedPayload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,provider' }
    );

  if (error) {
    throw new Error(`Failed to store encrypted secret for provider ${provider}: ${error.message}`);
  }

  return {
    provider,
    isConfigured: true,
    updatedAt: new Date().toISOString(),
    fingerprint: encryptedPayload.keyFingerprint,
  };
}

/**
 * Retrieve and envelope-decrypt a provider secret for a tenant.
 * Server-only context (Lambda worker or API route handler).
 */
export async function getTenantSecret(tenantId: string, provider: BYOKProvider): Promise<string | null> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('encrypted_secrets')
    .select('encrypted_payload')
    .eq('tenant_id', tenantId)
    .eq('provider', provider)
    .single();

  if (error || !data || !data.encrypted_payload) {
    return null;
  }

  const payload = data.encrypted_payload as EncryptedSecretPayload;
  return await envelopeDecryptSecret(payload, tenantId, provider);
}

/**
 * List configured BYOK providers for a tenant (without exposing ciphertexts).
 */
export async function listTenantSecrets(tenantId: string): Promise<SecretMetadata[]> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('encrypted_secrets')
    .select('provider, updated_at, encrypted_payload')
    .eq('tenant_id', tenantId);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    provider: row.provider as BYOKProvider,
    isConfigured: true,
    updatedAt: row.updated_at,
    fingerprint: (row.encrypted_payload as EncryptedSecretPayload)?.keyFingerprint,
  }));
}

/**
 * Delete a tenant BYOK provider secret.
 */
export async function deleteTenantSecret(tenantId: string, provider: BYOKProvider): Promise<boolean> {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from('encrypted_secrets')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('provider', provider);

  if (error) {
    throw new Error(`Failed to delete secret for provider ${provider}: ${error.message}`);
  }

  return true;
}
