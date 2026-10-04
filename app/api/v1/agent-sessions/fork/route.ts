export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireScope } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { AGENT_SCOPES } from '@/lib/mcp/tool-catalog';
import { forkSession } from '@/lib/services/agent-sessions';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['session', 'api_key']);
    requireScope(auth, AGENT_SCOPES.sessionsWrite);
    const session = await forkSession(auth, await req.json());
    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 'agent-sessions:fork');
  }
}
