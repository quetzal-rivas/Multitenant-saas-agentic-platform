export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { deleteEndpointSecret, setEndpointSecret } from '@/lib/services/inbound';

type Params = { params: Promise<{ id: string }> };
const body = z.object({ name: z.string().min(1).max(40), value: z.string().min(1).max(4000) }).strict();

/** Write-only: values are encrypted and never returned. */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const { name, value } = body.parse(await req.json());
    return NextResponse.json({ endpoint: await setEndpointSecret(auth, (await params).id, name, value) });
  } catch (err) {
    return errorResponse(err, 'inbound:secret-set');
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const name = req.nextUrl.searchParams.get('name') || '';
    return NextResponse.json({ endpoint: await deleteEndpointSecret(auth, (await params).id, name) });
  } catch (err) {
    return errorResponse(err, 'inbound:secret-delete');
  }
}
