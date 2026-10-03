-- Align the profile-oriented MCP key table with the tenant API-key endpoint.
-- Existing keys remain scoped to their original profile and keep their BYTEA hashes.

ALTER TABLE public.mcp_api_keys
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS environment VARCHAR(32) DEFAULT 'live',
    ADD COLUMN IF NOT EXISTS scopes TEXT[] DEFAULT '{*}',
    ADD COLUMN IF NOT EXISTS tools_whitelist TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS rate_limit_rpm INTEGER DEFAULT 60,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- New workspace keys are not tied to an MCP profile. Older profile keys keep theirs.
ALTER TABLE public.mcp_api_keys
    ALTER COLUMN profile_id DROP NOT NULL;

UPDATE public.mcp_api_keys
SET tenant_id = org_id
WHERE tenant_id IS NULL;

UPDATE public.mcp_api_keys
SET name = COALESCE(name, label, 'MCP API key')
WHERE name IS NULL;

ALTER TABLE public.mcp_api_keys
    ALTER COLUMN tenant_id SET NOT NULL,
    ALTER COLUMN name SET NOT NULL,
    ALTER COLUMN environment SET NOT NULL,
    ALTER COLUMN scopes SET NOT NULL,
    ALTER COLUMN tools_whitelist SET NOT NULL,
    ALTER COLUMN rate_limit_rpm SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_tenant_id
    ON public.mcp_api_keys (tenant_id);
