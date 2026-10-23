import Stripe from 'stripe';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import { PLANS, stripePriceId, type PlanId } from '@/lib/billing/plans';
import { ServiceError } from './errors';

type Ctx = Pick<AuthContext, 'tenantId' | 'role' | 'authMode'>;

export interface InvoiceSummary {
  id: string;
  number: string | null;
  created: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

/** Stripe calls, replaceable in tests. Null when no Stripe secret key is configured. */
export interface BillingDeps {
  stripe?: Pick<Stripe, 'invoices' | 'billingPortal' | 'checkout'> | null;
}

function stripeClient(): Pick<Stripe, 'invoices' | 'billingPortal' | 'checkout'> | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.includes('placeholder')) return null;
  return new Stripe(key);
}

/**
 * The organization's plan and invoices as Stripe records them. Nothing is shown that Stripe
 * did not report: no subscription means no plan, no customer means no invoices.
 */
export async function billingSummary(ctx: Ctx, deps: BillingDeps = {}) {
  const { data: ent } = await getSupabaseAdminClient()
    .from('entitlements')
    .select('plan_tier, status, stripe_customer_id, stripe_subscription_id, current_period_ends_at, cancel_at')
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  const subscription = ent?.stripe_subscription_id
    ? {
        plan: ent.plan_tier === 'starter' ? 'developer' : ent.plan_tier in PLANS ? (ent.plan_tier as PlanId) : null,
        plan_tier: ent.plan_tier as string,
        status: ent.status as string,
        current_period_ends_at: (ent.current_period_ends_at as string | null) ?? null,
        cancel_at: (ent.cancel_at as string | null) ?? null,
      }
    : null;

  const stripe = deps.stripe === undefined ? stripeClient() : deps.stripe;
  let invoices: InvoiceSummary[] = [];
  let invoicesError: string | null = null;
  if (ent?.stripe_customer_id && stripe) {
    try {
      const list = await stripe.invoices.list({ customer: ent.stripe_customer_id, limit: 24 });
      invoices = list.data.map((i) => ({
        id: i.id ?? '',
        number: i.number ?? null,
        created: new Date(i.created * 1000).toISOString(),
        amount_due: i.amount_due,
        amount_paid: i.amount_paid,
        currency: i.currency,
        status: i.status ?? null,
        hosted_invoice_url: i.hosted_invoice_url ?? null,
        invoice_pdf: i.invoice_pdf ?? null,
      }));
    } catch (err) {
      invoicesError = `Stripe did not return the invoices: ${(err as Error).message}`;
    }
  }
  return {
    subscription,
    has_customer: !!ent?.stripe_customer_id,
    stripe_configured: !!stripe,
    invoices,
    invoices_error: invoicesError,
    can_manage: ctx.authMode === 'session' && ['owner', 'admin'].includes(ctx.role),
  };
}

/** A Stripe customer-portal link (change card, cancel, download invoices). Owner/admin only. */
export async function billingPortalUrl(ctx: Ctx, returnUrl: string, deps: BillingDeps = {}) {
  if (ctx.authMode !== 'session' || !['owner', 'admin'].includes(ctx.role)) {
    throw new ServiceError('Only the owner or an admin can manage billing.', 'FORBIDDEN');
  }
  const { data: ent } = await getSupabaseAdminClient().from('entitlements').select('stripe_customer_id').eq('tenant_id', ctx.tenantId).maybeSingle();
  if (!ent?.stripe_customer_id) throw new ServiceError('This organization has no subscription yet.', 'CONFLICT');
  const stripe = deps.stripe === undefined ? stripeClient() : deps.stripe;
  if (!stripe) throw new ServiceError('Billing is not configured on this server.', 'CONFLICT', 503);
  try {
    const session = await stripe.billingPortal.sessions.create({ customer: ent.stripe_customer_id, return_url: returnUrl });
    return { url: session.url };
  } catch (err) {
    throw new ServiceError(`Stripe could not open the billing portal: ${(err as Error).message}`, 'CONFLICT', 502);
  }
}

/**
 * Start a subscription to a paid plan: a Stripe Checkout session created here, tied to the
 * organization (client_reference_id + subscription metadata). The plan changes only when
 * Stripe confirms the subscription (webhook), which also starts the next tier's trial.
 */
export async function createCheckout(
  ctx: Ctx & { userId?: string },
  plan: unknown,
  urls: { success: string; cancel: string },
  email: string | null,
  deps: BillingDeps = {}
) {
  if (ctx.authMode !== 'session' || !['owner', 'admin'].includes(ctx.role)) {
    throw new ServiceError('Only the owner or an admin can change the plan.', 'FORBIDDEN');
  }
  if (plan !== 'developer' && plan !== 'pro') throw new ServiceError('Choose Developer or Pro. Unlimited is offered as a trial with Pro; Enterprise by contract.', 'INVALID');
  const price = stripePriceId(plan);
  const stripe = deps.stripe === undefined ? stripeClient() : deps.stripe;
  if (!price || !stripe) throw new ServiceError('Online checkout is not configured on this server yet.', 'CONFLICT', 503);

  const { data: ent } = await getSupabaseAdminClient()
    .from('entitlements')
    .select('stripe_customer_id, stripe_subscription_id, plan_tier, billing_status')
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  // An existing subscription changes plan in the customer portal (proration handled by Stripe).
  if (ent?.stripe_subscription_id && ent.billing_status !== 'canceled') {
    throw new ServiceError('You already have a subscription. Change plans from "Manage billing".', 'CONFLICT');
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    client_reference_id: ctx.tenantId,
    ...(ent?.stripe_customer_id ? { customer: ent.stripe_customer_id } : email ? { customer_email: email } : {}),
    metadata: { tenant_id: ctx.tenantId, plan },
    subscription_data: { metadata: { tenant_id: ctx.tenantId, plan } },
    success_url: urls.success,
    cancel_url: urls.cancel,
  });
  if (!session.url) throw new ServiceError('Stripe did not return a checkout page.', 'CONFLICT', 502);
  return { url: session.url };
}
