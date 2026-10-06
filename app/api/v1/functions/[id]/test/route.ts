export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { testFunction } from '@/lib/services/functions';

const body = z.object({ input: z.unknown().optional() }).strict();

/** Run the function in its Lambda (redeploying first if the draft changed). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const { input } = body.parse(await req.json());
    return NextResponse.json(await testFunction(auth, (await params).id, input ?? {}));
  } catch (err) {
    return errorResponse(err, 'functions:test');
  }
}
