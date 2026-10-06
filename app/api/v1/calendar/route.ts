export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { ServiceError } from '@/lib/services/errors';
import { calendarItems } from '@/lib/services/calendar';

const MAX_RANGE_DAYS = 62;

/** Timed items for ?from=ISO&to=ISO (default: the next 7 days). */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const q = req.nextUrl.searchParams;
    const from = q.get('from') ? new Date(q.get('from')!) : new Date();
    const to = q.get('to') ? new Date(q.get('to')!) : new Date(from.getTime() + 7 * 86_400_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) throw new ServiceError('from and to must be ISO dates with from < to.', 'INVALID');
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) throw new ServiceError(`The range can be at most ${MAX_RANGE_DAYS} days.`, 'INVALID');
    return NextResponse.json(await calendarItems(auth, from, to));
  } catch (err) {
    return errorResponse(err, 'calendar');
  }
}
