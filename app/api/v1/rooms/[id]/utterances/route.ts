export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { utterancesSince } from '@/lib/services/rooms';

type Params = { params: Promise<{ id: string }> };

/** Live transcript polling: ?since=<last seq seen>. Also returns notes and status. */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json(await utterancesSince(auth, (await params).id, Number(req.nextUrl.searchParams.get('since') || 0)));
  } catch (err) {
    return errorResponse(err, 'rooms:utterances');
  }
}
