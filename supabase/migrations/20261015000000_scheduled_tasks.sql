-- Migration: 20261015000000_scheduled_tasks.sql
-- Description: Scheduled tasks become timed team runs. A task names the team that runs it,
-- a one-off time or a repeating schedule (same JSON as team heartbeats), and a retry /
-- escalation policy. The minute tick claims due tasks (compare-and-set on next_run_at)
-- and starts an agent run (origin 'task') on the worker.

ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'failed';

ALTER TABLE public.supervisor_tasks
    ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.agent_teams(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.agent_sessions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS schedule JSONB,                    -- null = one-off at target_time
    ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS paused BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS max_retries INT NOT NULL DEFAULT 2 CHECK (max_retries BETWEEN 0 AND 10),
    ADD COLUMN IF NOT EXISTS retry_delay_minutes INT NOT NULL DEFAULT 5 CHECK (retry_delay_minutes BETWEEN 1 AND 1440),
    ADD COLUMN IF NOT EXISTS attempt INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS escalate_to_board BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS escalation_team_id UUID REFERENCES public.agent_teams(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_status TEXT CHECK (last_status IN ('ok', 'error', 'skipped', 'escalated')),
    ADD COLUMN IF NOT EXISTS last_error TEXT,
    ADD COLUMN IF NOT EXISTS last_result TEXT,
    ADD COLUMN IF NOT EXISTS last_run_id UUID,
    ADD COLUMN IF NOT EXISTS run_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Existing one-off tasks become due at their target time.
UPDATE public.supervisor_tasks
SET next_run_at = target_time
WHERE next_run_at IS NULL AND target_time IS NOT NULL AND status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_supervisor_tasks_due
    ON public.supervisor_tasks (next_run_at) WHERE status = 'scheduled' AND NOT paused;

-- Agent runs can belong to a scheduled task.
ALTER TABLE public.agent_runs ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES public.supervisor_tasks(id) ON DELETE SET NULL;
ALTER TABLE public.agent_runs DROP CONSTRAINT IF EXISTS agent_runs_origin_check;
ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_origin_check CHECK (origin IN ('chat', 'heartbeat', 'task'));
CREATE INDEX IF NOT EXISTS idx_agent_runs_task ON public.agent_runs (task_id, created_at DESC) WHERE task_id IS NOT NULL;
