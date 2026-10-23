export const dynamic = 'force-dynamic';

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { handleStripeEvent } from '@/lib/billing/stripe-webhook';

/** Stripe → plan changes. Only signed events are accepted; each event is processed once. */
export async function POST(req: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret || secretKey.includes('placeholder') || webhookSecret.includes('placeholder')) {
    return NextResponse.json({ error: 'Billing is not configured on this server.' }, { status: 503 });
  }
  const signature = (await headers()).get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = new Stripe(secretKey).webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error(`[stripe-webhook] signature verification failed: ${(err as Error).message}`);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    const result = await handleStripeEvent(event);
    console.log(`[stripe-webhook] ${event.type} ${event.id}: ${result.action}`);
    return NextResponse.json({ received: true, ...result });
  } catch (err) {
    // 500 makes Stripe retry; the event was released for reprocessing.
    console.error(`[stripe-webhook] ${event.type} ${event.id} failed`, err);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
