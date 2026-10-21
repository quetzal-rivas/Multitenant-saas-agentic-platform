export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { testStoredProvider } from '@/lib/services/llm-providers';

/** Check a stored provider: it answers, and whether it uses tools. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, 'session');
    return NextResponse.json(await testStoredProvider(auth, (await params).id));
  } catch (err) {
    return errorResponse(err, 'llm-providers:test');
  }
}
