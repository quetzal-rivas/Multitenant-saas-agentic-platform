export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { listRooms } from '@/lib/services/rooms';

/** Calls (rooms), newest first. ?live=1 → only calls happening now (the live banner). */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json({ rooms: await listRooms(auth, { live: req.nextUrl.searchParams.get('live') === '1' }) });
  } catch (err) {
    return errorResponse(err, 'rooms:list');
  }
}
