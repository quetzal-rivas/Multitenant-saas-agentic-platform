import { NextRequest } from 'next/server';
import { OAuthManager } from '@/Backend/oauth-manager';
import { OAuthProvider } from '@/Backend/types';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const provider = (url.searchParams.get('provider') || 'google') as OAuthProvider;
  const code = url.searchParams.get('code') || undefined;

  // Process the OAuth callback in the OAuth Manager
  const connection = OAuthManager.handleCallback(provider, code);

  // Return HTML snippet for popup postMessage communication
  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>OAuth Connected - Context Control MCP</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #0c0e12;
            color: #f1f5f9;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 24px;
            box-sizing: border-box;
            text-align: center;
          }
          .card {
            background: #151921;
            border: 1px solid #272f3d;
            border-radius: 12px;
            padding: 32px 24px;
            max-width: 400px;
            width: 100%;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
          }
          .icon {
            width: 48px;
            height: 48px;
            background: #064e3b;
            color: #34d399;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            margin-bottom: 16px;
          }
          h2 { margin: 0 0 8px 0; font-size: 18px; color: #fff; }
          p { margin: 0 0 20px 0; font-size: 13px; color: #94a3b8; line-height: 1.5; }
          .badge {
            background: #1e293b;
            border: 1px solid #334155;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-family: monospace;
            color: #38bdf8;
            display: inline-block;
            margin-bottom: 20px;
          }
          .btn {
            background: #059669;
            color: #fff;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
          }
          .btn:hover { background: #10b981; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✓</div>
          <h2>Connected to ${provider.toUpperCase()}</h2>
          <p>Authentication token verified. Account <strong>${connection.accountName || connection.accountEmail}</strong> is now linked to your MCP Server.</p>
          <div class="badge">Scopes: ${connection.scopes.slice(0, 2).join(', ')}...</div>
          <div>
            <button class="btn" onclick="closeWindow()">Close & Return</button>
          </div>
        </div>

        <script>
          function closeWindow() {
            if (window.opener) {
              window.opener.postMessage({
                type: 'OAUTH_AUTH_SUCCESS',
                provider: '${provider}',
                accountName: '${connection.accountName}',
                accountEmail: '${connection.accountEmail}'
              }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          }

          // Auto notify and close after short delay
          try {
            if (window.opener) {
              window.opener.postMessage({
                type: 'OAUTH_AUTH_SUCCESS',
                provider: '${provider}',
                accountName: '${connection.accountName}',
                accountEmail: '${connection.accountEmail}'
              }, '*');
              setTimeout(() => {
                window.close();
              }, 1200);
            }
          } catch(e) {
            console.error('postMessage error:', e);
          }
        </script>
      </body>
    </html>
  `;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
