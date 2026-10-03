import { NextRequest, NextResponse } from 'next/server';
import { ProprietaryMcpServer } from '@/lib/demo/legacy_mocks/mcp-server';
import { PLATFORM_MCP_TOOLS_CATALOG } from '@/lib/demo/legacy_mocks/team-blueprint-manager';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const profileSlug = url.searchParams.get('profile') || undefined;

    const jsonRpcRequest = {
      jsonrpc: '2.0' as const,
      id: `list_${Date.now()}`,
      method: 'tools/list',
      params: {},
    };

    const response = await ProprietaryMcpServer.handleRequest(jsonRpcRequest, {
      profileSlug,
    });

    if (response.result && (response.result as any).tools) {
      return NextResponse.json({
        success: true,
        tools: (response.result as any).tools,
      });
    }

    return NextResponse.json({
      success: true,
      tools: PLATFORM_MCP_TOOLS_CATALOG,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        tools: PLATFORM_MCP_TOOLS_CATALOG,
        error: error?.message,
      },
      { status: 200 }
    );
  }
}
