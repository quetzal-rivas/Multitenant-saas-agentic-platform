export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { createTeamSession } from '@/lib/services/teams';

/** Start an Agent Studio instance that runs this team. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, 'session');
    const body = await req.json().catch(() => ({}));
    const session = await createTeamSession(auth, (await params).id, typeof body?.name === 'string' ? body.name : undefined);
    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 'agent-teams:session');
  }
}
