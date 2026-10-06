export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { publicOrigin } from '@/lib/http/public-origin';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { listConnections } from '@/lib/services/connections';

/** MCP Hub overview: platform server, Google connection, web search. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const data = await listConnections(auth);
    return NextResponse.json({ ...data, platform: { ...data.platform, url: `${publicOrigin(req)}${data.platform.path}` } });
  } catch (err) {
    return errorResponse(err, 'connections:list');
  }
}
