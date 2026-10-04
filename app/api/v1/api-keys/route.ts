export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { createPlatformApiKey, listPlatformApiKeys } from '@/lib/auth/api-keys';
import { createApiKeyBody } from '@/lib/services/api-key-input';
import { errorResponse } from '@/lib/http/route-errors';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const keys = await listPlatformApiKeys(auth.tenantId);
    return NextResponse.json({ keys });
  } catch (err) {
    return errorResponse(err, 'api-keys:list');
  }
}

export async function POST(req: NextRequest) {
  try {
    // Keys are only minted from a signed-in owner/admin session, never by another key.
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);

    const body = createApiKeyBody.parse(await req.json());
    const apiKey = await createPlatformApiKey(auth.tenantId, {
      name: body.name,
      environment: body.environment,
      scopes: body.scopes,
      toolsWhitelist: body.toolsWhitelist,
      expiresAt: body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString() : null,
      createdBy: auth.userId,
    });

    return NextResponse.json({ apiKey }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'api-keys:create');
  }
}
