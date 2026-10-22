export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { deleteOrganization } from '@/lib/services/account';

/** { confirm: "<organization name>" } deletes the organization (owner only). */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const body = await req.json().catch(() => ({}));
    return NextResponse.json(await deleteOrganization(auth, body?.confirm));
  } catch (err) {
    return errorResponse(err, 'account:delete');
  }
}
