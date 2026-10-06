export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireScope } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { AGENT_SCOPES } from '@/lib/mcp/tool-catalog';
import { ServiceError } from '@/lib/services/errors';
import { MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, profileFor } from '@/lib/services/voice-api';
import { transcribeWithFallback } from '@/lib/voice/engine';

/**
 * Speech-to-text. multipart/form-data: `audio` (≤ 60 s, ≤ 4 MB), `duration` (seconds),
 * and `session_id`, `profile_id` or `profile` (JSON draft). Returns { text, provider } or
 * { fallback: 'browser' } when the client should use the browser's own recognition.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['session', 'api_key']);
    requireScope(auth, AGENT_SCOPES.run);
    const form = await req.formData().catch(() => null);
    const audio = form?.get('audio');
    if (!form || !(audio instanceof Blob)) throw new ServiceError('Send the recording as multipart field "audio".', 'INVALID');
    if (audio.size === 0) throw new ServiceError('The recording is empty.', 'INVALID');
    if (audio.size > MAX_AUDIO_BYTES) throw new ServiceError('The recording is too large (4 MB maximum, about 60 seconds).', 'INVALID');
    const duration = Math.min(MAX_AUDIO_SECONDS, Math.max(0, Number(form.get('duration')) || 0));
    const profileRaw = form.get('profile');
    const profile = await profileFor(auth, {
      session_id: (form.get('session_id') as string) || null,
      profile_id: (form.get('profile_id') as string) || null,
      profile: typeof profileRaw === 'string' && profileRaw ? JSON.parse(profileRaw) : undefined,
    });
    const started = Date.now();
    const result = await transcribeWithFallback(auth.tenantId, profile, Buffer.from(await audio.arrayBuffer()), audio.type || 'audio/webm', duration);
    return NextResponse.json({ ...result, latency_ms: Date.now() - started });
  } catch (err) {
    return errorResponse(err, 'voice:transcribe');
  }
}
