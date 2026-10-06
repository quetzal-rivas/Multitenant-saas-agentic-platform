export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { listInvocations } from '@/lib/services/functions';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, 'session');
    const limit = Number(req.nextUrl.searchParams.get('limit') || 20);
    return NextResponse.json(await listInvocations(auth, (await params).id, limit));
  } catch (err) {
    return errorResponse(err, 'functions:invocations');
  }
}
