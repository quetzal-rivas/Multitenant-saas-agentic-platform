import crypto from 'crypto';
import { getSupabaseAdminClient } from '@/lib/supabase';

export interface VoiceComplianceAttestation {
  tenantId: string;
  userId: string;
  tcpaAccepted: boolean;
  recordingConsentAccepted: boolean;
  attestedAt: string;
}

/**
 * Global Feature Flag check for Voice Integration (Off by default in production).
 */
export function isVoiceEnabled(): boolean {
  return process.env.ENABLE_VOICE_CALLS === 'true';
}

/**
 * Check if tenant has signed TCPA & Recording Consent compliance attestation.
 */
export async function hasVoiceComplianceAttestation(tenantId: string): Promise<boolean> {
  const supabase = getSupabaseAdminClient();

  const { data } = await supabase
    .from('organizations')
    .select('voice_compliance_attested_at')
    .eq('id', tenantId)
    .single();

  return Boolean(data?.voice_compliance_attested_at);
}

/**
 * Record TCPA & Recording Consent compliance attestation for a tenant.
 */
export async function recordVoiceComplianceAttestation(tenantId: string, userId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from('organizations')
    .update({
      voice_compliance_attested_at: new Date().toISOString(),
      voice_compliance_attested_by: userId,
    })
    .eq('id', tenantId);

  if (error) {
    throw new Error(`Failed to record voice compliance attestation: ${error.message}`);
  }
}

/**
 * Verify Twilio webhook request signature (X-Twilio-Signature).
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
  authToken: string
): boolean {
  if (!signature || !authToken) return false;

  // Sort parameter keys alphabetically
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  const expectedSignature = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf8'))
    .digest('base64');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expectedSignature, 'utf8');

  if (sigBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}
