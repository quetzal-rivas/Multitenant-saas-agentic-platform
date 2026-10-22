export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { billingSummary } from '@/lib/services/billing';

/** Plan and invoices as Stripe reports them. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json(await billingSummary(auth));
  } catch (err) {
    return errorResponse(err, 'account:billing');
  }
}
