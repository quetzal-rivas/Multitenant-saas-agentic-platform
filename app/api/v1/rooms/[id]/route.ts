export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { getRoomDetail } from '@/lib/services/rooms';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json(await getRoomDetail(auth, (await params).id));
  } catch (err) {
    return errorResponse(err, 'rooms:get');
  }
}
