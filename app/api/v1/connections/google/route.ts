export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { disconnectGoogle } from '@/lib/services/connections';

/** Disconnect Google: revokes the grant at Google and deletes the stored tokens. */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json(await disconnectGoogle(auth));
  } catch (err) {
    return errorResponse(err, 'connections:google:disconnect');
  }
}
