export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { handlePlatformMcpRequest } from '@/lib/mcp/platform-mcp-server';

/** Streamable HTTP MCP endpoint (stateless, JSON responses). Auth: Bearer workspace API key. */
export async function POST(req: NextRequest) {
  try {
    return await handlePlatformMcpRequest(req);
  } catch (err) {
    console.error('[api/mcp/platform] unhandled error', err);
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null },
      { status: 500 }
    );
  }
}

// Stateless server: no server-initiated SSE stream and no sessions to delete.
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });
}
