-- Migration: 20261005000000_api_key_contract.sql
-- Description: Finalize the canonical API key contract (ctx_live_/ctx_test_, SHA-256 in BYTEA),
-- allow API-key-created profiles, add task cancellation, and stop storing BYOK secrets in plaintext.

-- 1. API keys -----------------------------------------------------------------
ALTER TABLE public.mcp_api_keys
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'mcp_api_keys_environment_check'
    ) THEN
        ALTER TABLE public.mcp_api_keys
            ADD CONSTRAINT mcp_api_keys_environment_check CHECK (environment IN ('live', 'test'));
    END IF;
END $$;

-- New keys default to least privilege instead of '*'.
ALTER TABLE public.mcp_api_keys
    ALTER COLUMN scopes SET DEFAULT ARRAY['mcp:profiles:read', 'mcp:tasks:read']::TEXT[];

CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_tenant_active
    ON public.mcp_api_keys (tenant_id, created_at DESC)
    WHERE revoked_at IS NULL;

-- RLS keyed on tenant_id (org_id is kept only for legacy rows).
DROP POLICY IF EXISTS "Users can view api keys in their org" ON public.mcp_api_keys;
DROP POLICY IF EXISTS "Admins can manage api keys" ON public.mcp_api_keys;
DROP POLICY IF EXISTS mcp_api_keys_select ON public.mcp_api_keys;
CREATE POLICY mcp_api_keys_select ON public.mcp_api_keys
    FOR SELECT
    USING (public.has_tenant_access(tenant_id));
DROP POLICY IF EXISTS mcp_api_keys_write ON public.mcp_api_keys;
CREATE POLICY mcp_api_keys_write ON public.mcp_api_keys
    FOR ALL
    USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']))
    WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']));

REVOKE SELECT (key_hash) ON public.mcp_api_keys FROM authenticated, anon;

-- 2. Profiles created through the MCP adapter have no user, only a key ---------
ALTER TABLE public.mcp_profiles
    ALTER COLUMN created_by DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS created_via_api_key_id UUID REFERENCES public.mcp_api_keys(id) ON DELETE SET NULL;

-- 3. Task cancellation ---------------------------------------------------------
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'cancelled';

-- 4. Plaintext BYOK storage ----------------------------------------------------
-- New BYOK secrets go to encrypted_secrets (envelope encryption, see lib/secrets).
-- Existing plaintext rows must be re-encrypted with scripts/migrate-byok-secrets.ts
-- (needs KMS, so it cannot run in SQL). Until then, block all client access.
DO $$
BEGIN
    IF to_regclass('public.tenant_api_keys') IS NOT NULL THEN
        EXECUTE 'DROP POLICY IF EXISTS "Users can view tenant API keys in their org" ON public.tenant_api_keys';
        EXECUTE 'DROP POLICY IF EXISTS "Users can insert tenant API keys in their org" ON public.tenant_api_keys';
        EXECUTE 'DROP POLICY IF EXISTS "Users can update tenant API keys in their org" ON public.tenant_api_keys';
        EXECUTE 'DROP POLICY IF EXISTS "Users can delete tenant API keys in their org" ON public.tenant_api_keys';
        EXECUTE 'REVOKE ALL ON public.tenant_api_keys FROM authenticated, anon';
        EXECUTE 'COMMENT ON TABLE public.tenant_api_keys IS ''DEPRECATED: plaintext BYOK storage. Run scripts/migrate-byok-secrets.ts, then drop.''';
    END IF;
END $$;
