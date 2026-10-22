import assert from 'assert';
import { test, describe, before, after, beforeEach } from 'node:test';
import { fakePostgrest, resetTables, tables } from './helpers/fake-postgrest';
import { acceptPendingInvite, deleteOrganization, inviteMember, listMembers, removeMember, revokeInvite, transferOwnership } from '../lib/services/account';
import { billingSummary, billingPortalUrl } from '../lib/services/billing';
import { compileContext } from '../lib/compiler';
import { toContextProfile } from '../lib/services/context-profiles';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const MEMBER = '33333333-3333-4333-8333-333333333333';
const STRANGER = '44444444-4444-4444-8444-444444444444';

const owner = { tenantId: ORG, userId: OWNER, role: 'owner' as const, authMode: 'session' as const };
const admin = { ...owner, userId: ADMIN, role: 'admin' as const };
const member = { ...owner, userId: MEMBER, role: 'member' as const };

describe('Account: members, invitations, ownership, deletion', () => {
  const realFetch = globalThis.fetch;
  const sent: string[] = [];
  const deps = { sendInvite: async (email: string) => void sent.push(email) };

  before(() => {
    globalThis.fetch = fakePostgrest as typeof fetch;
  });
  after(() => {
    globalThis.fetch = realFetch;
  });
  beforeEach(() => {
    sent.length = 0;
    resetTables(['organizations', 'organization_members', 'organization_invites', 'auth_users', 'api_keys', 'agent_runs', 'run_events', 'board_tasks', 'entitlements']);
    tables.organizations.push({ id: ORG, name: 'Acme', subscription_status: 'active' }, { id: OTHER_ORG, name: 'Other', subscription_status: 'active' });
    tables.auth_users.push(
      { id: OWNER, email: 'owner@acme.test' },
      { id: ADMIN, email: 'admin@acme.test' },
      { id: MEMBER, email: 'member@acme.test' },
      { id: STRANGER, email: 'someone@other.test' }
    );
    tables.organization_members.push(
      { organization_id: ORG, user_id: OWNER, role: 'owner', created_at: '2026-01-01' },
      { organization_id: ORG, user_id: ADMIN, role: 'admin', created_at: '2026-01-02' },
      { organization_id: ORG, user_id: MEMBER, role: 'member', created_at: '2026-01-03' },
      { organization_id: OTHER_ORG, user_id: STRANGER, role: 'owner', created_at: '2026-01-01' }
    );
  });

  test('members are listed with their emails; only owners and admins invite', async () => {
    const { members } = await listMembers(owner);
    assert.deepEqual(members.map((m) => `${m.email}:${m.role}:${m.you}`), ['owner@acme.test:owner:true', 'admin@acme.test:admin:false', 'member@acme.test:member:false']);
    await assert.rejects(inviteMember(member, { email: 'x@acme.test' }, 'https://app/cb', deps), /owner or an admin/);
    await assert.rejects(inviteMember(admin, { email: 'x@acme.test', role: 'admin' }, 'https://app/cb', deps), /Only the owner can invite admins/);
  });

  test('a new email gets an invitation email once and joins on its first confirmed sign-in', async () => {
    const res = await inviteMember(admin, { email: 'New@Acme.test' }, 'https://app/cb', deps);
    assert.equal(res.status, 'invited');
    await inviteMember(admin, { email: 'new@acme.test' }, 'https://app/cb', deps);
    assert.equal(tables.organization_invites.length, 1, 'one pending invitation per email');
    assert.deepEqual(sent, ['new@acme.test', 'new@acme.test']);

    const NEW = '55555555-5555-4555-8555-555555555555';
    assert.equal(await acceptPendingInvite({ id: NEW, email: 'new@acme.test', emailConfirmed: false }), null, 'unconfirmed emails do not join');
    const joined = await acceptPendingInvite({ id: NEW, email: 'new@acme.test', emailConfirmed: true });
    assert.equal(joined?.id, ORG);
    assert.ok(tables.organization_members.some((m) => m.user_id === NEW && m.organization_id === ORG && m.role === 'member'));
    assert.ok(tables.organization_invites[0].accepted_at);
  });

  test('an existing account without an organization is added; members of another organization are refused', async () => {
    const LONER = '66666666-6666-4666-8666-666666666666';
    tables.auth_users.push({ id: LONER, email: 'loner@x.test' });
    assert.equal((await inviteMember(owner, { email: 'loner@x.test' }, 'https://app/cb', deps)).status, 'added');
    assert.equal(sent.length, 0);
    await assert.rejects(inviteMember(owner, { email: 'someone@other.test' }, 'https://app/cb', deps), /another organization/);
    await assert.rejects(inviteMember(owner, { email: 'member@acme.test' }, 'https://app/cb', deps), /already a member/);
  });

  test('invitations can be cancelled; removal follows the role rules', async () => {
    await inviteMember(owner, { email: 'later@acme.test' }, 'https://app/cb', deps);
    await revokeInvite(admin, tables.organization_invites[0].id);
    assert.equal(await acceptPendingInvite({ id: 'x', email: 'later@acme.test', emailConfirmed: true }), null);

    await assert.rejects(removeMember(admin, ADMIN), /cannot remove yourself/);
    await assert.rejects(removeMember(admin, OWNER), /owner cannot be removed/);
    await removeMember(admin, MEMBER);
    assert.ok(!tables.organization_members.some((m) => m.user_id === MEMBER));
  });

  test('the owner transfers ownership to an existing member and becomes an admin', async () => {
    await assert.rejects(transferOwnership(admin, 'member@acme.test'), /Only the organization owner/);
    await assert.rejects(transferOwnership(owner, 'someone@other.test'), /not a member/);
    await transferOwnership(owner, 'member@acme.test');
    const role = (id: string) => tables.organization_members.find((m) => m.organization_id === ORG && m.user_id === id)?.role;
    assert.equal(role(MEMBER), 'owner');
    assert.equal(role(OWNER), 'admin');
  });

  test('deleting removes access, revokes keys, pauses agents and keeps the data', async () => {
    tables.api_keys.push({ id: 'k1', tenant_id: ORG, revoked_at: null }, { id: 'k2', tenant_id: OTHER_ORG, revoked_at: null });
    await assert.rejects(deleteOrganization(admin, 'Acme'), /Only the organization owner/);
    await assert.rejects(deleteOrganization(owner, 'acme'), /Type the organization name exactly/);
    await deleteOrganization(owner, 'Acme');
    const org = tables.organizations.find((o) => o.id === ORG)!;
    assert.ok(org.deleted_at && org.agents_paused_at);
    assert.equal(org.deleted_members.length, 3);
    assert.ok(!tables.organization_members.some((m) => m.organization_id === ORG));
    assert.ok(tables.api_keys.find((k) => k.id === 'k1')!.revoked_at);
    assert.equal(tables.api_keys.find((k) => k.id === 'k2')!.revoked_at, null, 'other organizations untouched');
  });
});

