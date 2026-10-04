export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireScope } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { AGENT_SCOPES } from '@/lib/mcp/tool-catalog';
import { getCheckpoint, toTranscript } from '@/lib/services/agent-sessions';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, ['session', 'api_key']);
    requireScope(auth, AGENT_SCOPES.run);
    const { state, ...checkpoint } = await getCheckpoint(auth, (await params).id);
    // Provider-internal content (e.g. reasoning blocks) stays server-side.
    return NextResponse.json({ checkpoint: { ...checkpoint, transcript: toTranscript(state || []) } });
  } catch (err) {
    return errorResponse(err, 'checkpoints:get');
  }
}
