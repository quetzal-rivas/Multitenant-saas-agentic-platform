-- Migration: 20261011000000_board_handover_and_idle_heartbeats.sql
-- Description:
--   Board: claims are held by a run (not just a team), progress notes, handover requests
--   and late results, so work is handed over instead of discarded.
--   Heartbeats: optional "wake only when the board has work" condition; skipped wake-ups
--   are recorded as 'idle' and do not call the LLM.

ALTER TABLE public.board_tasks
    ADD COLUMN IF NOT EXISTS claim_run_id TEXT,              -- run holding the claim; NULL = parked (any run of the holder may resume)
    ADD COLUMN IF NOT EXISTS handoff_note TEXT CHECK (char_length(handoff_note) <= 2000),
    ADD COLUMN IF NOT EXISTS handover_requested_by TEXT,
    ADD COLUMN IF NOT EXISTS handover_requested_by_team_id UUID REFERENCES public.agent_teams(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS handover_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS late_result TEXT CHECK (char_length(late_result) <= 20000),
    ADD COLUMN IF NOT EXISTS late_result_by TEXT;

ALTER TABLE public.board_task_events DROP CONSTRAINT IF EXISTS board_task_events_event_check;
ALTER TABLE public.board_task_events ADD CONSTRAINT board_task_events_event_check CHECK (event IN (
    'posted', 'edited', 'assigned', 'claimed', 'renewed', 'released', 'lease_expired',
    'completed', 'failed', 'cancelled', 'reopened',
    'note', 'resumed', 'handover_requested', 'handed_over', 'late_result'
));

ALTER TABLE public.agent_teams
    ADD COLUMN IF NOT EXISTS heartbeat_wake_when TEXT NOT NULL DEFAULT 'always'
        CHECK (heartbeat_wake_when IN ('always', 'board_has_work'));

ALTER TABLE public.agent_teams DROP CONSTRAINT IF EXISTS agent_teams_heartbeat_last_status_check;
ALTER TABLE public.agent_teams ADD CONSTRAINT agent_teams_heartbeat_last_status_check
    CHECK (heartbeat_last_status IN ('ok', 'error', 'skipped', 'idle'));
