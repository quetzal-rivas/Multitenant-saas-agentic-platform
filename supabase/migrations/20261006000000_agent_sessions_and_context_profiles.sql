-- Migration: 20261006000000_agent_sessions_and_context_profiles.sql
-- Description: Persist context profiles per organization, add named agent sessions
-- (Agent Studio "instances"), and turn checkpoints into a resumable, forkable chain.

-- 1. Context profiles ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.context_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    definition JSONB NOT NULL DEFAULT '{}'::jsonb,  -- full ContextProfile (lib/types.ts)
    version INT NOT NULL DEFAULT 1,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_context_profiles_tenant_slug
    ON public.context_profiles (tenant_id, slug)
    WHERE archived_at IS NULL;

ALTER TABLE public.context_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS context_profiles_select ON public.context_profiles;
CREATE POLICY context_profiles_select ON public.context_profiles
    FOR SELECT USING (public.has_tenant_access(tenant_id));

DROP POLICY IF EXISTS context_profiles_write ON public.context_profiles;
CREATE POLICY context_profiles_write ON public.context_profiles
    FOR ALL
    USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']))
    WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']));

-- 2. Agent sessions (named instances) ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    agent_type TEXT NOT NULL DEFAULT 'single' CHECK (agent_type IN ('single')),
    provider TEXT NOT NULL CHECK (provider IN ('anthropic', 'openai', 'gemini')),
    model TEXT NOT NULL,
    mcp_profile_id UUID REFERENCES public.mcp_profiles(id) ON DELETE SET NULL,
    context_profile_id UUID REFERENCES public.context_profiles(id) ON DELETE SET NULL,
    allowed_tools TEXT[] NOT NULL DEFAULT '{}',
    forked_from_checkpoint UUID,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_tenant_active
    ON public.agent_sessions (tenant_id, last_active_at DESC)
    WHERE archived_at IS NULL;

ALTER TABLE public.agent_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_sessions_member_access ON public.agent_sessions;
CREATE POLICY agent_sessions_member_access ON public.agent_sessions
    FOR ALL
    USING (public.has_tenant_access(tenant_id))
    WITH CHECK (public.has_tenant_access(tenant_id));

-- 3. Checkpoints become a chain per session ----------------------------------------
ALTER TABLE public.checkpoints
    ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.checkpoints(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS usage JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS state JSONB NOT NULL DEFAULT '[]'::jsonb;  -- full neutral message list after this turn

CREATE INDEX IF NOT EXISTS idx_checkpoints_session_step
    ON public.checkpoints (session_id, step_index);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_sessions_forked_from_checkpoint_fkey') THEN
        ALTER TABLE public.agent_sessions
            ADD CONSTRAINT agent_sessions_forked_from_checkpoint_fkey
            FOREIGN KEY (forked_from_checkpoint) REFERENCES public.checkpoints(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Checkpoints are append-only history: no UPDATE policy is defined for clients.
