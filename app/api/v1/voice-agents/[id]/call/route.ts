export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { placeCall } from '@/lib/services/rooms';

type Params = { params: Promise<{ id: string }> };
const body = z.object({ to: z.string().min(8).max(20), purpose: z.string().max(2000).optional() }).strict();

/** Place an outbound call with this voice agent (e.g. "call my phone" to test it). */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const { to, purpose } = body.parse(await req.json());
    return NextResponse.json(await placeCall(auth, { to: to.replace(/[\s()-]/g, ''), voice_agent_id: (await params).id, purpose }));
  } catch (err) {
    return errorResponse(err, 'voice-agents:call');
  }
}
