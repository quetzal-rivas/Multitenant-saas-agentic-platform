export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { listProviderVoices } from '@/lib/voice/engine';
import { VOICE_PROVIDERS } from '@/lib/voice/profile-spec';

/** GET ?provider=elevenlabs → voices available with the organization's key. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const provider = z.enum(VOICE_PROVIDERS).parse(req.nextUrl.searchParams.get('provider'));
    return NextResponse.json(await listProviderVoices(auth.tenantId, provider));
  } catch (err) {
    return errorResponse(err, 'voice:voices');
  }
}
