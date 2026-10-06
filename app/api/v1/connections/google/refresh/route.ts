export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { listConnections, probeConnectors } from '@/lib/services/connections';

/** Re-detect official vs direct and reload the tool lists from Google. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    await probeConnectors(auth.tenantId);
    return NextResponse.json(await listConnections(auth));
  } catch (err) {
    return errorResponse(err, 'connections:google:refresh');
  }
}
