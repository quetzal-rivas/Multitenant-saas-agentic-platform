-- Migration: 20261010000000_supervisor_board.sql
-- Description: Per-organization Supervisor Board. Teams and agents post tasks, claim
-- them with time-limited leases, and complete or fail them. Humans manage the board
-- from the UI. Every change is recorded in board_task_events.

CREATE TABLE IF NOT EXISTS public.board_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    description TEXT,
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    labels TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'done', 'failed', 'cancelled')),

    -- When set, only this team may claim the task.
    assigned_team_id UUID REFERENCES public.agent_teams(id) ON DELETE SET NULL,

    posted_by TEXT NOT NULL,                 -- 'user:<id>' | 'team:<id>' | 'api_key:<id>'
    posted_by_team_id UUID REFERENCES public.agent_teams(id) ON DELETE SET NULL,

    claimed_by TEXT,
    claimed_by_team_id UUID REFERENCES public.agent_teams(id) ON DELETE SET NULL,
    claimed_at TIMESTAMPTZ,
    lease_expires_at TIMESTAMPTZ,
    attempts INT NOT NULL DEFAULT 0,

    result TEXT,
    result_data JSONB,
    failure_reason TEXT,

    due_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT board_tasks_claim_consistency CHECK (
        status <> 'claimed' OR (claimed_by IS NOT NULL AND lease_expires_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_board_tasks_tenant_status
    ON public.board_tasks (tenant_id, status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_board_tasks_tenant_lease
    ON public.board_tasks (tenant_id, lease_expires_at) WHERE status = 'claimed';
CREATE INDEX IF NOT EXISTS idx_board_tasks_assigned
    ON public.board_tasks (tenant_id, assigned_team_id) WHERE assigned_team_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.board_task_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.board_tasks(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    event TEXT NOT NULL CHECK (event IN (
        'posted', 'edited', 'assigned', 'claimed', 'renewed', 'released', 'lease_expired',
        'completed', 'failed', 'cancelled', 'reopened'
    )),
    actor TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_board_task_events_task ON public.board_task_events (task_id, created_at);

ALTER TABLE public.board_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_task_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_tasks_select ON public.board_tasks;
CREATE POLICY board_tasks_select ON public.board_tasks FOR SELECT USING (public.has_tenant_access(tenant_id));
DROP POLICY IF EXISTS board_tasks_write ON public.board_tasks;
CREATE POLICY board_tasks_write ON public.board_tasks FOR ALL
    USING (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']))
    WITH CHECK (public.has_tenant_role(tenant_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS board_task_events_select ON public.board_task_events;
CREATE POLICY board_task_events_select ON public.board_task_events FOR SELECT USING (public.has_tenant_access(tenant_id));
-- Events are append-only and written by the server only (no client write policy).
