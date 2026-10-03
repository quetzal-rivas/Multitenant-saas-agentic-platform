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
    const ttlSeconds = body.ttlSeconds || 3600;

    const minted = mintClientToken({
      tenantId,
      userId,
      profileSlug,
      ttlSeconds,
      toolsWhitelist: body.allowedTools || ['crm.search_contact', 'gmail.send_draft'],
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

