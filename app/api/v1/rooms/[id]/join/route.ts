export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { joinTicket } from '@/lib/services/rooms';
import { browserToken } from '@/lib/services/telephony';

type Params = { params: Promise<{ id: string }> };

/** Listen in: a Voice SDK token plus a short-lived ticket for this room (joins muted). */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    const ticket = await joinTicket(auth, (await params).id);
    const { token } = await browserToken(auth);
    return NextResponse.json({ token, params: { room: ticket.room, ticket: ticket.ticket, exp: ticket.exp } });
  } catch (err) {
    return errorResponse(err, 'rooms:join');
  }
}
