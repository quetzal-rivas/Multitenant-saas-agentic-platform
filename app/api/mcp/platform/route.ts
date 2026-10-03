export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { handlePlatformMCPRPC, generateClientConfigSnippets } from '@/lib/mcp/platform-mcp-server';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const body = await req.json();

    const { statusCode, body: responseBody } = await handlePlatformMCPRPC(authHeader, body);

    return NextResponse.json(responseBody, { status: statusCode });
  } catch (err: any) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: { code: -32603, message: err?.message || 'Internal server error' },
        id: null,
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const url = new URL(req.url);
  const rawKey = authHeader.replace(/^Bearer\s+/i, '').trim() || url.searchParams.get('key') || 'sk_live_demo_key';

  const snippets = generateClientConfigSnippets(rawKey, url.origin);

  return NextResponse.json({
    status: 'online',
    transport: 'Streamable HTTP',
    snippets,
  });
}
