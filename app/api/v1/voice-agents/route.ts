export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { publicOrigin } from '@/lib/http/public-origin';
import { createVoiceAgent, listVoiceAgents } from '@/lib/services/voice-agents';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json({ voice_agents: await listVoiceAgents(auth) });
  } catch (err) {
    return errorResponse(err, 'voice-agents:list');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json({ voice_agent: await createVoiceAgent(auth, await req.json(), publicOrigin(req)) }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 'voice-agents:create');
  }
}
