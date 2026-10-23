import assert from 'assert';
import { test, describe, before, after, beforeEach } from 'node:test';
import { fakePostgrest, resetTables, tables } from './helpers/fake-postgrest';
import { effectivePlan, forgetPlan, initializeEntitlement, resolvePlan } from '../lib/services/plan-limits';
import { handleStripeEvent, planForPrice } from '../lib/billing/stripe-webhook';
import { createCheckout } from '../lib/services/billing';

const ORG = 'f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0';
const DAY = 86_400_000;
process.env.STRIPE_PRICE_DEVELOPER = 'price_dev_test';
process.env.STRIPE_PRICE_PRO = 'price_pro_test';

let seq = 0;
const subEvent = (type: string, status: string, price: string, extra: Record<string, unknown> = {}) =>
  ({
    id: `evt_${++seq}`,
    type,
    data: {
      object: {
        id: 'sub_1',
        customer: 'cus_1',
        status,
        metadata: { tenant_id: ORG },
        items: { data: [{ price: { id: price }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] },
        ...extra,
      },
    },
  }) as any;

const entitlement = () => tables.entitlements.find((e) => e.tenant_id === ORG)!;
const grants = () => tables.trial_grants.filter((g) => g.tenant_id === ORG).map((g) => g.tier).sort();
const planAt = (offsetDays: number) => resolvePlan(ORG, entitlement() as any, new Date(Date.now() + offsetDays * DAY)).plan;

describe('Trial chain: Free → Developer trial; Developer → Pro trial; Pro → Unlimited trial (through Stripe)', () => {
  const realFetch = globalThis.fetch;
  before(() => {
    globalThis.fetch = fakePostgrest as typeof fetch;
  });
  after(() => {
    globalThis.fetch = realFetch;
  });
  beforeEach(async () => {
    resetTables(['organizations', 'entitlements', 'trial_grants', 'usage_events', 'processed_stripe_events']);
    tables.organizations.push({ id: ORG, name: 'Chain' });
    forgetPlan();
    await initializeEntitlement(ORG);
  });

  test('prices map to plans only for this environment', () => {
    assert.equal(planForPrice('price_dev_test'), 'developer');
    assert.equal(planForPrice('price_pro_test'), 'pro');
    assert.equal(planForPrice('price_from_somewhere_else'), null);
  });

  test('sign-up → Developer trial; without a purchase it ends in Free', async () => {
    assert.equal((await effectivePlan(ORG)).plan, 'developer');
    assert.equal(planAt(8), 'free');
    assert.deepEqual(grants(), ['developer']);
  });

  test('subscribing to Developer → base Developer + 7 days of Pro, once; afterwards back to Developer', async () => {
    const res = await handleStripeEvent(subEvent('customer.subscription.created', 'active', 'price_dev_test'));
    assert.equal(res.action, 'plan developer + pro trial');
    assert.equal(entitlement().plan_tier, 'developer');
    assert.equal(entitlement().stripe_customer_id, 'cus_1');
    assert.equal(planAt(0), 'pro');
    assert.equal(planAt(8), 'developer', 'the Pro trial ends on the paid Developer plan, with no charge');

    // A renewal (same subscription, later event) does not grant again.
    await handleStripeEvent(subEvent('customer.subscription.updated', 'active', 'price_dev_test'));
    assert.deepEqual(grants(), ['developer', 'pro']);
  });

  test('subscribing to Pro → base Pro + 7 days of Unlimited, once; afterwards back to Pro', async () => {
    await handleStripeEvent(subEvent('customer.subscription.created', 'active', 'price_dev_test'));
    const res = await handleStripeEvent(subEvent('customer.subscription.updated', 'active', 'price_pro_test'));
    assert.equal(res.action, 'plan pro + unlimited trial');
    assert.equal(entitlement().plan_tier, 'pro');
    assert.equal(planAt(0), 'unlimited');
    assert.equal(planAt(8), 'pro');
    assert.deepEqual(grants(), ['developer', 'pro', 'unlimited']);
  });

  test('cancel and re-subscribe never grants a trial twice', async () => {
    await handleStripeEvent(subEvent('customer.subscription.created', 'active', 'price_dev_test'));
    await handleStripeEvent(subEvent('customer.subscription.deleted', 'canceled', 'price_dev_test'));
    assert.equal(entitlement().plan_tier, 'free');
    const res = await handleStripeEvent(subEvent('customer.subscription.created', 'active', 'price_dev_test'));
    assert.equal(res.action, 'plan developer', 'no second Pro trial');
    assert.deepEqual(grants(), ['developer', 'pro']);
  });

  test('a failed payment keeps the plan for a 7-day grace period, then Free; repeated events do not extend it', async () => {
    await handleStripeEvent(subEvent('customer.subscription.created', 'active', 'price_pro_test'));
    await handleStripeEvent({ id: `evt_${++seq}`, type: 'invoice.payment_failed', data: { object: { customer: 'cus_1' } } } as any);
    const grace = entitlement().grace_ends_at;
    assert.equal(entitlement().billing_status, 'past_due');
    await handleStripeEvent(subEvent('customer.subscription.updated', 'past_due', 'price_pro_test'));
    assert.equal(entitlement().grace_ends_at, grace);
    entitlement().trial_ends_at = new Date(Date.now() - 1).toISOString(); // end the Unlimited trial
    assert.equal(planAt(3), 'pro');
    assert.equal(planAt(8), 'free');
  });

  test('duplicate events are processed once; unknown prices and unknown organizations change nothing', async () => {
    const event = subEvent('customer.subscription.created', 'active', 'price_dev_test');
    await handleStripeEvent(event);
    assert.deepEqual(await handleStripeEvent(event), { deduped: true, action: 'already processed' });
    assert.match((await handleStripeEvent(subEvent('customer.subscription.updated', 'active', 'price_other'))).action, /not a Context Control plan/);
    assert.match((await handleStripeEvent(subEvent('customer.subscription.created', 'active', 'price_pro_test', { metadata: {}, customer: 'cus_unknown' }))).action, /no organization/);
    assert.equal(entitlement().plan_tier, 'developer');
  });

  test('checkout is created on the server for the organization, owners and admins only', async () => {
    let params: any = null;
    const stripe = { checkout: { sessions: { create: async (p: any) => ((params = p), { url: 'https://checkout.stripe.test/s' }) } } } as any;
    const owner = { tenantId: ORG, role: 'owner' as const, authMode: 'session' as const };
    const res = await createCheckout(owner, 'developer', { success: 'https://app/ok', cancel: 'https://app/no' }, 'me@x.test', { stripe });
    assert.equal(res.url, 'https://checkout.stripe.test/s');
    assert.equal(params.line_items[0].price, 'price_dev_test');
    assert.equal(params.client_reference_id, ORG);
    assert.deepEqual(params.subscription_data.metadata, { tenant_id: ORG, plan: 'developer' });
    await assert.rejects(createCheckout({ ...owner, role: 'member' as const }, 'pro', { success: '', cancel: '' }, null, { stripe }), /owner or an admin/);
    await assert.rejects(createCheckout(owner, 'unlimited', { success: '', cancel: '' }, null, { stripe }), /trial with Pro/);
  });
});
