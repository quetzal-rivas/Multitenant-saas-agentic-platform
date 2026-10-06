export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { archiveVoiceProfile, getVoiceProfile, updateVoiceProfile } from '@/lib/services/voice-profiles';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json({ profile: await getVoiceProfile(auth, (await params).id) });
  } catch (err) {
    return errorResponse(err, 'voice-profiles:get');
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json({ profile: await updateVoiceProfile(auth, (await params).id, await req.json()) });
  } catch (err) {
    return errorResponse(err, 'voice-profiles:update');
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    await archiveVoiceProfile(auth, (await params).id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'voice-profiles:archive');
  }
}
