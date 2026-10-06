export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { deleteFunctionSecret, setFunctionSecret } from '@/lib/services/functions';

type Params = { params: Promise<{ id: string }> };
const setBody = z.object({ name: z.string(), value: z.string() }).strict();

/** Set or replace an environment secret. Values are write-only. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const { name, value } = setBody.parse(await req.json());
    return NextResponse.json(await setFunctionSecret(auth, (await params).id, name, value));
  } catch (err) {
    return errorResponse(err, 'functions:secret:set');
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const name = req.nextUrl.searchParams.get('name') || '';
    return NextResponse.json(await deleteFunctionSecret(auth, (await params).id, name));
  } catch (err) {
    return errorResponse(err, 'functions:secret:delete');
  }
}
