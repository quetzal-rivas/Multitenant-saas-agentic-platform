export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { archiveContextProfile, getContextProfile, updateContextProfile } from '@/lib/services/context-profiles';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json({ profile: await getContextProfile(auth, (await params).id) });
  } catch (err) {
    return errorResponse(err, 'context-profiles:get');
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const profile = await updateContextProfile(auth, (await params).id, await req.json());
    return NextResponse.json({ profile });
  } catch (err) {
    return errorResponse(err, 'context-profiles:update');
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    await archiveContextProfile(auth, (await params).id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'context-profiles:archive');
  }
}
