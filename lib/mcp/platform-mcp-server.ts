import { hashApiKey } from '@/lib/auth/require-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { executeMCPToolCall } from './mcp-gateway';

export interface ClientConfigSnippets {
  claudeDesktop: Record<string, any>;
  cursor: Record<string, any>;
}

const SUPPORTED_PROTOCOL_VERSION = '2024-11-05';

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', error: { code, message }, id: id ?? null };
}

function toolError(id: unknown, message: string) {
  return {
    jsonrpc: '2.0',
    result: { content: [{ type: 'text', text: message }], isError: true },
    id,
  };
}

/** Handle authenticated MCP JSON-RPC requests for the platform endpoint. */
export async function handlePlatformMCPRPC(
  rawApiKey: string,
  rpcBody: any
): Promise<{ statusCode: number; body: any }> {
  const id = rpcBody?.id ?? null;
  if (!rpcBody || rpcBody.jsonrpc !== '2.0' || typeof rpcBody.method !== 'string') {
    return { statusCode: 200, body: rpcError(id, -32600, 'Invalid JSON-RPC request') };
  }

  if (!rawApiKey) {
    return {
      statusCode: 401,
      body: { jsonrpc: '2.0', error: { code: -32001, message: 'Missing Authorization header with Platform API Key' }, id },
    };
  }

  const keyHash = hashApiKey(rawApiKey.replace(/^Bearer\s+/i, '').trim());
  const supabase = getSupabaseAdminClient();
  const { data: keyRecord, error: keyErr } = await supabase
    .from('mcp_api_keys')
    .select('id, tenant_id, name, scopes, tools_whitelist, revoked_at, expires_at')
    .eq('key_hash', keyHash)
    .single();

  if (keyErr || !keyRecord || keyRecord.revoked_at) {
    return {
      statusCode: 401,
      body: { jsonrpc: '2.0', error: { code: -32001, message: 'Invalid or revoked Platform API Key' }, id },
    };
  }

  if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
    return {
      statusCode: 401,
      body: { jsonrpc: '2.0', error: { code: -32001, message: 'Platform API Key has expired' }, id },
    };
  }

  const { method, params } = rpcBody;
  switch (method) {
    case 'initialize':
      return {
        statusCode: 200,
        body: {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: SUPPORTED_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: 'context-control', version: '1.0.0' },
          },
        },
      };
    case 'notifications/initialized':
      return { statusCode: 202, body: null };
    case 'ping':
      return { statusCode: 200, body: { jsonrpc: '2.0', id, result: {} } };
    case 'tools/list': {
      const whitelist: string[] = keyRecord.tools_whitelist || [];
      const tools = [
        {
          name: 'gmail_send_message',
          description: 'Send an email via Google Workspace Gmail API',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string', description: 'Recipient email address' },
              subject: { type: 'string', description: 'Email subject' },
              body: { type: 'string', description: 'Email message body' },
            },
            required: ['to', 'subject', 'body'],
          },
        },
        {
          name: 'slack_post_message',
          description: 'Post a chat message to a Slack channel',
          inputSchema: {
            type: 'object',
            properties: {
              channel: { type: 'string', description: 'Slack channel ID or #name' },
              text: { type: 'string', description: 'Message content' },
            },
            required: ['channel', 'text'],
          },
        },
        {
          name: 'supabase_query',
          description: 'Execute a read-only SQL query against the tenant database',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string', description: 'SQL SELECT query string' } },
            required: ['query'],
          },
        },
      ].filter((tool) => whitelist.includes(tool.name) || whitelist.includes('*'));
      return { statusCode: 200, body: { jsonrpc: '2.0', result: { tools }, id } };
    }
    case 'tools/call': {
      const { name, arguments: toolArgs } = params || {};
      const response = await executeMCPToolCall({
        tenantId: keyRecord.tenant_id,
        toolName: name,
        arguments: toolArgs || {},
        whitelist: keyRecord.tools_whitelist,
      });
      return {
        statusCode: 200,
        body: response.success
          ? { jsonrpc: '2.0', result: response.result, id }
          : toolError(id, response.error || 'MCP tool execution failed'),
      };
    }
    default:
      return { statusCode: 200, body: rpcError(id, -32601, `Method '${method}' not found`) };
  }
}

/** Generate Claude Desktop & Cursor configuration JSON snippets for an API key. */
export function generateClientConfigSnippets(rawApiKey: string, origin: string): ClientConfigSnippets {
  const mcpEndpointUrl = `${origin.replace(/\/$/, '')}/api/mcp/platform`;
  const serverConfig = {
    url: mcpEndpointUrl,
    headers: { Authorization: `Bearer ${rawApiKey}` },
  };

  return {
    claudeDesktop: { mcpServers: { 'context-control': serverConfig } },
    cursor: { mcpServers: { 'context-control': serverConfig } },
  };
}
