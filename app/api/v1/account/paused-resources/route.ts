export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { keepActive, pausedResources } from '@/lib/services/plan-activation';

/** Agents, teams and scheduled items the plan pauses (only kinds over their limit). */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json({ kinds: await pausedResources(auth.tenantId) });
  } catch (err) {
    return errorResponse(err, 'account:paused-resources');
  }
}

/** { kind, id } → keep that item active instead of another one. Owner/admin. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ kinds: await keepActive(auth, body?.kind, body?.id) });
  } catch (err) {
    return errorResponse(err, 'account:paused-resources');
  }
}
