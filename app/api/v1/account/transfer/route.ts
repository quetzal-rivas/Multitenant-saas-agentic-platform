export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { transferOwnership } from '@/lib/services/account';

/** { email } of an existing member becomes the owner; the caller becomes an admin. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const body = await req.json().catch(() => ({}));
    return NextResponse.json(await transferOwnership(auth, body?.email));
  } catch (err) {
    return errorResponse(err, 'account:transfer');
  }
}
