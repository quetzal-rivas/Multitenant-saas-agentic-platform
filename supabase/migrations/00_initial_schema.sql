-- Migration: 00_initial_schema.sql
-- Description: Create persistent schema for Custom Functions and Supervisor Tasks with RLS.

-- 1. Create custom_functions table
CREATE TABLE IF NOT EXISTS public.custom_functions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    function_slug TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    input_schema JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'active'
);

-- Ensure function slugs are unique per tenant
CREATE UNIQUE INDEX idx_custom_functions_tenant_slug 
ON public.custom_functions (tenant_id, function_slug);

-- 2. Create supervisor_tasks table
-- Enum for task status
CREATE TYPE task_status AS ENUM ('scheduled', 'active', 'completed', 'escalated');

CREATE TABLE IF NOT EXISTS public.supervisor_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status task_status DEFAULT 'scheduled',
    target_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Enable Row-Level Security (RLS)
ALTER TABLE public.custom_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_tasks ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies
-- custom_functions policies
CREATE POLICY "Tenants can view their own functions"
ON public.custom_functions
FOR SELECT
USING (tenant_id = auth.uid());

CREATE POLICY "Tenants can insert their own functions"
ON public.custom_functions
FOR INSERT
WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Tenants can update their own functions"
ON public.custom_functions
FOR UPDATE
USING (tenant_id = auth.uid())
WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Tenants can delete their own functions"
ON public.custom_functions
FOR DELETE
USING (tenant_id = auth.uid());

-- supervisor_tasks policies
CREATE POLICY "Tenants can view their own tasks"
ON public.supervisor_tasks
FOR SELECT
USING (tenant_id = auth.uid());

CREATE POLICY "Tenants can insert their own tasks"
ON public.supervisor_tasks
FOR INSERT
WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Tenants can update their own tasks"
ON public.supervisor_tasks
FOR UPDATE
USING (tenant_id = auth.uid())
WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Tenants can delete their own tasks"
ON public.supervisor_tasks
FOR DELETE
USING (tenant_id = auth.uid());
