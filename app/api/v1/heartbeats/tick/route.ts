export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/http/route-errors';
import { processDueHeartbeats, verifyHeartbeatSecret } from '@/lib/services/heartbeats';
import { recoverStaleRuns } from '@/lib/services/agent-runs';

/**
 * Called every minute by Supabase pg_cron (public.trigger_heartbeat_tick) with the
 * x-heartbeat-secret header from Supabase Vault. Runs teams whose heartbeat is due.
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await verifyHeartbeatSecret(req.headers.get('x-heartbeat-secret')))) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const outcomes = await processDueHeartbeats();
    // Restart agent runs whose worker stopped, and stop runs that took too long.
    const runs = await recoverStaleRuns().catch((err) => {
      console.error('[heartbeats:tick] run recovery failed', err);
      return null;
    });
    return NextResponse.json({ processed: outcomes.length, outcomes, runs });
  } catch (err) {
    return errorResponse(err, 'heartbeats:tick');
  }
}
