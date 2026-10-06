-- Migration: 20261013000000_connections.sql
-- Description: Real MCP Hub connections. One OAuth connection per organization and auth
-- provider (Google first); tokens are KMS envelope-encrypted and only read server-side.
-- connector_states records, per connector, whether Google's official MCP server or the
-- direct API connector is used, plus the cached tool definitions.

CREATE TABLE IF NOT EXISTS public.connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    auth_provider TEXT NOT NULL CHECK (auth_provider IN ('google')),
    account_email TEXT,
    account_domain TEXT,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    encrypted_tokens JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error')),
    last_error TEXT,
    connected_by UUID,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, auth_provider)
);

CREATE TABLE IF NOT EXISTS public.connector_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    connector_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('official', 'direct', 'unavailable')),
    tools JSONB NOT NULL DEFAULT '[]'::jsonb,
    detail TEXT,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (connection_id, connector_id)
);

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connector_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS connections_select ON public.connections;
CREATE POLICY connections_select ON public.connections FOR SELECT USING (public.has_tenant_access(tenant_id));
DROP POLICY IF EXISTS connector_states_select ON public.connector_states;
CREATE POLICY connector_states_select ON public.connector_states FOR SELECT USING (public.has_tenant_access(tenant_id));
-- Writes happen server-side only (service role); tokens are never readable by clients.
REVOKE SELECT (encrypted_tokens) ON public.connections FROM authenticated, anon;

-- The old flow stored mock tokens under these names when no OAuth client was configured.
DELETE FROM public.encrypted_secrets WHERE provider IN ('google_oauth', 'slack_oauth');
