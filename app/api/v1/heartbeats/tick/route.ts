export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/http/route-errors';
import { processDueHeartbeats, verifyHeartbeatSecret } from '@/lib/services/heartbeats';
import { recoverStaleRuns } from '@/lib/services/agent-runs';
import { processDueTasks } from '@/lib/services/scheduled-tasks';
import { sweepInbound } from '@/lib/services/inbound';

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
    // Scheduled tasks that are due start as team runs on the worker.
    const tasks = await processDueTasks().catch((err) => {
      console.error('[heartbeats:tick] scheduled tasks failed', err);
      return null;
    });
    // Restart agent runs whose worker stopped, and stop runs that took too long.
    const runs = await recoverStaleRuns().catch((err) => {
      console.error('[heartbeats:tick] run recovery failed', err);
      return null;
    });
    // Webhook events the worker never picked up, queued messages, and old event cleanup.
    const inbound = await sweepInbound().catch((err) => {
      console.error('[heartbeats:tick] inbound sweep failed', err);
      return null;
    });
    return NextResponse.json({ processed: outcomes.length, outcomes, tasks, runs, inbound });
  } catch (err) {
    return errorResponse(err, 'heartbeats:tick');
  }
}
