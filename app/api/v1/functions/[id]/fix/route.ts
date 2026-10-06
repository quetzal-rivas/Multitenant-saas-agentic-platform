export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { fixFunction } from '@/lib/functions/ai-assist';

/** Ask the org's LLM for a fix to a failing function. Returns a proposal; nothing is saved. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json(await fixFunction(auth, (await params).id, await req.json()));
  } catch (err) {
    return errorResponse(err, 'functions:fix');
  }
}
