-- Migration: 20261022000000_account_lifecycle.sql
-- Description: Real member invitations, ownership transfer and organization deletion.
-- Deleting an organization removes everyone's access, revokes its API keys and pauses its
-- agents; its data is kept (deleted_at) so it can be restored on request.

-- 1. Organization deletion (soft): who deleted it and who the members were.
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by TEXT,
    ADD COLUMN IF NOT EXISTS deleted_members JSONB;

-- 2. Pending invitations. Accepted when the invited email signs in (confirmed email only).
CREATE TABLE IF NOT EXISTS public.organization_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND char_length(email) <= 320),
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    invited_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    accepted_by UUID,
    revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_invite
    ON public.organization_invites (organization_id, email)
    WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pending_invites_email
    ON public.organization_invites (email)
    WHERE accepted_at IS NULL AND revoked_at IS NULL;
-- Server-side only (service role); no client policies.
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

-- 3. Email lookups in auth.users for the server (service role only).
CREATE OR REPLACE FUNCTION public.user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.org_member_emails(p_org UUID)
RETURNS TABLE (user_id UUID, email TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT m.user_id, u.email::TEXT
    FROM public.organization_members m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.organization_id = p_org;
$$;

REVOKE ALL ON FUNCTION public.user_id_by_email(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.org_member_emails(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_id_by_email(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.org_member_emails(UUID) TO service_role;
