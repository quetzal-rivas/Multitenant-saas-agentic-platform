export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/http/route-errors';
import { processDueHeartbeats, verifyHeartbeatSecret } from '@/lib/services/heartbeats';

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
    return NextResponse.json({ processed: outcomes.length, outcomes });
  } catch (err) {
    return errorResponse(err, 'heartbeats:tick');
  }
}
