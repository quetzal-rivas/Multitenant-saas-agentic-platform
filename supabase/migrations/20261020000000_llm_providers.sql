-- Migration: 20261020000000_llm_providers.sql
-- Description: Configurable LLM providers. Provider ids are no longer a fixed list in the
-- database (validated by the application against its registry plus each organization's own
-- OpenAI-compatible providers). Each organization turns providers on/off and orders them;
-- each agent (instance, team supervisor, worker) runs in 'auto' (organization order),
-- 'preferred' (its provider first, then rotation) or 'locked' (only its provider; fails
-- instead of switching). Existing agents become 'preferred' with their current provider,
-- which is how they behave today.

-- 1. Provider ids: drop the fixed lists, keep a safe identifier shape.
DO $$
DECLARE c RECORD;
BEGIN
    FOR c IN
        SELECT conrelid::regclass AS tbl, conname
        FROM pg_constraint
        WHERE contype = 'c'
          AND conrelid IN ('public.agent_sessions'::regclass, 'public.agent_teams'::regclass)
          AND pg_get_constraintdef(oid) ILIKE '%provider%anthropic%'
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
    END LOOP;
END $$;

ALTER TABLE public.agent_sessions DROP CONSTRAINT IF EXISTS agent_sessions_provider_id_check;
ALTER TABLE public.agent_sessions ADD CONSTRAINT agent_sessions_provider_id_check CHECK (provider ~ '^[a-z0-9_-]{1,40}$');
ALTER TABLE public.agent_teams DROP CONSTRAINT IF EXISTS agent_teams_provider_id_check;
ALTER TABLE public.agent_teams ADD CONSTRAINT agent_teams_provider_id_check CHECK (provider ~ '^[a-z0-9_-]{1,40}$');

-- 2. Provider mode per agent. Existing rows keep today's behaviour ('preferred').
ALTER TABLE public.agent_sessions
    ADD COLUMN IF NOT EXISTS provider_mode TEXT NOT NULL DEFAULT 'preferred' CHECK (provider_mode IN ('auto', 'preferred', 'locked'));
ALTER TABLE public.agent_teams
    ADD COLUMN IF NOT EXISTS provider_mode TEXT NOT NULL DEFAULT 'preferred' CHECK (provider_mode IN ('auto', 'preferred', 'locked'));

-- 3. Workers can have their own provider, model and mode (null = same as the team).
ALTER TABLE public.team_workers
    ADD COLUMN IF NOT EXISTS provider TEXT CHECK (provider IS NULL OR provider ~ '^[a-z0-9_-]{1,40}$'),
    ADD COLUMN IF NOT EXISTS provider_mode TEXT CHECK (provider_mode IS NULL OR provider_mode IN ('auto', 'preferred', 'locked'));

-- 4. Organization preferences: { "order": [provider ids], "disabled": [provider ids] }.
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS llm_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 5. An organization's own OpenAI-compatible providers (DeepSeek, Mistral, Groq, OpenRouter,
-- a local gateway...). The key lives in encrypted_secrets as provider 'llm:<slug>'.
CREATE TABLE IF NOT EXISTS public.llm_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9_-]{1,40}$'),
    label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 60),
    kind TEXT NOT NULL DEFAULT 'openai_compatible' CHECK (kind IN ('openai_compatible')),
    base_url TEXT NOT NULL CHECK (base_url ~ '^https://' AND char_length(base_url) <= 300),
    default_model TEXT NOT NULL CHECK (char_length(default_model) BETWEEN 1 AND 120),
    fast_model TEXT CHECK (fast_model IS NULL OR char_length(fast_model) BETWEEN 1 AND 120),
    supports_tools BOOLEAN NOT NULL DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_llm_providers_slug ON public.llm_providers (tenant_id, slug) WHERE archived_at IS NULL;
ALTER TABLE public.llm_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS llm_providers_select ON public.llm_providers;
CREATE POLICY llm_providers_select ON public.llm_providers FOR SELECT USING (public.has_tenant_access(tenant_id));
