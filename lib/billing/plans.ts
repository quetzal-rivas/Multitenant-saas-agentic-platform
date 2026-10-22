/**
 * The plans sold on the landing page and in Account & Billing (one list for both). Payment
 * links are Stripe Payment Links; the organization id travels as client_reference_id so the
 * webhook can attach the subscription to it.
 */
export interface Plan {
  id: 'tier1' | 'tier2' | 'enterprise';
  name: string;
  blurb: string;
  monthlyUsd: number;
  setupFeeUsd?: number;
  features: string[];
  paymentLink: string;
  /** entitlements.plan_tier this plan maps to. */
  entitlementTier: 'starter' | 'pro' | 'enterprise';
  highlighted?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: 'tier1',
    name: 'Tier 1',
    blurb: 'Ideal for testing and building custom agent teams.',
    monthlyUsd: 250,
    features: ['Bring Your Own Key (BYOK)', '1 Organization', 'Agent Studio & Team Builder', 'Standard MCP Tool Connections'],
    paymentLink: 'https://buy.stripe.com/5kQ5kw78h5OWfrkcprdjO04',
    entitlementTier: 'starter',
  },
  {
    id: 'tier2',
    name: 'Tier 2',
    blurb: 'For growing teams needing unlimited scale.',
    monthlyUsd: 500,
    features: ['Bring Your Own Key (BYOK)', 'Unlimited Organizations', 'ElevenLabs Voice Calls & Twilio Lines', 'Unlimited MCP Tool Hub Spokes'],
    paymentLink: 'https://buy.stripe.com/3cIeV61NXcdk0wqexzdjO05',
    entitlementTier: 'pro',
    highlighted: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    blurb: 'Dedicated SLA, custom MCP connectors & priority support.',
    monthlyUsd: 150,
    setupFeeUsd: 1500,
    features: ['We provide the API Keys', 'Unlimited Organizations', 'Dedicated Account Manager & Onboarding', '99.99% Guaranteed SLA'],
    paymentLink: 'https://buy.stripe.com/eVq6oA5095OW1Au4WZdjO06',
    entitlementTier: 'enterprise',
  },
];

/** The payment link tied to an organization (and prefilled with the buyer's email). */
export function checkoutUrl(plan: Plan, orgId?: string, email?: string | null): string {
  const url = new URL(plan.paymentLink);
  if (orgId) url.searchParams.set('client_reference_id', orgId);
  if (email) url.searchParams.set('prefilled_email', email);
  return url.toString();
}
