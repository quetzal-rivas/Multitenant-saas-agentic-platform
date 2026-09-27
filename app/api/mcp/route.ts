export const dynamic = 'force-static';
import { NextRequest, NextResponse } from 'next/server';
import { ProprietaryMcpServer } from '@/Backend/mcp-server';
import { McpProfileManager } from '@/Backend/profile-manager';

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req?.url || 'http://localhost');
    const profileSlug = url.searchParams.get('profile') || req.headers.get('x-mcp-profile') || undefined;
    const authHeader = req.headers.get('authorization') || '';
    const apiKey = authHeader.replace(/^Bearer\s+/i, '').trim() || undefined;

    const body = await req.json();

    const response = await ProprietaryMcpServer.handleRequest(body, {
      profileSlug,
      apiKey,
      baseUrl: url.origin,
    });

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: error?.message || 'Internal MCP Server error',
        },
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req?.url || 'http://localhost');
  const profileSlug = url.searchParams.get('profile') || undefined;
  const profile = profileSlug ? McpProfileManager.getProfileBySlug(profileSlug) : McpProfileManager.listProfiles()[0];

  return NextResponse.json({
    status: 'online',
    protocol: 'model-context-protocol',
    version: '2024-11-05',
    server: 'context-control-mcp-server',
    activeProfile: profile
      ? {
          name: profile.name,
          slug: profile.slug,
          tokenBudget: profile.tokenBudget,
          toolsCount: profile.selectedToolNames.length,
          boundContextProfiles: profile.boundContextProfileSlugs,
        }
      : null,
    capabilities: ['tools/list', 'tools/call', 'prompts/list', 'prompts/get', 'resources/list', 'resources/read'],
    endpoint: `${url.origin}/api/mcp`,
  });
}
