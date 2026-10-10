export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { publicOrigin } from '@/lib/http/public-origin';
import { archiveVoiceAgent, updateVoiceAgent } from '@/lib/services/voice-agents';

type Params = { params: Promise<{ id: string }> };

/** Save (and re-sync the ElevenLabs agent for Voice Front mode). */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json({ voice_agent: await updateVoiceAgent(auth, (await params).id, await req.json(), publicOrigin(req)) });
  } catch (err) {
    return errorResponse(err, 'voice-agents:update');
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    await archiveVoiceAgent(auth, (await params).id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'voice-agents:archive');
  }
}
