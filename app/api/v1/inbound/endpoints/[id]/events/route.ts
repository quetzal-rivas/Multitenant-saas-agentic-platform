export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { listEvents, replayEvent } from '@/lib/services/inbound';

type Params = { params: Promise<{ id: string }> };

/** Event log (newest first), optionally ?status=failed. */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    const status = req.nextUrl.searchParams.get('status') || undefined;
    return NextResponse.json(await listEvents(auth, (await params).id, { status }));
  } catch (err) {
    return errorResponse(err, 'inbound:events');
  }
}

/** { action: 'replay', event_id }: route a stored event again. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const { event_id } = z.object({ action: z.literal('replay'), event_id: z.string().uuid() }).strict().parse(await req.json());
    return NextResponse.json({ result: await replayEvent(auth, (await params).id, event_id) });
  } catch (err) {
    return errorResponse(err, 'inbound:replay');
  }
}
