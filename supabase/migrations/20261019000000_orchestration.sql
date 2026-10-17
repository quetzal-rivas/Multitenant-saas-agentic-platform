-- Migration: 20261019000000_orchestration.sql
-- Description: Orchestration over MCP. External orchestrators (any MCP client with an
-- API key) create agents, launch runs in batches, wait, message and cancel them, within
-- per-organization limits and a kill switch. Runs are created only through
-- start_agent_run(), which checks pause / concurrency / daily tokens and idempotency
-- atomically (per-tenant advisory lock). Runs can later be "external" (a cloud coding
-- agent) without API changes. Board text records who wrote it (human, orchestrator,
-- agent, system) so agent-written text can be treated as untrusted data.

ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS agent_limits JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS agents_paused_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS agents_paused_by TEXT;

ALTER TABLE public.agent_sessions
    ADD COLUMN IF NOT EXISTS instructions TEXT CHECK (instructions IS NULL OR char_length(instructions) <= 8000),
    ADD COLUMN IF NOT EXISTS created_by_key UUID;

ALTER TABLE public.agent_runs
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'internal' CHECK (kind IN ('internal', 'external')),
    ADD COLUMN IF NOT EXISTS external_ref JSONB,
    ADD COLUMN IF NOT EXISTS labels JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS client_ref TEXT CHECK (client_ref IS NULL OR char_length(client_ref) BETWEEN 1 AND 200),
    ADD COLUMN IF NOT EXISTS max_tokens INT,
    ADD COLUMN IF NOT EXISTS max_steps INT,
    ADD COLUMN IF NOT EXISTS max_duration_seconds INT,
    ADD COLUMN IF NOT EXISTS output_schema JSONB,
    ADD COLUMN IF NOT EXISTS tokens_used INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS usage_by_worker JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_agent_runs_client_ref ON public.agent_runs (tenant_id, client_ref) WHERE client_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_runs_labels ON public.agent_runs USING GIN (labels);
CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant_created ON public.agent_runs (tenant_id, created_at DESC);

-- Messages an orchestrator sends to a running agent (read at its next step).
CREATE TABLE IF NOT EXISTS public.agent_run_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 4000),
    sent_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_agent_run_messages_pending ON public.agent_run_messages (run_id, created_at) WHERE consumed_at IS NULL;
ALTER TABLE public.agent_run_messages ENABLE ROW LEVEL SECURITY;

-- Scheduled tasks due while runs are paused are skipped (and keep their schedule).
ALTER TABLE public.supervisor_tasks DROP CONSTRAINT IF EXISTS supervisor_tasks_last_status_check;
ALTER TABLE public.supervisor_tasks ADD CONSTRAINT supervisor_tasks_last_status_check
    CHECK (last_status IN ('ok', 'error', 'skipped', 'escalated', 'skipped_paused'));

-- Who wrote Board text.
ALTER TABLE public.board_tasks
    ADD COLUMN IF NOT EXISTS author_kind TEXT NOT NULL DEFAULT 'human' CHECK (author_kind IN ('human', 'orchestrator', 'agent', 'system')),
    ADD COLUMN IF NOT EXISTS handoff_note_kind TEXT CHECK (handoff_note_kind IN ('human', 'orchestrator', 'agent', 'system'));
ALTER TABLE public.board_task_events
    ADD COLUMN IF NOT EXISTS actor_kind TEXT CHECK (actor_kind IN ('human', 'orchestrator', 'agent', 'system'));

-- The only way to create a run: limits and idempotency are checked atomically.
-- p_run carries every column of the new row (including id and timestamps).
CREATE OR REPLACE FUNCTION public.start_agent_run(p_run JSONB, p_max_concurrent INT, p_max_tokens_day BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant UUID := (p_run->>'tenant_id')::uuid;
    v_ref TEXT := NULLIF(p_run->>'client_ref', '');
    v_existing UUID;
    v_paused TIMESTAMPTZ;
    v_active INT;
    v_used BIGINT;
    v_new public.agent_runs;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(v_tenant::text));

    IF v_ref IS NOT NULL THEN
        SELECT id INTO v_existing FROM public.agent_runs WHERE tenant_id = v_tenant AND client_ref = v_ref;
        IF FOUND THEN
            RETURN jsonb_build_object('outcome', 'reused', 'run_id', v_existing);
        END IF;
    END IF;

    SELECT agents_paused_at INTO v_paused FROM public.organizations WHERE id = v_tenant;
    IF v_paused IS NOT NULL THEN
        RETURN jsonb_build_object('outcome', 'paused', 'paused_at', v_paused);
    END IF;

    SELECT count(*) INTO v_active FROM public.agent_runs WHERE tenant_id = v_tenant AND status IN ('queued', 'running');
    IF v_active >= p_max_concurrent THEN
        RETURN jsonb_build_object('outcome', 'concurrency', 'active', v_active, 'limit', p_max_concurrent);
    END IF;

    SELECT COALESCE(SUM(tokens_used), 0) INTO v_used FROM public.agent_runs
    WHERE tenant_id = v_tenant AND created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
    IF v_used >= p_max_tokens_day THEN
        RETURN jsonb_build_object('outcome', 'daily_cap', 'used', v_used, 'limit', p_max_tokens_day);
    END IF;

    BEGIN
        INSERT INTO public.agent_runs SELECT * FROM jsonb_populate_record(NULL::public.agent_runs, p_run) RETURNING * INTO v_new;
    EXCEPTION WHEN unique_violation THEN
        -- uniq_agent_runs_active_session: the instance is already working.
        RETURN jsonb_build_object('outcome', 'busy');
    END;
    RETURN jsonb_build_object('outcome', 'created', 'run_id', v_new.id);
END;
$$;

REVOKE ALL ON FUNCTION public.start_agent_run(JSONB, INT, BIGINT) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.start_agent_run(JSONB, INT, BIGINT) FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.start_agent_run(JSONB, INT, BIGINT) FROM authenticated';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.start_agent_run(JSONB, INT, BIGINT) TO service_role';
    END IF;
END $$;
