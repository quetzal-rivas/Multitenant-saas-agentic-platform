export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { createContextProfile, listContextProfiles } from '@/lib/services/context-profiles';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json({ profiles: await listContextProfiles(auth) });
  } catch (err) {
    return errorResponse(err, 'context-profiles:list');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const profile = await createContextProfile(auth, await req.json());
    return NextResponse.json({ profile }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 'context-profiles:create');
  }
}
