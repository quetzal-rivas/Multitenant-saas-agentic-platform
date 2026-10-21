export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { deleteCustomProvider, updateCustomProvider } from '@/lib/services/llm-providers';

type Params = { params: Promise<{ id: string }> };

/** Edit one of the organization's own providers (a new key or URL is checked first). */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json(await updateCustomProvider(auth, (await params).id, await req.json()));
  } catch (err) {
    return errorResponse(err, 'llm-providers:update');
  }
}

/** Remove one of the organization's own providers (refused while an agent is locked to it). */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json(await deleteCustomProvider(auth, (await params).id));
  } catch (err) {
    return errorResponse(err, 'llm-providers:delete');
  }
}
