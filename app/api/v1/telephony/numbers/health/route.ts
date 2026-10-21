export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { numbersHealth } from '@/lib/services/telephony';

/** Whether each assigned number still sends its calls (and SMS) to Context Control in Twilio. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json({ numbers: await numbersHealth(auth) });
  } catch (err) {
    return errorResponse(err, 'telephony:numbers-health');
  }
}
