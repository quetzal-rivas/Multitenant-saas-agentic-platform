export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { resumeRuns, stopRuns } from '@/lib/services/agent-runs';
import { runControlStatus } from '@/lib/services/orchestration';

/** Is the organization's kill switch on, who pulled it, and recent stops per key. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json(await runControlStatus(auth));
  } catch (err) {
    return errorResponse(err, 'agent-runs:control');
  }
}

/** { action: 'stop' } pauses every agent run of the organization; { action: 'resume' } lifts it. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const { action } = z.object({ action: z.enum(['stop', 'resume']) }).strict().parse(await req.json());
    const result = action === 'stop' ? await stopRuns(auth, 'org') : await resumeRuns(auth);
    return NextResponse.json({ ...result, status: await runControlStatus(auth) });
  } catch (err) {
    return errorResponse(err, 'agent-runs:control');
  }
}
