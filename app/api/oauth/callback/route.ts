export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { processOAuthCallback } from '@/lib/auth/oauth-pkce';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    return new NextResponse(
      `<html><body><h3>OAuth Authorization Cancelled</h3><p>${errorParam}</p><script>setTimeout(() => window.close(), 3000);</script></body></html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 400 }
    );
  }

  if (!code || !state) {
    return new NextResponse(
      `<html><body><h3>OAuth Callback Error</h3><p>Missing code or state parameters.</p><script>setTimeout(() => window.close(), 3000);</script></body></html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 400 }
    );
  }

  try {
    const { provider } = await processOAuthCallback(code, state);

    const html = `<!DOCTYPE html>
<html>
  <head>
    <title>OAuth Success</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #09090b; color: #f4f4f5; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
      .card { background: #18181b; border: 1px solid #27272a; padding: 24px; border-radius: 12px; text-align: center; max-width: 400px; }
      h2 { color: #10b981; margin-top: 0; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>OAuth Account Connected!</h2>
      <p>Successfully linked your ${provider} account to Context Control.</p>
      <p style="font-size: 12px; color: #a1a1aa;">This window will close automatically.</p>
    </div>
    <script>
      try {
        if (window.opener) {
          window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: '${provider}' }, '*');
        }
      } catch (e) {}
      setTimeout(() => {
        try { window.close(); } catch (e) {}
      }, 1500);
    </script>
  </body>
</html>`;

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html' }, status: 200 });
  } catch (err: any) {
    const errorHtml = `<!DOCTYPE html>
<html>
  <head>
    <title>OAuth Error</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #09090b; color: #f4f4f5; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
      .card { background: #18181b; border: 1px solid #ef4444; padding: 24px; border-radius: 12px; text-align: center; max-width: 400px; }
      h2 { color: #ef4444; margin-top: 0; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>OAuth Connection Failed</h2>
      <p>${err?.message || 'An unexpected error occurred during token exchange.'}</p>
      <button onclick="window.close()" style="background: #27272a; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Close Window</button>
    </div>
  </body>
</html>`;

    return new NextResponse(errorHtml, { headers: { 'Content-Type': 'text/html' }, status: 400 });
  }
}
