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
  /** 'voice' when the message was spoken; the reply is shaped for being read aloud. */
  channel: z.enum(['text', 'voice']).default('text'),
  /** Voice metadata from the client (providers used, audio seconds, latency). */
  voice: z.object({
    stt_provider: z.string().max(20).optional(),
    audio_seconds: z.number().min(0).max(600).optional(),
    stt_latency_ms: z.number().int().min(0).max(600_000).optional(),
  }).strict().optional(),
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
    const { session_id, message, channel, voice } = body.parse(await req.json());
    const res = await startTurn(auth, session_id, message, { channel, voice: channel === 'voice' ? voice ?? {} : null });
    return NextResponse.json(res.body, { status: res.status });
  } catch (err) {
    return errorResponse(err, 'chat:generate');
  }
}
