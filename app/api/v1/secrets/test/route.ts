export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/require-auth';
import { BYOKProvider, testProviderConnection } from '@/lib/secrets/secrets-service';

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req, 'session');

    const body = await req.json();
    const { provider, secretValue } = body;

    if (!provider || !secretValue) {
      return NextResponse.json(
        { error: 'Missing required fields: provider and secretValue', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    const result = await testProviderConnection(provider as BYOKProvider, secretValue);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: result.message });
  } catch (err: any) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
