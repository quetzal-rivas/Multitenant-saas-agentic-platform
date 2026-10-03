export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { handlePlatformMCPRPC } from '@/lib/mcp/platform-mcp-server';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const body = await req.json();

    const { statusCode, body: responseBody } = await handlePlatformMCPRPC(authHeader, body);

    if (responseBody === null) {
      return new NextResponse(null, { status: statusCode });
    }
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
  const url = new URL(req.url);

  return NextResponse.json({
    status: 'online',
    transport: 'Streamable HTTP',
    protocolVersion: '2024-11-05',
    endpoint: `${url.origin}/api/mcp/platform`,
  });
}
