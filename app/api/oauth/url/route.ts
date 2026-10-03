export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/require-auth';
import { generateOAuthAuthorizationUrl, OAuthProviderType } from '@/lib/auth/oauth-pkce';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');

    const url = new URL(req.url);
    const provider = (url.searchParams.get('provider') || 'google') as OAuthProviderType;
    const origin = process.env.APP_URL || url.origin;

    const { url: authUrl, state } = await generateOAuthAuthorizationUrl(
      auth.tenantId,
      auth.userId,
      provider,
      origin
    );

    return NextResponse.json({
      provider,
      url: authUrl,
      state,
    });
  } catch (err: any) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
