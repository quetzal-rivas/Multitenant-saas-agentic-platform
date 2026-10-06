export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { startGoogleConnect } from '@/lib/services/connections';

/** Returns Google's consent URL for the popup (PKCE state bound to this org and member). */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json(await startGoogleConnect(auth, process.env.APP_URL || req.nextUrl.origin));
  } catch (err) {
    return errorResponse(err, 'connections:google:connect');
  }
}
