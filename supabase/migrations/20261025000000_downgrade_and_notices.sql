-- Downgrades and billing notices.
--
-- After a downgrade nothing is deleted: when an organization has more agents, teams or scheduled
-- items than its plan allows, the ones beyond the limit are paused (they cannot run). Which ones
-- stay active is computed: the ones the organization chose in Billing (resource_activation, most
-- recent choice first), then the oldest. Raising the plan reactivates them without any change.

-- 1. The organization's choices of what stays active -----------------------------------------
CREATE TABLE IF NOT EXISTS public.resource_activation (
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('agents', 'teams', 'schedules')),
    -- agents: agent_sessions.id; teams: agent_teams.id; schedules: 'task:<id>' or 'heartbeat:<team id>'.
    resource_id TEXT NOT NULL,
    pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    pinned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    PRIMARY KEY (tenant_id, kind, resource_id)
);
ALTER TABLE public.resource_activation ENABLE ROW LEVEL SECURITY;

-- 2. Notices sent once per organization, kind and period (e.g. 'quota_80:runs:2026-10') ----------
CREATE TABLE IF NOT EXISTS public.billing_notices (
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    notice_key TEXT NOT NULL,
    kind TEXT NOT NULL,
    recipients INT NOT NULL DEFAULT 0,
    emailed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, notice_key)
);
ALTER TABLE public.billing_notices ENABLE ROW LEVEL SECURITY;
-- Server only (service role): no policies for anon/authenticated.

-- 3. A scheduled occurrence skipped because the plan paused it -----------------------------------
ALTER TABLE public.supervisor_tasks DROP CONSTRAINT IF EXISTS supervisor_tasks_last_status_check;
ALTER TABLE public.supervisor_tasks ADD CONSTRAINT supervisor_tasks_last_status_check
    CHECK (last_status IN ('ok', 'error', 'skipped', 'escalated', 'skipped_paused', 'skipped_plan'));
