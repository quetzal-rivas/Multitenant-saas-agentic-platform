export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { dryRun } from '@/lib/services/inbound';
import { ServiceError } from '@/lib/services/errors';

type Params = { params: Promise<{ id: string }> };

/** Dry run: how would this sample payload be routed? (No signature check, nothing stored, no agent run.) */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    const raw = await req.text();
    if (raw.length > 200_000) throw new ServiceError('The sample is too large (200 KB maximum).', 'INVALID');
    return NextResponse.json(await dryRun(auth, (await params).id, raw));
  } catch (err) {
    return errorResponse(err, 'inbound:test');
  }
}
