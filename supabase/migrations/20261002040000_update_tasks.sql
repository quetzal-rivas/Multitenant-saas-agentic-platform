-- Migration: 20261002040000_update_tasks.sql
-- Description: Add metadata column to supervisor_tasks

ALTER TABLE public.supervisor_tasks
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
