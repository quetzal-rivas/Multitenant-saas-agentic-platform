export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { removeMember } from '@/lib/services/account';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json(await removeMember(auth, (await params).userId));
  } catch (err) {
    return errorResponse(err, 'account:remove-member');
  }
}
