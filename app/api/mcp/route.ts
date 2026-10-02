export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { ProprietaryMcpServer } from '@/Backend/legacy_ts_mocks/mcp-server';
import { createClient } from '@/utils/supabase/server';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req?.url || 'http://localhost');
    const authHeader = req.headers.get('authorization') || '';
    const apiKey = authHeader.replace(/^Bearer\s+/i, '').trim() || undefined;

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing Authorization header with MCP API Key' }, { status: 401 });
    }

    const supabase = await createClient();
    
    // Hash the incoming full key
    const keyHashHex = crypto.createHash('sha256').update(apiKey).digest('hex');
    // PostgREST expects bytea as a hex string
    
    const { data: resolved, error } = await supabase.rpc('resolve_mcp_key', {
      p_hash: keyHashHex
    });

    if (error || !resolved || resolved.length === 0) {
      return NextResponse.json({ error: 'Invalid or expired MCP API Key' }, { status: 401 });
    }

    const activeProfile = resolved[0];
    const body = await req.json();

    // Eventually we will rewrite ProprietaryMcpServer to take activeProfile completely,
    // but for now we pass the slug so it can function, while enforcing the DB validation.
    const response = await ProprietaryMcpServer.handleRequest(body, {
      profileSlug: activeProfile.settings?.slug,
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
  
  return NextResponse.json({
    status: 'online',
    protocol: 'model-context-protocol',
    version: '2024-11-05',
    server: 'context-control-mcp-server',
    capabilities: ['tools/list', 'tools/call', 'prompts/list', 'prompts/get', 'resources/list', 'resources/read'],
    endpoint: `${url.origin}/api/mcp`,
    auth_required: true
  });
}
