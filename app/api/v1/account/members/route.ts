export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { publicOrigin } from '@/lib/http/public-origin';
import { inviteMember, listMembers } from '@/lib/services/account';

/** Members and pending invitations of the signed-in organization. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json({ ...(await listMembers(auth)), role: auth.role });
  } catch (err) {
    return errorResponse(err, 'account:members');
  }
}

/** { email, role? } adds an existing account or emails an invitation. Owner/admin. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const result = await inviteMember(auth, await req.json(), `${publicOrigin(req)}/auth/callback?next=/onboarding`);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err, 'account:invite');
  }
}
