-- Migration: 20261008000000_restrict_helper_function_execute.sql
-- Description: Supabase security advisor flagged SECURITY DEFINER helpers callable via
-- /rest/v1/rpc by signed-out users. RLS policies call has_tenant_access/has_tenant_role
-- as the signed-in user, so `authenticated` keeps EXECUTE; anon/public lose it.

REVOKE EXECUTE ON FUNCTION public.has_tenant_access(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_tenant_role(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_tenant_access(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_tenant_role(UUID, TEXT[]) TO authenticated, service_role;

-- Platform-created event-trigger helper (new Supabase projects): event triggers do not
-- need role EXECUTE grants, so no API role should be able to call it directly.
DO $$
BEGIN
    IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated';
    END IF;
END $$;
