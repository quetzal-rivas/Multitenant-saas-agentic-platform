import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import type { MemberRole } from '@/lib/auth/membership';
import { stopRuns } from './agent-runs';
import { ServiceError } from './errors';
import { assertCanCreate, endPaidPlan } from './plan-limits';
import { cancelSubscriptionNow } from './billing';

type Ctx = Pick<AuthContext, 'tenantId' | 'userId' | 'role' | 'authMode'> & { apiKeyId?: string };

/** Email delivery and auth lookups, replaceable in tests. */
export interface AccountDeps {
  /** Supabase sends its "you have been invited" email with a sign-up link. */
  sendInvite?: (email: string, redirectTo: string) => Promise<void>;
}

const defaultSendInvite = async (email: string, redirectTo: string) => {
  const { error } = await getSupabaseAdminClient().auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) throw new ServiceError(`Could not send the invitation email: ${error.message}`, 'CONFLICT', 502);
};

function requireOwnerOrAdmin(ctx: Ctx) {
  if (ctx.authMode !== 'session' || !['owner', 'admin'].includes(ctx.role)) {
    throw new ServiceError('Only the owner or an admin can manage members.', 'FORBIDDEN');
  }
}

function requireOwner(ctx: Ctx, what: string) {
  if (ctx.authMode !== 'session' || ctx.role !== 'owner') throw new ServiceError(`Only the organization owner can ${what}.`, 'FORBIDDEN');
}

async function userIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdminClient().rpc('user_id_by_email', { p_email: email });
  if (error) throw new Error(`Could not look up the user: ${error.message}`);
  return (data as string | null) || null;
}

export interface MemberRow {
  user_id: string;
  email: string | null;
  role: MemberRole;
  joined_at: string;
  you: boolean;
}

/** Members (with emails) and pending invitations of the caller's organization. */
export async function listMembers(ctx: Ctx) {
  const db = getSupabaseAdminClient();
  const [{ data: members, error }, { data: emails }, { data: invites }] = await Promise.all([
    db.from('organization_members').select('user_id, role, created_at').eq('organization_id', ctx.tenantId).order('created_at', { ascending: true }),
    db.rpc('org_member_emails', { p_org: ctx.tenantId }),
    db
      .from('organization_invites')
      .select('id, email, role, created_at')
      .eq('organization_id', ctx.tenantId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: true }),
  ]);
  if (error) throw new Error(`Could not list members: ${error.message}`);
  const emailOf = new Map(((emails as Array<{ user_id: string; email: string }>) || []).map((e) => [e.user_id, e.email]));
  return {
    members: (members || []).map(
      (m): MemberRow => ({ user_id: m.user_id, email: emailOf.get(m.user_id) ?? null, role: m.role as MemberRole, joined_at: m.created_at, you: m.user_id === ctx.userId })
    ),
    invites: invites || [],
  };
}

export const inviteBody = z.object({ email: z.string().trim().toLowerCase().email().max(320), role: z.enum(['admin', 'member']).default('member') }).strict();

/**
 * Invite someone by email. Someone who already has an account (and no organization) joins
 * right away; anyone else gets Supabase's invitation email and joins on first sign-in.
 * One organization per account for now, so members of another organization are refused.
 */
export async function inviteMember(ctx: Ctx, raw: unknown, redirectTo: string, deps: AccountDeps = {}) {
  requireOwnerOrAdmin(ctx);
  const { email, role } = inviteBody.parse(raw);
  if (role === 'admin' && ctx.role !== 'owner') throw new ServiceError('Only the owner can invite admins.', 'FORBIDDEN');
  await assertCanCreate(ctx.tenantId, 'members');
  const db = getSupabaseAdminClient();

  const existingUser = await userIdByEmail(email);
  if (existingUser) {
    const { data: memberships } = await db.from('organization_members').select('organization_id').eq('user_id', existingUser);
    if ((memberships || []).some((m) => m.organization_id === ctx.tenantId)) throw new ServiceError(`${email} is already a member.`, 'CONFLICT');
    if ((memberships || []).length) {
      throw new ServiceError(`${email} already belongs to another organization. An account can belong to one organization for now.`, 'CONFLICT');
    }
    const { error } = await db.from('organization_members').insert({ organization_id: ctx.tenantId, user_id: existingUser, role });
    if (error) throw new Error(`Could not add the member: ${error.message}`);
    return { status: 'added' as const, email, role };
  }

  const { data: pending } = await db
    .from('organization_invites')
    .select('id')
    .eq('organization_id', ctx.tenantId)
    .eq('email', email)
    .is('accepted_at', null)
    .is('revoked_at', null);
  if (!pending?.length) {
    const { error } = await db.from('organization_invites').insert({ organization_id: ctx.tenantId, email, role, invited_by: ctx.userId });
    if (error) throw new Error(`Could not save the invitation: ${error.message}`);
  }
  await (deps.sendInvite ?? defaultSendInvite)(email, redirectTo);
  return { status: 'invited' as const, email, role };
}

