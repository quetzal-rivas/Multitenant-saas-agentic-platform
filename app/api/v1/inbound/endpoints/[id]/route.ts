export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { publicOrigin } from '@/lib/http/public-origin';
import { archiveEndpoint, getEndpoint, updateEndpoint } from '@/lib/services/inbound';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    const endpoint = await getEndpoint(auth, (await params).id);
    return NextResponse.json({ endpoint: { ...endpoint, url: `${publicOrigin(req)}/api/hooks/${endpoint.id}` } });
  } catch (err) {
    return errorResponse(err, 'inbound:get');
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const endpoint = await updateEndpoint(auth, (await params).id, await req.json());
    return NextResponse.json({ endpoint: { ...endpoint, url: `${publicOrigin(req)}/api/hooks/${endpoint.id}` } });
  } catch (err) {
    return errorResponse(err, 'inbound:update');
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    await archiveEndpoint(auth, (await params).id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'inbound:archive');
  }
}
