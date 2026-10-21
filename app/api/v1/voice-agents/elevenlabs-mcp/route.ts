export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { publicOrigin } from '@/lib/http/public-origin';
import { enableElevenLabsMcp } from '@/lib/services/voice-agents';

/** Owner/admin enables MCP servers in their ElevenLabs workspace (accepts ElevenLabs' terms), then voice agents re-sync. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json(await enableElevenLabsMcp(auth, publicOrigin(req)));
  } catch (err) {
    return errorResponse(err, 'voice-agents:elevenlabs-mcp');
  }
}
