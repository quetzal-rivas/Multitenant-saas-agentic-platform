export const dynamic = 'force-dynamic';
// Agent turns can run several model ↔ tool steps.
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireScope } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { AGENT_SCOPES } from '@/lib/mcp/tool-catalog';
import { runSessionTurn } from '@/lib/agent/session-runner';

const body = z.object({
  session_id: z.string().uuid(),
  message: z.string().trim().min(1).max(20_000),
}).strict();

/**
 * Run one turn of an Agent Studio instance. The organization comes from the caller's
 * session or API key (scope `agent:run`), never from the request body.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['session', 'api_key']);
    requireScope(auth, AGENT_SCOPES.run);
    const { session_id, message } = body.parse(await req.json());
    return NextResponse.json(await runSessionTurn(auth, session_id, message));
  } catch (err) {
    return errorResponse(err, 'chat:generate');
  }
}
