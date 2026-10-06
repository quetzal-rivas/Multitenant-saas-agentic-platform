export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { createVoiceProfile, listVoiceProfiles } from '@/lib/services/voice-profiles';
import { voiceProviderStatus } from '@/lib/voice/engine';

/** Voice profiles plus which voice providers have keys in this organization. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const [profiles, providers] = await Promise.all([listVoiceProfiles(auth), voiceProviderStatus(auth.tenantId)]);
    return NextResponse.json({ profiles, providers });
  } catch (err) {
    return errorResponse(err, 'voice-profiles:list');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json({ profile: await createVoiceProfile(auth, await req.json()) }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 'voice-profiles:create');
  }
}
