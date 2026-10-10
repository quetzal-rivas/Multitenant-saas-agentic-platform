export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { configureNumber } from '@/lib/services/telephony';

type Params = { params: Promise<{ id: string }> };
const body = z
  .object({ voice_agent_id: z.string().uuid().nullable(), sms_to_webhooks: z.boolean().optional(), sms_team_id: z.string().uuid().nullable().optional() })
  .strict();

/** Assign duties (voice agent answering calls, SMS into Webhooks) and point the number at us. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json({ number: await configureNumber(auth, (await params).id, body.parse(await req.json())) });
  } catch (err) {
    return errorResponse(err, 'telephony:configure');
  }
}
