export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { publicOrigin } from '@/lib/http/public-origin';
import { billingPortalUrl } from '@/lib/services/billing';

/** A Stripe customer-portal session URL (card, cancellation, invoices). */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json(await billingPortalUrl(auth, `${publicOrigin(req)}/dashboard`));
  } catch (err) {
    return errorResponse(err, 'account:billing-portal');
  }
}
