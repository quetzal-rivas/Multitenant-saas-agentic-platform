-- Migration: 20261002030000_checkpoints.sql
-- Description: Create persistent schema for Checkpoints to replace in-memory mock.

DROP TABLE IF EXISTS public.checkpoints CASCADE;

CREATE TABLE public.checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checkpoint_id TEXT UNIQUE NOT NULL,
    thread_id TEXT NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL,
    profile_name TEXT,
    step_index INT NOT NULL,
    user_message TEXT NOT NULL,
    assistant_message TEXT,
    tools_executed JSONB DEFAULT '[]'::jsonb,
    compiled_tools_count INT DEFAULT 0,
    compiled_tools_names TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for thread queries
CREATE INDEX idx_checkpoints_thread_id ON public.checkpoints(thread_id);

ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can view their own checkpoints"
ON public.checkpoints FOR SELECT
USING (public.has_tenant_access(tenant_id));

CREATE POLICY "Tenants can insert their own checkpoints"
ON public.checkpoints FOR INSERT
WITH CHECK (public.has_tenant_access(tenant_id));

CREATE POLICY "Tenants can delete their own checkpoints"
ON public.checkpoints FOR DELETE
USING (public.has_tenant_access(tenant_id));
