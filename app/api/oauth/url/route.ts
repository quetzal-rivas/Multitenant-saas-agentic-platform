import { NextRequest, NextResponse } from 'next/server';
import { OAuthManager } from '@/Backend/oauth-manager';
import { OAuthProvider } from '@/Backend/types';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const provider = (url.searchParams.get('provider') || 'google') as OAuthProvider;

  // Use the origin or APP_URL from runtime environment
  const origin = process.env.APP_URL || url.origin;
  const redirectUri = `${origin.replace(/\/$/, '')}/auth/callback`;

  const authData = OAuthManager.getAuthorizationUrl(provider, redirectUri);

  return NextResponse.json({
    provider,
    url: authData.url,
    redirectUri,
    mode: authData.mode,
  });
}
