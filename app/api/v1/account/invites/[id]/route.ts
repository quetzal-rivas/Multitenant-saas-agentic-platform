export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { revokeInvite } from '@/lib/services/account';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json(await revokeInvite(auth, (await params).id));
  } catch (err) {
    return errorResponse(err, 'account:revoke-invite');
  }
}
