export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { revokePlatformApiKey, updatePlatformApiKey } from '@/lib/auth/api-keys';
import { updateApiKeyBody } from '@/lib/services/api-key-input';
import { errorResponse } from '@/lib/http/route-errors';
import { ServiceError } from '@/lib/services/errors';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const { id } = await params;

    const body = updateApiKeyBody.parse(await req.json());
    const apiKey = await updatePlatformApiKey(auth.tenantId, id, body);
    if (!apiKey) throw new ServiceError('API key not found in this organization.', 'NOT_FOUND');
    return NextResponse.json({ apiKey });
  } catch (err) {
    return errorResponse(err, 'api-keys:update');
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const { id } = await params;

    const revoked = await revokePlatformApiKey(auth.tenantId, id);
    if (!revoked) throw new ServiceError('API key not found in this organization.', 'NOT_FOUND');
    return NextResponse.json({ message: 'Platform API key successfully revoked' });
  } catch (err) {
    return errorResponse(err, 'api-keys:revoke');
  }
}
