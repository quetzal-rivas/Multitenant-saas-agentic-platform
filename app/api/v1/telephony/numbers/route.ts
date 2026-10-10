export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { listNumbers, syncNumbers } from '@/lib/services/telephony';

/** The organization's existing Twilio numbers. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json({ numbers: await listNumbers(auth) });
  } catch (err) {
    return errorResponse(err, 'telephony:numbers');
  }
}

/** Re-read the numbers from Twilio. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json({ numbers: await syncNumbers(auth) });
  } catch (err) {
    return errorResponse(err, 'telephony:sync');
  }
}
