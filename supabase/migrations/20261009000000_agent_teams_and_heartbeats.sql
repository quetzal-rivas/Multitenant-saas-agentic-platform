-- Migration: 20261009000000_agent_teams_and_heartbeats.sql
-- Description: Agent teams (supervisor + workers), team instances in Agent Studio, and
-- scheduled heartbeats driven by pg_cron -> pg_net -> /api/v1/heartbeats/tick.

-- 1. Teams ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    description TEXT,
    provider TEXT NOT NULL CHECK (provider IN ('anthropic', 'openai', 'gemini')),
    model TEXT NOT NULL,
    routing_strategy TEXT NOT NULL DEFAULT 'supervisor_router' CHECK (routing_strategy IN ('supervisor_router')),
    supervisor_instructions TEXT,
    supervisor_context_profile_id UUID REFERENCES public.context_profiles(id) ON DELETE SET NULL,
    supervisor_mcp_profile_id UUID REFERENCES public.mcp_profiles(id) ON DELETE SET NULL,
    supervisor_tools TEXT[] NOT NULL DEFAULT '{}',

    heartbeat_enabled BOOLEAN NOT NULL DEFAULT false,
    heartbeat_goal TEXT,
    heartbeat_schedule JSONB,
    heartbeat_max_runs_per_day INT NOT NULL DEFAULT 48 CHECK (heartbeat_max_runs_per_day BETWEEN 1 AND 288),
    heartbeat_session_id UUID REFERENCES public.agent_sessions(id) ON DELETE SET NULL,
    heartbeat_next_run_at TIMESTAMPTZ,
    heartbeat_last_run_at TIMESTAMPTZ,
    heartbeat_last_status TEXT CHECK (heartbeat_last_status IN ('ok', 'error', 'skipped')),
    heartbeat_last_error TEXT,
    heartbeat_runs_day DATE,
    heartbeat_runs_today INT NOT NULL DEFAULT 0,

    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_teams_tenant_name
    ON public.agent_teams (tenant_id, lower(name)) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_teams_heartbeat_due
    ON public.agent_teams (heartbeat_next_run_at) WHERE heartbeat_enabled AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.team_workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.agent_teams(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9_]{1,40}$'),
    role TEXT NOT NULL CHECK (char_length(role) BETWEEN 1 AND 300),
    instructions TEXT,
    context_profile_id UUID REFERENCES public.context_profiles(id) ON DELETE SET NULL,
    mcp_profile_id UUID REFERENCES public.mcp_profiles(id) ON DELETE SET NULL,
    tools TEXT[] NOT NULL DEFAULT '{}',
    model TEXT,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_team_workers_team ON public.team_workers (team_id, position);

ALTER TABLE public.agent_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_workers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_teams_select ON public.agent_teams;
CREATE POLICY agent_teams_select ON public.agent_teams FOR SELECT USING (public.has_tenant_access(tenant_id));
DROP POLICY IF EXISTS agent_teams_write ON public.agent_teams;
CREATE POLICY agent_teams_write ON public.agent_teams FOR ALL
    USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']))
    WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS team_workers_select ON public.team_workers;
CREATE POLICY team_workers_select ON public.team_workers FOR SELECT USING (public.has_tenant_access(tenant_id));
DROP POLICY IF EXISTS team_workers_write ON public.team_workers;
CREATE POLICY team_workers_write ON public.team_workers FOR ALL
    USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']))
    WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']));

-- 2. Agent Studio instances can run a team ----------------------------------------------
ALTER TABLE public.agent_sessions
    ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.agent_teams(id) ON DELETE SET NULL;
ALTER TABLE public.agent_sessions DROP CONSTRAINT IF EXISTS agent_sessions_agent_type_check;
ALTER TABLE public.agent_sessions
    ADD CONSTRAINT agent_sessions_agent_type_check CHECK (agent_type IN ('single', 'team'));

-- 3. Heartbeat trigger -----------------------------------------------------------------
-- Non-secret settings (the tick URL). Server-only.
CREATE TABLE IF NOT EXISTS public.platform_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.platform_settings (key, value)
VALUES ('heartbeat_tick_url', 'https://www.contextcontrol.com.mx/api/v1/heartbeats/tick')
ON CONFLICT (key) DO NOTHING;

-- The app calls this (service role only) to check the secret pg_cron sends.
CREATE OR REPLACE FUNCTION public.verify_heartbeat_secret(candidate TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE expected TEXT;
BEGIN
    IF to_regclass('vault.decrypted_secrets') IS NULL THEN RETURN FALSE; END IF;
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1'
        INTO expected USING 'heartbeat_cron_secret';
    RETURN expected IS NOT NULL AND candidate IS NOT NULL AND expected = candidate;
END $$;
REVOKE ALL ON FUNCTION public.verify_heartbeat_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_heartbeat_secret(TEXT) TO service_role;

-- pg_cron runs this every minute; it posts to the app with the Vault secret.
CREATE OR REPLACE FUNCTION public.trigger_heartbeat_tick()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE secret TEXT; url TEXT;
BEGIN
    IF to_regclass('vault.decrypted_secrets') IS NULL THEN RETURN; END IF;
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1'
        INTO secret USING 'heartbeat_cron_secret';
    SELECT value INTO url FROM public.platform_settings WHERE key = 'heartbeat_tick_url';
    IF secret IS NULL OR url IS NULL THEN RETURN; END IF;
    EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 60000)'
        USING url, '{}'::jsonb, jsonb_build_object('Content-Type', 'application/json', 'x-heartbeat-secret', secret);
END $$;
REVOKE ALL ON FUNCTION public.trigger_heartbeat_tick() FROM PUBLIC, anon, authenticated;

-- Wire it up where the platform provides pg_cron, pg_net and Vault (hosted Supabase).
-- Plain Postgres (CI replay) skips this block.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
       OR NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net')
       OR to_regnamespace('vault') IS NULL THEN
        RAISE NOTICE 'pg_cron/pg_net/vault unavailable; heartbeat scheduler not installed';
        RETURN;
    END IF;

    CREATE EXTENSION IF NOT EXISTS pg_cron;
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

    -- Generated in the database; never leaves Supabase except in the tick request header.
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'heartbeat_cron_secret') THEN
        PERFORM vault.create_secret(
            replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
            'heartbeat_cron_secret',
            'Shared secret for pg_cron -> /api/v1/heartbeats/tick'
        );
    END IF;

    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'team-heartbeat-tick';
    PERFORM cron.schedule('team-heartbeat-tick', '* * * * *', 'SELECT public.trigger_heartbeat_tick()');
END $$;
