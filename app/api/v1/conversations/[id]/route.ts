export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { getConversation } from '@/lib/services/conversations';

type Params = { params: Promise<{ id: string }> };

/** Transcript plus the runs (chat, voice, heartbeat, task) of one instance. */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json(await getConversation(auth, (await params).id));
  } catch (err) {
    return errorResponse(err, 'conversations:get');
  }
}
