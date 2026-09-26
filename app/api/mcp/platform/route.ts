import { NextRequest, NextResponse } from 'next/server';
import { PlatformControlMcpServer } from '@/Backend/platform-mcp-server';

/**
 * Platform Control MCP Server Endpoint
 * 
 * Implements Model Context Protocol (MCP 2024-11-05 JSON-RPC 2.0).
 * Connects localized LLMs (Claude Desktop, Cursor, IDE agents, admin bots)
 * directly to the platform's controllers:
 * - Agent Team Profile Blueprint engineering
 * - BullMQ Durable Task lifecycle
 * - PostgreSQL Schema & Tables inspection
 * - Tenant Vault & RLS isolation governance
 */

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const tenantId =
      url.searchParams.get('tenant_id') ||
      req.headers.get('x-tenant-id') ||
      'tenant_enterprise_corp';

    const caller =
      req.headers.get('x-caller-agent') ||
      req.headers.get('user-agent') ||
      'localized-llm';

    const body = await req.json();

    const response = await PlatformControlMcpServer.handleRequest(body, {
      tenantId,
      caller,
    });

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: error?.message || 'Internal Platform Control MCP Server error',
        },
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tenantId =
    url.searchParams.get('tenant_id') ||
    req.headers.get('x-tenant-id') ||
    'tenant_enterprise_corp';

  return NextResponse.json({
    status: 'online',
    protocol: 'model-context-protocol',
    version: '2024-11-05',
    server: 'platform-control-mcp-server',
    title: 'Platform Control MCP Server (Direct In-Memory Controllers)',
    tenant_id: tenantId,
    transport: 'JSON-RPC 2.0 via HTTP POST & stdio stream adapter',
    tool_categories: [
      {
        category: 'A: Agent Team Blueprint Engineering',
        tools: ['create_agent_profile', 'attach_worker_to_profile', 'list_team_blueprints'],
      },
      {
        category: 'B: Durable Task Control (BullMQ Lifecycle)',
        tools: ['schedule_deferred_task', 'cancel_deferred_task', 'list_scheduled_tasks', 'trigger_task_now'],
      },
      {
        category: 'C: Database & State Store Governance',
        tools: ['inspect_database_schema', 'query_database_table'],
      },
      {
        category: 'D: Auth Vault & Security Enforcement',
        tools: ['view_tenant_vault_status', 'update_tenant_spoke_auth'],
      },
    ],
    endpoint: `${url.origin}/api/mcp/platform`,
  });
}
