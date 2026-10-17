export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { getRunTimeline } from '@/lib/services/activity-log';

/** One agent run with its step timeline (tool calls, workers, latency, errors). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json(await getRunTimeline(auth.tenantId, (await params).id));
  } catch (err) {
    return errorResponse(err, 'activity:run');
  }
}
