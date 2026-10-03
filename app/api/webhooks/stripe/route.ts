export const dynamic = 'force-dynamic';

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  isStripeEventProcessed,
  markStripeEventProcessed,
  updateTenantEntitlements,
} from '@/lib/billing/stripe-service';

const getStripeClient = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder_for_build';
  return new Stripe(secretKey, {
    apiVersion: '2026-09-30.endive' as any,
  });
};

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = (await headers()).get('stripe-signature');

    if (!signature || !webhookSecret) {
      return NextResponse.json(
        { error: 'Missing stripe signature or webhook secret' },
        { status: 400 }
      );
    }

    let event: Stripe.Event;

    try {
      const stripe = getStripeClient();
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return NextResponse.json({ error: 'Webhook Error: Invalid signature' }, { status: 400 });
    }

    // 1. Idempotency check: deduplicate processed webhook events
    const alreadyProcessed = await isStripeEventProcessed(event.id);
    if (alreadyProcessed) {
      return NextResponse.json({ received: true, deduped: true });
    }

    // Mark event as processed
    await markStripeEventProcessed(event.id, event.type);

    // 2. Handle Stripe subscription lifecycle events
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.client_reference_id;

        if (tenantId) {
          const planTier = (session.metadata?.plan_tier as any) || 'starter';
          await updateTenantEntitlements(
            tenantId,
            planTier,
            'active',
            session.customer as string,
            session.subscription as string
          );
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const tenantId = sub.metadata?.tenant_id;
        const planTier = (sub.metadata?.plan_tier as any) || 'starter';

        if (tenantId) {
          const status = sub.status === 'active' ? 'active' : sub.status;
          const periodEnd = (sub as any).current_period_end ? new Date((sub as any).current_period_end * 1000).toISOString() : undefined;

          await updateTenantEntitlements(
            tenantId,
            planTier,
            status,
            sub.customer as string,
            sub.id,
            periodEnd
          );
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const tenantId = sub.metadata?.tenant_id;

        if (tenantId) {
          // Downgrade to free tier upon subscription cancellation
          await updateTenantEntitlements(
            tenantId,
            'free',
            'canceled',
            sub.customer as string,
            sub.id
          );
        }
        break;
      }

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Stripe webhook processing failed:', error);
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
