export const dynamic = 'force-static';
import { NextRequest, NextResponse } from 'next/server';

export interface TokenMintPayload {
  tenant: string;
  user: string;
  profile: string;
  ttlSeconds: number;
  ttlString: string;
  allowedTools?: string[];
}

export async function POST(req: NextRequest) {
  try {
    const body: TokenMintPayload = await req.json();
    const { tenant, user, profile, ttlSeconds, ttlString, allowedTools } = body;

    if (!tenant || !user || !profile) {
      return NextResponse.json(
        { error: 'MissingRequiredFields', message: 'tenant, user, and profile are required.' },
        { status: 400 }
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + (ttlSeconds || 3600);

    const header = {
      alg: 'RS256',
      typ: 'JWT',
      kid: 'ctx_auth_key_2026_09',
    };

    const claims = {
      iss: 'https://api.contextcontrol.dev',
      sub: user,
      aud: 'context-control-client',
      tenant_id: tenant,
      profile_slug: profile,
      iat: now,
      nbf: now,
      exp: exp,
      ttl: ttlString || '1h',
      jti: `tok_${Math.random().toString(36).substring(2, 15)}_${Date.now().toString(36)}`,
      tools_whitelist: allowedTools || ['crm.search_contact', 'gmail.send_draft'],
      rate_limit: {
        rpm: 60,
        burst: 10,
      },
    };

    // Base64url encoding helper
    const b64Url = (obj: any) =>
      Buffer.from(JSON.stringify(obj))
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    const signatureMock = Buffer.from(
      `sig_${Math.random().toString(36).substring(2, 18)}_${Date.now().toString(36)}`
    )
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const token = `${b64Url(header)}.${b64Url(claims)}.${signatureMock}`;

    return NextResponse.json({
      success: true,
      token,
      claims,
      expiresAt: new Date(exp * 1000).toISOString(),
      ttlFormatted: ttlString,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'TokenMintError', message: err.message || 'Internal token minter error' },
      { status: 500 }
    );
  }
}
