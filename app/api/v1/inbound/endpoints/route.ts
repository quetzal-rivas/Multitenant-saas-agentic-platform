export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { publicOrigin } from '@/lib/http/public-origin';
import { createEndpoint, listEndpoints } from '@/lib/services/inbound';

/** Webhook endpoints of the organization, with their public URLs. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const base = `${publicOrigin(req)}/api/hooks/`;
    return NextResponse.json({ endpoints: (await listEndpoints(auth)).map((e) => ({ ...e, url: base + e.id })) });
  } catch (err) {
    return errorResponse(err, 'inbound:list');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const endpoint = await createEndpoint(auth, await req.json());
    return NextResponse.json({ endpoint: { ...endpoint, url: `${publicOrigin(req)}/api/hooks/${endpoint.id}` } }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 'inbound:create');
  }
}
