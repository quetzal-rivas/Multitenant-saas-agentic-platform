export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { createFunction, listFunctions } from '@/lib/services/functions';

/** AI Function Studio functions of the signed-in user's organization. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json(await listFunctions(auth, { deployedOnly: req.nextUrl.searchParams.get('deployed') === 'true' }));
  } catch (err) {
    return errorResponse(err, 'functions:list');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json(await createFunction(auth, await req.json()), { status: 201 });
  } catch (err) {
    return errorResponse(err, 'functions:create');
  }
}
