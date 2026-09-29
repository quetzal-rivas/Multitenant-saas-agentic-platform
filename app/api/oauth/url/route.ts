export const dynamic = 'force-static';
import { NextRequest, NextResponse } from 'next/server';
import { OAuthManager } from '@/Backend/legacy_ts_mocks/oauth-manager';
import { OAuthProvider } from '@/Backend/legacy_ts_mocks/types';

export async function GET(req: NextRequest) {
  let provider: OAuthProvider = 'google';
  let origin = process.env.APP_URL || 'https://main.d1ct23sivfa3uv.amplifyapp.com';
  try {
    if (req && req.url) {
      const url = new URL(req.url);
      provider = (url.searchParams.get('provider') || 'google') as OAuthProvider;
      origin = process.env.APP_URL || url.origin;
    }
  } catch (e) {
    // Ignore static prerender evaluation error
  }
  const redirectUri = `${origin.replace(/\/$/, '')}/auth/callback`;

  const authData = OAuthManager.getAuthorizationUrl(provider, redirectUri);

  return NextResponse.json({
    provider,
    url: authData.url,
    redirectUri,
    mode: authData.mode,
  });
}
