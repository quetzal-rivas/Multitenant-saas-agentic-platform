export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { draftFunction } from '@/lib/functions/ai-assist';

/** Draft a function from a plain-language description. Returns a proposal; nothing is saved. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json(await draftFunction(auth, await req.json()));
  } catch (err) {
    return errorResponse(err, 'functions:draft');
  }
}
