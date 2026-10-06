-- Migration: 20261012000000_function_studio.sql
-- Description: AI Function Studio. User functions are deployed as isolated AWS Lambdas
-- (one per function), tested for real, and exposed to agents as tools via MCP profiles.
-- Secrets are KMS envelope-encrypted; every invocation is recorded.

ALTER TABLE public.custom_functions
    ADD COLUMN IF NOT EXISTS description TEXT CHECK (char_length(description) <= 1000),
    ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'python',
    ADD COLUMN IF NOT EXISTS lambda_name TEXT,
    ADD COLUMN IF NOT EXISTS deployed_code_hash TEXT,
    ADD COLUMN IF NOT EXISTS deployed_version TEXT,
    ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_error TEXT,
    ADD COLUMN IF NOT EXISTS timeout_seconds INT NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS memory_mb INT NOT NULL DEFAULT 256,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Earlier rows were never deployed anywhere.
UPDATE public.custom_functions SET status = 'draft' WHERE status IS NULL OR status NOT IN ('draft', 'deploying', 'deployed', 'failed');
ALTER TABLE public.custom_functions ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE public.custom_functions ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.custom_functions ALTER COLUMN input_schema SET DEFAULT '{"type":"object","properties":{}}'::jsonb;

ALTER TABLE public.custom_functions DROP CONSTRAINT IF EXISTS custom_functions_status_check;
ALTER TABLE public.custom_functions ADD CONSTRAINT custom_functions_status_check
    CHECK (status IN ('draft', 'deploying', 'deployed', 'failed'));
ALTER TABLE public.custom_functions DROP CONSTRAINT IF EXISTS custom_functions_language_check;
ALTER TABLE public.custom_functions ADD CONSTRAINT custom_functions_language_check
    CHECK (language IN ('python', 'typescript'));
ALTER TABLE public.custom_functions DROP CONSTRAINT IF EXISTS custom_functions_slug_check;
ALTER TABLE public.custom_functions ADD CONSTRAINT custom_functions_slug_check
    CHECK (function_slug ~ '^[a-z][a-z0-9_]{0,47}$') NOT VALID;
ALTER TABLE public.custom_functions DROP CONSTRAINT IF EXISTS custom_functions_limits_check;
ALTER TABLE public.custom_functions ADD CONSTRAINT custom_functions_limits_check
    CHECK (timeout_seconds BETWEEN 1 AND 30 AND memory_mb BETWEEN 128 AND 1024 AND char_length(code) <= 100000);

-- Members read; owners/admins write. Replace whatever policies existed.
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT polname FROM pg_policy WHERE polrelid = 'public.custom_functions'::regclass LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.custom_functions', pol.polname);
    END LOOP;
END $$;
ALTER TABLE public.custom_functions ENABLE ROW LEVEL SECURITY;
CREATE POLICY custom_functions_select ON public.custom_functions FOR SELECT USING (public.has_tenant_access(tenant_id));
CREATE POLICY custom_functions_write ON public.custom_functions FOR ALL
    USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']))
    WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']));

-- Secret values for a function (env vars). Server-only: no client policies.
CREATE TABLE IF NOT EXISTS public.function_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    function_id UUID NOT NULL REFERENCES public.custom_functions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (name ~ '^[A-Z][A-Z0-9_]{0,63}$'),
    encrypted_payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (function_id, name)
);
ALTER TABLE public.function_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.function_invocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    function_id UUID NOT NULL REFERENCES public.custom_functions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    caller TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('test', 'agent', 'mcp')),
    status TEXT NOT NULL CHECK (status IN ('ok', 'error', 'timeout')),
    duration_ms INT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_function_invocations_function ON public.function_invocations (function_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_function_invocations_tenant_day ON public.function_invocations (tenant_id, created_at);
ALTER TABLE public.function_invocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS function_invocations_select ON public.function_invocations;
CREATE POLICY function_invocations_select ON public.function_invocations FOR SELECT USING (public.has_tenant_access(tenant_id));
