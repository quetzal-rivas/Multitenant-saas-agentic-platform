import type Stripe from 'stripe';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripePriceId, type PlanId } from '@/lib/billing/plans';
import { applyPaidPlan, endPaidPlan, markPastDue } from '@/lib/services/plan-limits';

/**
 * Stripe subscription events → the organization's base plan. The plan comes from the price
 * that was paid (configured per environment), never from client-supplied metadata alone; the
 * organization comes from the subscription metadata set by our own checkout, or from the
 * stored customer id. Purchases start the next tier's one-time trial (applyPaidPlan).
 */

/** The plan a Stripe price belongs to in this environment. */
export function planForPrice(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  for (const plan of ['developer', 'pro'] as PlanId[]) if (stripePriceId(plan) === priceId) return plan;
  return null;
}

const db = () => getSupabaseAdminClient();

async function tenantForCustomer(customerId: string | null | undefined): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await db().from('entitlements').select('tenant_id').eq('stripe_customer_id', customerId).maybeSingle();
  return (data as { tenant_id?: string } | null)?.tenant_id ?? null;
}

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === 'string' ? v : v?.id ?? null);

async function currentBillingStatus(tenantId: string): Promise<string | null> {
  const { data } = await db().from('entitlements').select('billing_status').eq('tenant_id', tenantId).maybeSingle();
  return (data as { billing_status?: string } | null)?.billing_status ?? null;
}

async function onSubscription(sub: Stripe.Subscription): Promise<string> {
  const customerId = idOf(sub.customer as any);
  const tenantId = sub.metadata?.tenant_id || (await tenantForCustomer(customerId));
  if (!tenantId) return 'ignored: no organization for this subscription';
  const item = sub.items?.data?.[0];
  const plan = planForPrice(item?.price?.id);
  const periodEnd = (item as any)?.current_period_end ?? (sub as any).current_period_end;
  switch (sub.status) {
    case 'active':
    case 'trialing': {
      if (!plan) return `ignored: price ${item?.price?.id ?? 'none'} is not a Context Control plan here`;
      // Cancelling in the portal keeps the subscription active until cancel_at (or the period end).
      const cancelAt = sub.cancel_at ?? (sub.cancel_at_period_end ? periodEnd : null);
      const res = await applyPaidPlan(tenantId, plan, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.id,
        periodEndsAt: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancelAt: cancelAt ? new Date(cancelAt * 1000).toISOString() : null,
      });
      return `plan ${plan}${res.trial ? ` + ${res.trial} trial` : ''}`;
    }
    case 'past_due':
    case 'unpaid':
      // Keep the first grace period; repeated events must not extend it.
      if ((await currentBillingStatus(tenantId)) !== 'past_due') await markPastDue(tenantId);
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      await endPaidPlan(tenantId);
      return 'free';
    default:
      return `ignored: status ${sub.status}`;
  }
}

/** Handle one verified event. Each event id is processed once; a failed attempt can be retried by Stripe. */
export async function handleStripeEvent(event: Stripe.Event): Promise<{ deduped?: boolean; action: string }> {
  const { error: dup } = await db().from('processed_stripe_events').insert({ event_id: event.id, event_type: event.type });
  if (dup) {
    if (dup.code === '23505') return { deduped: true, action: 'already processed' };
    throw new Error(`Could not record the Stripe event: ${dup.message}`);
  }
  try {
    return { action: await dispatch(event) };
  } catch (err) {
    // Release the marker so Stripe's retry processes the event again.
    await db().from('processed_stripe_events').delete().eq('event_id', event.id);
    throw err;
  }
}

async function dispatch(event: Stripe.Event): Promise<string> {
  switch (event.type) {
    case 'checkout.session.completed': {
      // Links the Stripe customer to the organization; the plan arrives with the subscription event.
      const session = event.data.object as Stripe.Checkout.Session;
      const tenantId = session.client_reference_id || session.metadata?.tenant_id;
      const customerId = idOf(session.customer as any);
      if (!tenantId || !customerId) return 'ignored: missing organization or customer';
      await db().from('entitlements').update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() }).eq('tenant_id', tenantId);
      return 'customer linked';
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      if (event.type === 'customer.subscription.deleted') {
        const tenantId = sub.metadata?.tenant_id || (await tenantForCustomer(idOf(sub.customer as any)));
        if (!tenantId) return 'ignored: no organization for this subscription';
        await endPaidPlan(tenantId);
        return 'free';
      }
      return onSubscription(sub);
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const tenantId = await tenantForCustomer(idOf(invoice.customer as any));
      if (!tenantId) return 'ignored: no organization for this customer';
      if ((await currentBillingStatus(tenantId)) !== 'past_due') await markPastDue(tenantId);
      return 'past_due';
    }
    default:
      return `ignored: ${event.type}`;
  }
}
