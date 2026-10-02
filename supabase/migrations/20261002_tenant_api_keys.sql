-- Migration: 20261002_tenant_api_keys.sql
-- Description: Create tenant_api_keys table to securely store BYOK API keys per organization with RLS.

CREATE TABLE IF NOT EXISTS public.tenant_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    key_name TEXT NOT NULL,
    key_value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, key_name)
);

-- Enable Row Level Security
ALTER TABLE public.tenant_api_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view keys for organizations they belong to
CREATE POLICY "Users can view tenant API keys in their org"
ON public.tenant_api_keys FOR SELECT
USING (public.has_tenant_access(organization_id));

-- RLS Policy: Users (owner/admin) can insert keys in their org
CREATE POLICY "Users can insert tenant API keys in their org"
ON public.tenant_api_keys FOR INSERT
WITH CHECK (public.has_tenant_access(organization_id));

-- RLS Policy: Users (owner/admin) can update keys in their org
CREATE POLICY "Users can update tenant API keys in their org"
ON public.tenant_api_keys FOR UPDATE
USING (public.has_tenant_access(organization_id))
WITH CHECK (public.has_tenant_access(organization_id));

-- RLS Policy: Users (owner/admin) can delete keys in their org
CREATE POLICY "Users can delete tenant API keys in their org"
ON public.tenant_api_keys FOR DELETE
USING (public.has_tenant_access(organization_id));
