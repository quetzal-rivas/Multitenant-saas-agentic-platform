export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { deployFunction } from '@/lib/services/functions';

/** Package the saved code and create/update the function's Lambda. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json(await deployFunction(auth, (await params).id));
  } catch (err) {
    return errorResponse(err, 'functions:deploy');
  }
}
