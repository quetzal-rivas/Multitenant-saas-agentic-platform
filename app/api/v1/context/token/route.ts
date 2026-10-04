export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/require-auth';
import { mintClientToken } from '@/lib/auth/jwks';

export interface TokenMintPayload {
  tenant?: string;
  user?: string;
  profile?: string;
  ttlSeconds?: number;
  ttlString?: string;
  allowedTools?: string[];
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['session', 'api_key']);
    const body: TokenMintPayload = await req.json();

    const tenantId = auth.tenantId;
    const userId = body.user || auth.userId;
    const profileSlug = body.profile || 'sales-agent';
    const ttlSeconds = Math.min(Math.max(Math.floor(Number(body.ttlSeconds) || 3600), 60), 86_400);
    const requestedTools = Array.isArray(body.allowedTools) ? body.allowedTools.filter((t) => typeof t === 'string') : [];
    // A key may only delegate tools it holds itself; an empty key whitelist means no extra restriction.
    const keyWhitelist = auth.toolsWhitelist || [];
    const allowedTools =
      auth.authMode === 'api_key' && keyWhitelist.length > 0 && !keyWhitelist.includes('*')
        ? requestedTools.filter((t) => keyWhitelist.includes(t))
        : requestedTools;

    const minted = mintClientToken({
      tenantId,
      userId,
      profileSlug,
      ttlSeconds,
      toolsWhitelist: allowedTools,
    });

    return NextResponse.json({
      success: true,
      token: minted.token,
      claims: minted.claims,
      expiresAt: minted.expiresAt,
      ttlFormatted: body.ttlString || '1h',
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: 'TokenMintError', message: err.message || 'Internal token minter error' },
      { status: 500 }
    );
  }
}

