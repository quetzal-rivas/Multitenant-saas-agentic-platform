export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireScope } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { AGENT_SCOPES } from '@/lib/mcp/tool-catalog';
import { profileFor, speakBody } from '@/lib/services/voice-api';
import { speakWithFallback } from '@/lib/voice/engine';

/**
 * Text-to-speech for one chunk (≤ 600 characters; clients send a reply sentence by
 * sentence). Returns audio bytes with X-Voice-Provider, or JSON { fallback: 'browser' }.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['session', 'api_key']);
    requireScope(auth, AGENT_SCOPES.run);
    const body = speakBody.parse(await req.json());
    const profile = await profileFor(auth, body);
    const started = Date.now();
    const result = await speakWithFallback(auth.tenantId, profile, body.text);
    if ('fallback' in result) return NextResponse.json(result);
    return new NextResponse(new Uint8Array(result.audio), {
      headers: {
        'Content-Type': result.mime,
        'Cache-Control': 'no-store',
        'X-Voice-Provider': result.provider,
        'X-Voice-Fallbacks': result.attempts.map((a) => a.provider).join(','),
        'X-Voice-Latency-Ms': String(Date.now() - started),
      },
    });
  } catch (err) {
    return errorResponse(err, 'voice:speak');
  }
}
