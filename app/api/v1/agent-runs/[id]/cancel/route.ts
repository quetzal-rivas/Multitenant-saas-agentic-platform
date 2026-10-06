export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireScope } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { AGENT_SCOPES } from '@/lib/mcp/tool-catalog';
import { cancelRun } from '@/lib/services/agent-runs';

/** Stop a running turn at its next step. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, ['session', 'api_key']);
    requireScope(auth, AGENT_SCOPES.run);
    return NextResponse.json(await cancelRun(auth, (await params).id));
  } catch (err) {
    return errorResponse(err, 'agent-runs:cancel');
  }
}
