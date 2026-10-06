export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireScope } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { AGENT_SCOPES } from '@/lib/mcp/tool-catalog';
import { checkTurn } from '@/lib/services/agent-run-api';

/** Progress of a long turn: 202 while working (status, progress), 200 with the result when done. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, ['session', 'api_key']);
    requireScope(auth, AGENT_SCOPES.run);
    const res = await checkTurn(auth, (await params).id);
    return NextResponse.json(res.body, { status: res.status });
  } catch (err) {
    return errorResponse(err, 'agent-runs:get');
  }
}
