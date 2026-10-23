export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { publicOrigin } from '@/lib/http/public-origin';
import { createClient } from '@/utils/supabase/server';
import { createCheckout } from '@/lib/services/billing';

/** { plan: 'developer' | 'pro' } → a Stripe Checkout URL for this organization. Owner/admin. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const body = await req.json().catch(() => ({}));
    const { data } = await (await createClient()).auth.getUser();
    const origin = publicOrigin(req);
    return NextResponse.json(
      await createCheckout(auth, body?.plan, { success: `${origin}/dashboard?billing=success`, cancel: `${origin}/dashboard?billing=cancelled` }, data.user?.email ?? null)
    );
  } catch (err) {
    return errorResponse(err, 'account:billing-checkout');
  }
}
