-- Migration: 20261002010000_mcp_profiles.sql
-- Description: Create tables for MCP Server Profiles, Tools, API Keys, and Usage Metering.

-- Tool catalog (what can be exposed)
CREATE TABLE IF NOT EXISTS public.mcp_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE, -- null = global tool
  name TEXT NOT NULL,
  description TEXT,
  input_schema JSONB NOT NULL,
  est_definition_tokens INT NOT NULL DEFAULT 0, -- cost of loading this tool into context
  UNIQUE (org_id, name)
);

-- Profiles
CREATE TABLE IF NOT EXISTS public.mcp_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  token_budget INT NOT NULL CHECK (token_budget > 0),   -- total context budget
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,           -- truncation strategy, summarization, etc.
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, name)
);

-- Tool selections per profile
CREATE TABLE IF NOT EXISTS public.mcp_profile_tools (
  profile_id UUID NOT NULL REFERENCES public.mcp_profiles(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES public.mcp_tools(id) ON DELETE CASCADE,
  max_response_tokens INT,              -- per-tool cap
  description_override TEXT,            -- shorter description = fewer tokens
  position INT NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, tool_id)
);

-- API keys (hash only)
CREATE TABLE IF NOT EXISTS public.mcp_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.mcp_profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE, -- denormalized for RLS
  key_prefix TEXT NOT NULL,             -- e.g. 'cc_live_a1b2c3d4' (safe to display)
  key_hash BYTEA NOT NULL UNIQUE,       -- sha256(full key)
  label TEXT,                           -- "Alex's Cursor"
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_profile_id ON public.mcp_api_keys (profile_id);
CREATE INDEX IF NOT EXISTS idx_mcp_profile_tools_tool_id ON public.mcp_profile_tools (tool_id);

-- Usage metering (for budgets, billing, debugging)
CREATE TABLE IF NOT EXISTS public.mcp_usage_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  api_key_id UUID,
  tool_name TEXT,
  tokens_in INT,
  tokens_out INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mcp_usage_events_org_id_created_at ON public.mcp_usage_events (org_id, created_at DESC);

-- RLS
ALTER TABLE public.mcp_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_profile_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_usage_events ENABLE ROW LEVEL SECURITY;

-- Tools RLS (Global tools where org_id is null are readable by anyone, otherwise tenant_access check)
CREATE POLICY "Users can view tools in their org or global tools" ON public.mcp_tools FOR SELECT
  USING (org_id IS NULL OR public.has_tenant_access(org_id));

CREATE POLICY "Users can create tools in their org" ON public.mcp_tools FOR INSERT
  WITH CHECK (org_id IS NOT NULL AND public.has_tenant_access(org_id));

CREATE POLICY "Users can update tools in their org" ON public.mcp_tools FOR UPDATE
  USING (org_id IS NOT NULL AND public.has_tenant_access(org_id))
  WITH CHECK (org_id IS NOT NULL AND public.has_tenant_access(org_id));

CREATE POLICY "Users can delete tools in their org" ON public.mcp_tools FOR DELETE
  USING (org_id IS NOT NULL AND public.has_tenant_access(org_id));

-- Profiles RLS
CREATE POLICY "Users can view profiles in their org" ON public.mcp_profiles FOR SELECT
  USING (public.has_tenant_access(org_id));

CREATE POLICY "Admins can insert profiles" ON public.mcp_profiles FOR INSERT
  WITH CHECK (
      EXISTS (
          SELECT 1 FROM public.organization_members 
          WHERE organization_id = org_id 
          AND user_id = auth.uid() 
          AND role IN ('owner', 'admin')
      )
  );

CREATE POLICY "Admins can update profiles" ON public.mcp_profiles FOR UPDATE
  USING (
      EXISTS (
          SELECT 1 FROM public.organization_members 
          WHERE organization_id = org_id 
          AND user_id = auth.uid() 
          AND role IN ('owner', 'admin')
      )
  )
  WITH CHECK (
      EXISTS (
          SELECT 1 FROM public.organization_members 
          WHERE organization_id = org_id 
          AND user_id = auth.uid() 
          AND role IN ('owner', 'admin')
      )
  );

CREATE POLICY "Admins can delete profiles" ON public.mcp_profiles FOR DELETE
  USING (
      EXISTS (
          SELECT 1 FROM public.organization_members 
          WHERE organization_id = org_id 
          AND user_id = auth.uid() 
          AND role IN ('owner', 'admin')
      )
  );

-- Profile Tools RLS
CREATE POLICY "Users can view profile tools in their org" ON public.mcp_profile_tools FOR SELECT
  USING (
      EXISTS (
          SELECT 1 FROM public.mcp_profiles
          WHERE id = mcp_profile_tools.profile_id
          AND public.has_tenant_access(org_id)
      )
  );

CREATE POLICY "Admins can manage profile tools" ON public.mcp_profile_tools FOR ALL
  USING (
      EXISTS (
          SELECT 1 FROM public.mcp_profiles p
          JOIN public.organization_members m ON m.organization_id = p.org_id
          WHERE p.id = mcp_profile_tools.profile_id
          AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'admin')
      )
  )
  WITH CHECK (
      EXISTS (
          SELECT 1 FROM public.mcp_profiles p
          JOIN public.organization_members m ON m.organization_id = p.org_id
          WHERE p.id = mcp_profile_tools.profile_id
          AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'admin')
      )
  );

-- API Keys RLS
CREATE POLICY "Users can view api keys in their org" ON public.mcp_api_keys FOR SELECT
  USING (public.has_tenant_access(org_id));

CREATE POLICY "Admins can manage api keys" ON public.mcp_api_keys FOR ALL
  USING (
      EXISTS (
          SELECT 1 FROM public.organization_members 
          WHERE organization_id = org_id 
          AND user_id = auth.uid() 
          AND role IN ('owner', 'admin')
      )
  )
  WITH CHECK (
      EXISTS (
          SELECT 1 FROM public.organization_members 
          WHERE organization_id = org_id 
          AND user_id = auth.uid() 
          AND role IN ('owner', 'admin')
      )
  );

-- Revoke key_hash visibility for security
REVOKE SELECT (key_hash) ON public.mcp_api_keys FROM authenticated, anon;

-- Key resolution function (Security Definer)
CREATE OR REPLACE FUNCTION public.resolve_mcp_key(p_hash BYTEA)
RETURNS TABLE (profile_id UUID, org_id UUID, token_budget INT, settings JSONB, api_key_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.org_id, p.token_budget, p.settings, k.id
  FROM public.mcp_api_keys k 
  JOIN public.mcp_profiles p ON p.id = k.profile_id
  WHERE k.key_hash = p_hash
    AND k.revoked_at IS NULL
    AND (k.expires_at IS NULL OR k.expires_at > NOW())
    AND p.is_active;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_mcp_key(BYTEA) FROM public, anon, authenticated;
-- Assuming 'service_role' is an available role
GRANT EXECUTE ON FUNCTION public.resolve_mcp_key(BYTEA) TO service_role;