describe('Billing: only what Stripe reports', () => {
  const realFetch = globalThis.fetch;
  before(() => {
    globalThis.fetch = fakePostgrest as typeof fetch;
  });
  after(() => {
    globalThis.fetch = realFetch;
  });
  beforeEach(() => resetTables(['entitlements']));

  test('no subscription means no plan and no invoices', async () => {
    const res = await billingSummary(owner, { stripe: null });
    assert.equal(res.subscription, null);
    assert.deepEqual(res.invoices, []);
    await assert.rejects(billingPortalUrl(owner, 'https://app', { stripe: null }), /no subscription yet/);
  });

  test('a subscribed organization sees its plan and Stripe invoices; members cannot open the portal', async () => {
    tables.entitlements.push({ tenant_id: ORG, plan_tier: 'pro', status: 'active', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1', current_period_ends_at: '2026-11-01' });
    const stripe = {
      invoices: { list: async () => ({ data: [{ id: 'in_1', number: 'A-1', created: 1760000000, amount_due: 50000, amount_paid: 50000, currency: 'usd', status: 'paid', hosted_invoice_url: 'https://pay', invoice_pdf: null }] }) },
      billingPortal: { sessions: { create: async () => ({ url: 'https://portal' }) } },
    } as any;
    const res = await billingSummary(owner, { stripe });
    assert.equal(res.subscription?.plan, 'tier2');
    assert.equal(res.invoices[0].number, 'A-1');
    assert.equal((await billingPortalUrl(owner, 'https://app', { stripe })).url, 'https://portal');
    await assert.rejects(billingPortalUrl(member, 'https://app', { stripe }), /owner or an admin/);
  });
});

describe('Context compiler: no sample data', () => {
  const profile = toContextProfile({
    id: 'p1',
    slug: 'support',
    name: 'Support',
    description: null,
    version: 2,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    definition: {
      contract: { required: ['user_id'], optional: [] },
      budget: { maxTokens: 4000, strategy: 'truncate_lowest_priority', outputFormat: 'markdown' },
      pipeline: [
        { id: 's1', type: 'system_instructions', title: 'Rules', description: '', sourceId: 'x', priority: 10, enabled: true, config: { staticContent: 'Be brief.' } },
        { id: 's2', type: 'tenant_context', title: 'Org', description: '', sourceId: 'x', priority: 9, enabled: true, config: {} },
        { id: 's3', type: 'long_term_memory', title: 'Memory', description: '', sourceId: 'x', priority: 8, enabled: true, config: {} },
        { id: 's4', type: 'live_data', title: 'CRM', description: '', sourceId: 'x', priority: 7, enabled: true, config: {} },
        { id: 's5', type: 'agent_instructions', title: 'Empty', description: '', sourceId: 'x', priority: 6, enabled: true, config: {} },
        { id: 's6', type: 'runtime_input', title: 'Input', description: '', sourceId: 'x', priority: 5, enabled: true, config: {} },
      ],
    },
  } as any);

  test('only the profile text, the organization and the caller input reach the payload', () => {
    const res = compileContext(profile, { profile: 'support', identity: { user_id: 'u1' }, input: { query: 'Where is my order?' } }, { organization: { id: ORG, name: 'Acme' } });
    const content = res.context.content;
    assert.match(content, /Be brief\./);
    assert.match(content, /Organization: Acme/);
    assert.match(content, /Where is my order\?/);
    assert.doesNotMatch(content, /Pacific Sands|Sarah|CTR-9281|Diamond/);
    const status = Object.fromEntries(res.metadata.source_breakdown.map((b) => [b.step_id, b.status]));
    assert.deepEqual(status, { s1: 'resolved', s2: 'resolved', s3: 'not_connected', s4: 'not_connected', s5: 'empty', s6: 'resolved' });
    assert.equal(res.metadata.contract_validation.valid, true);
  });
});
