import { hashApiKey } from '@/lib/auth/require-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { executeMCPToolCall } from './mcp-gateway';

export interface ClientConfigSnippets {
  claudeDesktop: Record<string, any>;
  cursor: Record<string, any>;
}

/**
 * Handle incoming Streamable HTTP MCP JSON-RPC requests for Claude Desktop / Cursor administration.
 */
export async function handlePlatformMCPRPC(
  rawApiKey: string,
  rpcBody: any
): Promise<{ statusCode: number; body: any }> {
  if (!rawApiKey) {
    return {
      statusCode: 401,
      body: { jsonrpc: '2.0', error: { code: -32001, message: 'Missing Authorization header with Platform API Key' }, id: rpcBody?.id || null },
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
      body: { jsonrpc: '2.0', error: { code: -32001, message: 'Invalid or revoked Platform API Key' }, id: rpcBody?.id || null },
    };
  }

  if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
    return {
      statusCode: 401,
      body: { jsonrpc: '2.0', error: { code: -32001, message: 'Platform API Key has expired' }, id: rpcBody?.id || null },
    };
  }

  const { method, params, id } = rpcBody || {};

  switch (method) {
    case 'tools/list': {
      const whitelist = keyRecord.tools_whitelist || [];
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
            properties: {
              query: { type: 'string', description: 'SQL SELECT query string' },
            },
            required: ['query'],
          },
        },
      ].filter((t) => whitelist.length === 0 || whitelist.includes(t.name) || whitelist.includes('*'));

      return {
        statusCode: 200,
        body: { jsonrpc: '2.0', result: { tools }, id },
      };
    }

    case 'tools/call': {
      const { name, arguments: toolArgs } = params || {};
      const res = await executeMCPToolCall({
        tenantId: keyRecord.tenant_id,
        toolName: name,
        arguments: toolArgs || {},
        whitelist: keyRecord.tools_whitelist,
      });

      if (!res.success) {
        return {
          statusCode: 400,
          body: { jsonrpc: '2.0', error: { code: -32603, message: res.error }, id },
        };
      }

      return {
        statusCode: 200,
        body: { jsonrpc: '2.0', result: res.result, id },
      };
    }

    default:
      return {
        statusCode: 400,
        body: { jsonrpc: '2.0', error: { code: -32601, message: `Method '${method}' not found` }, id },
      };
  }
}

/**
 * Generate Claude Desktop & Cursor configuration JSON snippets for an API Key / Profile.
 */
export function generateClientConfigSnippets(rawApiKey: string, origin: string): ClientConfigSnippets {
  const mcpEndpointUrl = `${origin.replace(/\/$/, '')}/api/mcp/platform`;

  const claudeDesktop = {
    mcpServers: {
      "context-control": {
        url: mcpEndpointUrl,
        headers: {
          Authorization: `Bearer ${rawApiKey}`,
        },
      },
    },
  };

  const cursor = {
    mcpServers: {
      "context-control": {
        url: mcpEndpointUrl,
        headers: {
          Authorization: `Bearer ${rawApiKey}`,
        },
      },
    },
  };

  return { claudeDesktop, cursor };
}
