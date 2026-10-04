-- Migration: 20261003020000_role_aware_rls_and_secrets.sql
-- Description: Enforce role-aware RLS policies (owner, admin, member) and secret column access revocation.

-- 1. Helper function to check specific organization role membership
CREATE OR REPLACE FUNCTION public.has_tenant_role(target_tenant_id UUID, allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_members 
        WHERE organization_id = target_tenant_id 
        AND user_id = auth.uid()
        AND role = ANY(allowed_roles)
    );
$$;

-- 2. Platform MCP API Keys Table (Hashed secrets storage)
CREATE TABLE IF NOT EXISTS public.mcp_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(32) NOT NULL,
    key_hash VARCHAR(64) UNIQUE NOT NULL,
    environment VARCHAR(32) DEFAULT 'live' CHECK (environment IN ('live', 'test')),
    scopes TEXT[] DEFAULT '{*}',
    tools_whitelist TEXT[] DEFAULT '{}',
    rate_limit_rpm INTEGER DEFAULT 60,
    revoked_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 20261002010000_mcp_profiles.sql already created mcp_api_keys (org_id-based), so the
-- CREATE above is skipped on a fresh database. Add tenant_id before policies use it.
ALTER TABLE public.mcp_api_keys
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'mcp_api_keys' AND column_name = 'org_id'
    ) THEN
        UPDATE public.mcp_api_keys SET tenant_id = org_id WHERE tenant_id IS NULL;
    END IF;
END $$;

ALTER TABLE public.mcp_api_keys ENABLE ROW LEVEL SECURITY;

-- RLS: Only tenant members can SELECT keys for their tenant (excluding sensitive hash via REVOKE below)
DROP POLICY IF EXISTS mcp_api_keys_select ON public.mcp_api_keys;
CREATE POLICY mcp_api_keys_select ON public.mcp_api_keys
    FOR SELECT
    USING (public.has_tenant_access(tenant_id));

-- RLS: Only owner or admin roles can INSERT/UPDATE/DELETE keys
DROP POLICY IF EXISTS mcp_api_keys_write ON public.mcp_api_keys;
CREATE POLICY mcp_api_keys_write ON public.mcp_api_keys
    FOR ALL
    USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']))
    WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']));

-- Revoke direct column access to key_hash from authenticated/anon roles
REVOKE SELECT (key_hash) ON public.mcp_api_keys FROM authenticated, anon;

-- 3. Run Events Table (Realtime Progress Log under RLS)
CREATE TABLE IF NOT EXISTS public.run_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id VARCHAR(128) NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    step_name VARCHAR(255) NOT NULL,
    status VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_run_events_tenant_run ON public.run_events(tenant_id, run_id);
ALTER TABLE public.run_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS run_events_tenant_isolation ON public.run_events;
CREATE POLICY run_events_tenant_isolation ON public.run_events
    FOR ALL
    USING (public.has_tenant_access(tenant_id));

-- 4. Enable Supabase Realtime for run_events table
ALTER PUBLICATION supabase_realtime ADD TABLE public.run_events;
