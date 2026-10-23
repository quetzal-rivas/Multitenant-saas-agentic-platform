export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { usageSummary } from '@/lib/services/plan-limits';

/** The organization's effective plan, trial, limits and current usage. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json(await usageSummary(auth.tenantId));
  } catch (err) {
    return errorResponse(err, 'account:usage');
  }
}
