export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { handlePlatformMCPRPC, SUPPORTED_PROTOCOL_VERSIONS } from '@/lib/mcp/platform-mcp-server';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null },
      { status: 400 }
    );
  }

  try {
    const authHeader = req.headers.get('authorization') || '';
    const { statusCode, body: responseBody } = await handlePlatformMCPRPC(authHeader, body);

    if (responseBody === null) {
      return new NextResponse(null, { status: statusCode });
    }
    const headers: Record<string, string> = {};
    if (statusCode === 401) {
      headers['WWW-Authenticate'] = 'Bearer realm="context-control", error="invalid_token"';
    }
    return NextResponse.json(responseBody, { status: statusCode, headers });
  } catch (err: any) {
    console.error('[api/mcp/platform] unhandled error', err);
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  // This server is stateless and does not push server-initiated messages, so it
  // does not offer the optional SSE stream (Streamable HTTP spec: respond 405).
  if ((req.headers.get('accept') || '').includes('text/event-stream')) {
    return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });
  }

  const url = new URL(req.url);
  return NextResponse.json({
    status: 'online',
    transport: 'Streamable HTTP',
    protocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
    endpoint: `${url.origin}/api/mcp/platform`,
    auth: 'Authorization: Bearer ctx_live_...',
  });
}
