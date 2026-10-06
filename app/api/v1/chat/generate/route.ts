export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireScope } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { AGENT_SCOPES } from '@/lib/mcp/tool-catalog';
import { startTurn } from '@/lib/services/agent-run-api';

const body = z.object({
  session_id: z.string().uuid(),
  message: z.string().trim().min(1).max(20_000),
}).strict();

/**
 * Run one turn of an Agent Studio instance. Turns that finish within ~20 s return 200 with
 * the result; longer turns return 202 { run_id, status, progress } — poll
 * GET /api/v1/agent-runs/{run_id} until it returns 200. The organization comes from the
 * caller's session or API key (scope `agent:run`), never from the request body.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['session', 'api_key']);
    requireScope(auth, AGENT_SCOPES.run);
    const { session_id, message } = body.parse(await req.json());
    const res = await startTurn(auth, session_id, message);
    return NextResponse.json(res.body, { status: res.status });
  } catch (err) {
    return errorResponse(err, 'chat:generate');
  }
}
