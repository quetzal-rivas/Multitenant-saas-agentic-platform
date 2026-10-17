export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { listActivity } from '@/lib/services/activity-log';

const query = z.object({
  kind: z.enum(['run', 'webhook', 'function']).optional(),
  status: z.enum(['ok', 'error', 'active', 'other']).optional(),
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** Logs & Tracing feed: agent runs, webhook deliveries and function calls, newest first. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const params = query.parse(Object.fromEntries(req.nextUrl.searchParams));
    return NextResponse.json(await listActivity(auth.tenantId, params));
  } catch (err) {
    return errorResponse(err, 'activity:list');
  }
}
