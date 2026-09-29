export const dynamic = 'force-static';
import { NextRequest, NextResponse } from 'next/server';
import { ProprietaryMcpServer } from '@/Backend/legacy_ts_mocks/mcp-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { toolName, toolArgs, profileSlug } = body;

    const jsonRpcRequest = {
      jsonrpc: '2.0' as const,
      id: `call_${Date.now()}`,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: toolArgs || {},
      },
    };

    const response = await ProprietaryMcpServer.handleRequest(jsonRpcRequest, {
      profileSlug,
    });

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Execution error' }, { status: 500 });
  }
}
