export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/require-auth';
import { createPlatformApiKey, listPlatformApiKeys } from '@/lib/auth/api-keys';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const keys = await listPlatformApiKeys(auth.tenantId);
    return NextResponse.json({ keys });
  } catch (err: any) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    if (auth.role !== 'owner' && auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only tenant owners and admins can generate API keys', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, environment = 'live', scopes = ['*'], toolsWhitelist = [] } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    const apiKey = await createPlatformApiKey(
      auth.tenantId,
      name,
      environment,
      scopes,
      toolsWhitelist
    );

    return NextResponse.json({ apiKey });
  } catch (err: any) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
