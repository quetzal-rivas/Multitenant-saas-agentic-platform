export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { archiveFunction, getFunction, updateFunction } from '@/lib/services/functions';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json(await getFunction(auth, (await params).id));
  } catch (err) {
    return errorResponse(err, 'functions:get');
  }
}

/** Save the draft (code, schema, settings). Deploy separately. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json(await updateFunction(auth, (await params).id, await req.json()));
  } catch (err) {
    return errorResponse(err, 'functions:update');
  }
}

/** Archive the function and delete its Lambda. */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json(await archiveFunction(auth, (await params).id));
  } catch (err) {
    return errorResponse(err, 'functions:archive');
  }
}
