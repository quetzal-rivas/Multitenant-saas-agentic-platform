export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { getTeam } from '@/lib/services/teams';
import { runTeamHeartbeat } from '@/lib/services/heartbeats';

/** "Run now": execute the team's heartbeat goal immediately (counts toward the daily cap). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const team = await getTeam(auth, (await params).id);
    const outcome = await runTeamHeartbeat(auth, team, { manual: true });
    return NextResponse.json({ outcome, team: await getTeam(auth, team.id) });
  } catch (err) {
    return errorResponse(err, 'agent-teams:heartbeat');
  }
}
