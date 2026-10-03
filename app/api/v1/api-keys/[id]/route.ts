export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/require-auth';
import { revokePlatformApiKey } from '@/lib/auth/api-keys';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req, 'session');
    if (auth.role !== 'owner' && auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only tenant owners and admins can revoke API keys', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Missing API key id', code: 'INVALID_REQUEST' }, { status: 400 });
    }

    await revokePlatformApiKey(auth.tenantId, id);
    return NextResponse.json({ message: 'Platform API key successfully revoked' });
  } catch (err: any) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
