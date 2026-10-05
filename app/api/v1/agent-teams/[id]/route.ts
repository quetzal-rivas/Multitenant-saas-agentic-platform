export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { archiveTeam, getTeam, toTeamSpec, updateTeam } from '@/lib/services/teams';

type Params = { params: Promise<{ id: string }> };

/** Returns the team plus its spec (team-as-code export). */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    const team = await getTeam(auth, (await params).id);
    return NextResponse.json({ team, spec: toTeamSpec(team) });
  } catch (err) {
    return errorResponse(err, 'agent-teams:get');
  }
}

/** Replace the team with a full spec. */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const team = await updateTeam(auth, (await params).id, await req.json());
    return NextResponse.json({ team, spec: toTeamSpec(team) });
  } catch (err) {
    return errorResponse(err, 'agent-teams:update');
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    await archiveTeam(auth, (await params).id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'agent-teams:archive');
  }
}
