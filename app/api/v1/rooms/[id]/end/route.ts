export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { endRoom } from '@/lib/services/rooms';

type Params = { params: Promise<{ id: string }> };

/** Hang up everyone in a live call. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json({ room: await endRoom(auth, (await params).id) });
  } catch (err) {
    return errorResponse(err, 'rooms:end');
  }
}
