export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { listConversations } from '@/lib/services/conversations';

const query = z.object({
  kind: z.enum(['agent', 'team', 'heartbeat', 'task', 'inbound', 'call']).optional(),
  voice: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  status: z.enum(['running', 'failed']).optional(),
  team_id: z.string().uuid().optional(),
  q: z.string().max(200).optional(),
});

/** Every agent instance in the organization, newest activity first. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const filters = query.parse(Object.fromEntries(req.nextUrl.searchParams));
    return NextResponse.json(await listConversations(auth, filters));
  } catch (err) {
    return errorResponse(err, 'conversations:list');
  }
}
