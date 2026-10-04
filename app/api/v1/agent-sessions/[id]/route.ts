export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireScope } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { AGENT_SCOPES } from '@/lib/mcp/tool-catalog';
import { archiveSession, getSessionDetail, updateSession } from '@/lib/services/agent-sessions';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, ['session', 'api_key']);
    requireScope(auth, AGENT_SCOPES.run);
    return NextResponse.json(await getSessionDetail(auth, (await params).id));
  } catch (err) {
    return errorResponse(err, 'agent-sessions:get');
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, ['session', 'api_key']);
    requireScope(auth, AGENT_SCOPES.sessionsWrite);
    return NextResponse.json({ session: await updateSession(auth, (await params).id, await req.json()) });
  } catch (err) {
    return errorResponse(err, 'agent-sessions:update');
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, ['session', 'api_key']);
    requireScope(auth, AGENT_SCOPES.sessionsWrite);
    await archiveSession(auth, (await params).id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'agent-sessions:archive');
  }
}
