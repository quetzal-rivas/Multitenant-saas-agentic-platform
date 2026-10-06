-- Migration: 20261014000000_agent_runs.sql
-- Description: Durable, resumable agent runs. A chat turn or heartbeat becomes a run that a
-- worker (Lambda, or the web request as a fallback) executes in time-boxed slices; the loop
-- state is saved after every step so a run can pause and continue across invocations.

CREATE TABLE IF NOT EXISTS public.agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.agent_teams(id) ON DELETE SET NULL,
    origin TEXT NOT NULL DEFAULT 'chat' CHECK (origin IN ('chat', 'heartbeat')),
    input_message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'error', 'cancelled')),
    caller JSONB NOT NULL,               -- auth context the run executes with (server-only)
    state JSONB,                         -- loop state, saved after every step
    progress JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB,                        -- final turn result
    error TEXT,
    checkpoint_id UUID,
    lease_owner TEXT,
    lease_expires_at TIMESTAMPTZ,
    invocations INT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_session ON public.agent_runs (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_active ON public.agent_runs (status, lease_expires_at) WHERE status IN ('queued', 'running');
-- At most one unfinished run per instance.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_agent_runs_active_session ON public.agent_runs (session_id) WHERE status IN ('queued', 'running');

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_runs_select ON public.agent_runs;
CREATE POLICY agent_runs_select ON public.agent_runs FOR SELECT USING (public.has_tenant_access(tenant_id));
REVOKE SELECT (caller, state) ON public.agent_runs FROM authenticated, anon;
