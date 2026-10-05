export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { createTeam, listTeams } from '@/lib/services/teams';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json({ teams: await listTeams(auth) });
  } catch (err) {
    return errorResponse(err, 'agent-teams:list');
  }
}

/** Body: a team spec (the same JSON the Team Builder exports). */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json({ team: await createTeam(auth, await req.json()) }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 'agent-teams:create');
  }
}
