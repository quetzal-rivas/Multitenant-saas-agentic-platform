-- Migration: 01_organizations_auth.sql
-- Description: Establish multi-tenant organizational structure and upgrade RLS policies to enforce strict data separation per tenant.

-- 1. Create organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create organization_members table to map users to tenants
CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member', -- Support for 'owner', 'admin', 'member'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

-- 3. Create helper function for RLS checks (Security Definer allows checking the table securely)
CREATE OR REPLACE FUNCTION public.has_tenant_access(target_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_members 
        WHERE organization_id = target_tenant_id 
        AND user_id = auth.uid()
    );
$$;

-- 4. Enable RLS on organizations and organization_members
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- 5. Policies for organizations
CREATE POLICY "Users can view their organizations" 
ON public.organizations FOR SELECT 
USING (public.has_tenant_access(id));

CREATE POLICY "Users can update their organizations" 
ON public.organizations FOR UPDATE 
USING (
    EXISTS (
        SELECT 1 FROM public.organization_members 
        WHERE organization_id = id 
        AND user_id = auth.uid() 
        AND role IN ('owner', 'admin')
    )
);

-- 6. Policies for organization_members
CREATE POLICY "Users can view members of their organizations" 
ON public.organization_members FOR SELECT 
USING (public.has_tenant_access(organization_id));

-- 7. Upgrade custom_functions policies to use organization membership
DROP POLICY IF EXISTS "Tenants can view their own functions" ON public.custom_functions;
DROP POLICY IF EXISTS "Tenants can insert their own functions" ON public.custom_functions;
DROP POLICY IF EXISTS "Tenants can update their own functions" ON public.custom_functions;
DROP POLICY IF EXISTS "Tenants can delete their own functions" ON public.custom_functions;

CREATE POLICY "Users can view functions in their org"
ON public.custom_functions FOR SELECT
USING (public.has_tenant_access(tenant_id));

CREATE POLICY "Users can insert functions in their org"
ON public.custom_functions FOR INSERT
WITH CHECK (public.has_tenant_access(tenant_id));

CREATE POLICY "Users can update functions in their org"
ON public.custom_functions FOR UPDATE
USING (public.has_tenant_access(tenant_id))
WITH CHECK (public.has_tenant_access(tenant_id));

CREATE POLICY "Users can delete functions in their org"
ON public.custom_functions FOR DELETE
USING (public.has_tenant_access(tenant_id));

-- 8. Upgrade supervisor_tasks policies to use organization membership
DROP POLICY IF EXISTS "Tenants can view their own tasks" ON public.supervisor_tasks;
DROP POLICY IF EXISTS "Tenants can insert their own tasks" ON public.supervisor_tasks;
DROP POLICY IF EXISTS "Tenants can update their own tasks" ON public.supervisor_tasks;
DROP POLICY IF EXISTS "Tenants can delete their own tasks" ON public.supervisor_tasks;

CREATE POLICY "Users can view tasks in their org"
ON public.supervisor_tasks FOR SELECT
USING (public.has_tenant_access(tenant_id));

CREATE POLICY "Users can insert tasks in their org"
ON public.supervisor_tasks FOR INSERT
WITH CHECK (public.has_tenant_access(tenant_id));

CREATE POLICY "Users can update tasks in their org"
ON public.supervisor_tasks FOR UPDATE
USING (public.has_tenant_access(tenant_id))
WITH CHECK (public.has_tenant_access(tenant_id));

CREATE POLICY "Users can delete tasks in their org"
ON public.supervisor_tasks FOR DELETE
USING (public.has_tenant_access(tenant_id));