export async function revokeInvite(ctx: Ctx, inviteId: string) {
  requireOwnerOrAdmin(ctx);
  const { data } = await getSupabaseAdminClient()
    .from('organization_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId)
    .eq('organization_id', ctx.tenantId)
    .is('accepted_at', null)
    .select('id');
  if (!data?.length) throw new ServiceError('Invitation not found.', 'NOT_FOUND');
  return { revoked: true };
}

/** Owner removes anyone but themselves; an admin removes plain members. */
export async function removeMember(ctx: Ctx, userId: string) {
  requireOwnerOrAdmin(ctx);
  if (userId === ctx.userId) throw new ServiceError('You cannot remove yourself. Transfer ownership first, or delete the organization.', 'INVALID');
  const db = getSupabaseAdminClient();
  const { data: target } = await db.from('organization_members').select('role').eq('organization_id', ctx.tenantId).eq('user_id', userId).maybeSingle();
  if (!target) throw new ServiceError('Member not found.', 'NOT_FOUND');
  if (target.role === 'owner') throw new ServiceError('The owner cannot be removed.', 'FORBIDDEN');
  if (ctx.role === 'admin' && target.role !== 'member') throw new ServiceError('Admins can only remove members.', 'FORBIDDEN');
  await db.from('organization_members').delete().eq('organization_id', ctx.tenantId).eq('user_id', userId);
  return { removed: true };
}

/** The owner hands the organization to an existing member and becomes an admin. */
export async function transferOwnership(ctx: Ctx, rawEmail: unknown) {
  requireOwner(ctx, 'transfer ownership');
  const email = z.string().trim().toLowerCase().email().parse(rawEmail);
  const db = getSupabaseAdminClient();
  const target = await userIdByEmail(email);
  const { data: member } = target
    ? await db.from('organization_members').select('role').eq('organization_id', ctx.tenantId).eq('user_id', target).maybeSingle()
    : { data: null };
  if (!target || !member) throw new ServiceError(`${email} is not a member of this organization. Invite them first.`, 'INVALID');
  if (target === ctx.userId) throw new ServiceError('You already own this organization.', 'INVALID');
  await db.from('organization_members').update({ role: 'owner' }).eq('organization_id', ctx.tenantId).eq('user_id', target);
  await db.from('organization_members').update({ role: 'admin' }).eq('organization_id', ctx.tenantId).eq('user_id', ctx.userId);
  return { owner: email };
}

/**
 * Delete the organization: agents stop, API keys are revoked, invitations are cancelled and
 * every member loses access. The data is kept (organizations.deleted_at) so it can be
 * restored on request.
 */
export async function deleteOrganization(ctx: Ctx, confirmName: unknown, deps: Parameters<typeof cancelSubscriptionNow>[1] = {}) {
  requireOwner(ctx, 'delete the organization');
  const db = getSupabaseAdminClient();
  const { data: org } = await db.from('organizations').select('id, name, deleted_at').eq('id', ctx.tenantId).maybeSingle();
  if (!org || org.deleted_at) throw new ServiceError('Organization not found.', 'NOT_FOUND');
  if (typeof confirmName !== 'string' || confirmName.trim() !== org.name) {
    throw new ServiceError('Type the organization name exactly to confirm.', 'INVALID');
  }
  // First stop billing; if Stripe can't confirm, nothing is deleted.
  if ((await cancelSubscriptionNow(ctx.tenantId, deps)).cancelled) await endPaidPlan(ctx.tenantId);
  const now = new Date().toISOString();
  await stopRuns({ tenantId: ctx.tenantId, userId: ctx.userId, authMode: ctx.authMode }, 'org');
  await db.from('mcp_api_keys').update({ revoked_at: now }).eq('tenant_id', ctx.tenantId).is('revoked_at', null);
  await db.from('organization_invites').update({ revoked_at: now }).eq('organization_id', ctx.tenantId).is('accepted_at', null).is('revoked_at', null);
  const { data: members } = await db.from('organization_members').select('user_id, role, created_at').eq('organization_id', ctx.tenantId);
  await db
    .from('organizations')
    .update({ deleted_at: now, deleted_by: `user:${ctx.userId}`, deleted_members: members || [], subscription_status: 'deleted' })
    .eq('id', ctx.tenantId);
  await db.from('organization_members').delete().eq('organization_id', ctx.tenantId);
  return { deleted: true, name: org.name };
}

/**
 * Join the organization that invited this account (on sign-in, before onboarding creates a
 * new one). Only for confirmed emails and accounts without an organization; the oldest
 * pending invitation wins.
 */
export async function acceptPendingInvite(user: { id: string; email: string | null; emailConfirmed: boolean }) {
  if (!user.email || !user.emailConfirmed) return null;
  const db = getSupabaseAdminClient();
  const { data: memberships } = await db.from('organization_members').select('organization_id').eq('user_id', user.id);
  if (memberships?.length) return null;
  const { data: invites } = await db
    .from('organization_invites')
    .select('id, organization_id, role, created_at')
    .eq('email', user.email.toLowerCase())
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: true });
  for (const invite of invites || []) {
    const { data: org } = await db.from('organizations').select('id, name, deleted_at').eq('id', invite.organization_id).maybeSingle();
    if (!org || org.deleted_at) continue;
    const { error } = await db.from('organization_members').insert({ organization_id: org.id, user_id: user.id, role: invite.role });
    if (error && error.code !== '23505') throw new Error(`Could not join the organization: ${error.message}`);
    await db.from('organization_invites').update({ accepted_at: new Date().toISOString(), accepted_by: user.id }).eq('id', invite.id);
    return { id: org.id, name: org.name, role: invite.role as MemberRole };
  }
  return null;
}
