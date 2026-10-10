export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { publicOrigin } from '@/lib/http/public-origin';
import { attestCallCompliance, browserToken, connectTwilio, disconnectTwilio, getTelephonyStatus } from '@/lib/services/telephony';

/** GET: connection + compliance status. ?token=1 also returns a browser (Voice SDK) token. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const status = await getTelephonyStatus(auth);
    if (req.nextUrl.searchParams.get('token') === '1') return NextResponse.json({ ...status, ...(await browserToken(auth)) });
    return NextResponse.json(status);
  } catch (err) {
    return errorResponse(err, 'telephony:status');
  }
}

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('connect'), account_sid: z.string().min(1).max(64), auth_token: z.string().min(1).max(128) }).strict(),
  z.object({ action: z.literal('attest_compliance') }).strict(),
]);

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const input = body.parse(await req.json());
    if (input.action === 'attest_compliance') {
      requireRole(auth, ['owner']);
      await attestCallCompliance(auth);
      return NextResponse.json(await getTelephonyStatus(auth));
    }
    requireRole(auth, ['owner', 'admin']);
    const connection = await connectTwilio(auth, input, publicOrigin(req));
    return NextResponse.json({ connection });
  } catch (err) {
    return errorResponse(err, 'telephony:connect');
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    await disconnectTwilio(auth);
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'telephony:disconnect');
  }
}
