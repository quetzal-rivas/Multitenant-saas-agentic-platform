export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { publicOrigin } from '@/lib/http/public-origin';
import { completeGoogleConnect } from '@/lib/services/connections';
import { isServiceError } from '@/lib/services/errors';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function page(origin: string, ok: boolean, title: string, message: string) {
  // Only our own origin may receive the result; the opener is the MCP Hub page.
  const payload = JSON.stringify({ type: ok ? 'CONNECTION_SUCCESS' : 'CONNECTION_ERROR', provider: 'google', message });
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#09090b;color:#f4f4f5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.card{background:#18181b;border:1px solid ${ok ? '#27272a' : '#ef4444'};padding:24px;border-radius:12px;text-align:center;max-width:420px}
h2{color:${ok ? '#10b981' : '#ef4444'};margin-top:0}</style></head>
<body><div class="card"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p><p style="font-size:12px;color:#a1a1aa">You can close this window.</p></div>
<script>try{if(window.opener){window.opener.postMessage(${payload.replace(/</g, '\\u003c')}, ${JSON.stringify(origin)});}}catch(e){}${ok ? 'setTimeout(function(){window.close()},1500);' : ''}</script></body></html>`;
  return new NextResponse(html, { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/** Google redirects here after consent. */
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  const q = req.nextUrl.searchParams;
  const error = q.get('error');
  if (error) return page(origin, false, 'Connection cancelled', error === 'access_denied' ? 'You did not grant access.' : error);
  const code = q.get('code');
  const state = q.get('state');
  if (!code || !state) return page(origin, false, 'Connection failed', 'Missing code or state.');
  try {
    const { email } = await completeGoogleConnect(code, state);
    return page(origin, true, 'Google connected', `Connected ${email ?? 'your Google account'} to Context Control.`);
  } catch (err) {
    if (!isServiceError(err)) console.error('[oauth/callback] failed', err);
    return page(origin, false, 'Connection failed', isServiceError(err) ? err.message : 'Something went wrong. Try again from MCP Hub.');
  }
}
