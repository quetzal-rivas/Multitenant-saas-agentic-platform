-- Migration: 20261003030000_encrypted_secrets_and_oauth.sql
-- Description: Table for envelope-encrypted tenant secrets and OAuth state tracking for PKCE flows.

-- 1. Encrypted secrets table for BYOK keys and OAuth tokens
CREATE TABLE IF NOT EXISTS public.encrypted_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider VARCHAR(64) NOT NULL, -- 'gemini', 'anthropic', 'openai', 'elevenlabs', 'twilio', 'tenant_supabase', 'google_oauth', 'slack_oauth'
    encrypted_payload JSONB NOT NULL, -- Contains ciphertext, nonce, authTag, encryptedDataKey, keyFingerprint
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, provider)
);

ALTER TABLE public.encrypted_secrets ENABLE ROW LEVEL SECURITY;

-- RLS: Only owner and admin roles in the tenant can view secrets status
DROP POLICY IF EXISTS encrypted_secrets_select ON public.encrypted_secrets;
CREATE POLICY encrypted_secrets_select ON public.encrypted_secrets
    FOR SELECT
    USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']));

-- RLS: Only owner and admin roles in the tenant can insert/update/delete secrets
DROP POLICY IF EXISTS encrypted_secrets_write ON public.encrypted_secrets;
CREATE POLICY encrypted_secrets_write ON public.encrypted_secrets
    FOR ALL
    USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']))
    WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']));

-- Revoke direct column access to encrypted_payload from authenticated & anon roles
-- Plaintext credentials can only be decrypted by server-side Lambdas using kms:Decrypt
REVOKE SELECT (encrypted_payload) ON public.encrypted_secrets FROM authenticated, anon;

-- 2. OAuth PKCE States Table (short-lived authorization state binding)
CREATE TABLE IF NOT EXISTS public.oauth_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    provider VARCHAR(64) NOT NULL,
    state VARCHAR(255) UNIQUE NOT NULL,
    code_verifier TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oauth_states_tenant_isolation ON public.oauth_states;
CREATE POLICY oauth_states_tenant_isolation ON public.oauth_states
    FOR ALL
    USING (public.has_tenant_access(tenant_id));
