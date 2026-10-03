import { z } from 'zod';
import { hashApiKey } from '@/lib/auth/require-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';

export interface ClientConfigSnippets {
  claudeDesktop: Record<string, any>;
  cursor: Record<string, any>;
}

interface PlatformTool {
  name: string;
  description: string;
  requiredScope: string;
  inputSchema: Record<string, unknown>;
}

interface ApiKeyContext {
  id: string;
  tenant_id: string;
  scopes: string[] | null;
  tools_whitelist: string[] | null;
  revoked_at: string | null;
  expires_at: string | null;
  last_used_at?: string | null;
}

const SUPPORTED_PROTOCOL_VERSION = '2024-11-05';

const listProfilesArgs = z.object({
  limit: z.number().int().min(1).max(100).optional(),
}).strict();

const listTasksArgs = z.object({
  status: z.enum(['scheduled', 'active', 'completed', 'escalated']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();

const scheduleTaskArgs = z.object({
  title: z.string().trim().min(1).max(255),
  instructions: z.string().trim().min(1).max(10000),
  target_time: z.string().datetime({ offset: true }),
  profile_id: z.string().uuid().optional(),
}).strict();

export const PLATFORM_MCP_TOOLS: PlatformTool[] = [
  {
    name: 'list_mcp_profiles',
    description: 'List active MCP profiles owned by the authenticated tenant.',
    requiredScope: 'mcp:profiles:read',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 100 } },
      additionalProperties: false,
    },
  },
  {
    name: 'list_scheduled_tasks',
    description: 'List scheduled task records owned by the authenticated tenant.',
    requiredScope: 'mcp:tasks:read',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['scheduled', 'active', 'completed', 'escalated'] },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'schedule_deferred_task',
    description: 'Create a tenant-owned scheduled task record for a future execution time.',
    requiredScope: 'mcp:tasks:write',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 255 },
        instructions: { type: 'string', minLength: 1, maxLength: 10000 },
        target_time: { type: 'string', format: 'date-time' },
        profile_id: { type: 'string', format: 'uuid' },
      },
      required: ['title', 'instructions', 'target_time'],
      additionalProperties: false,
    },
  },
];

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', error: { code, message }, id: id ?? null };
}

function toolResult(id: unknown, value: unknown) {
  const json = JSON.stringify(value);
  return {
    jsonrpc: '2.0',
    result: {
      content: [{ type: 'text', text: json }],
      structuredContent: value,
    },
    id,
  };
}

function toolError(id: unknown, message: string) {
  return {
    jsonrpc: '2.0',
    result: { content: [{ type: 'text', text: message }], isError: true },
    id,
  };
}

export function getAuthorizedPlatformTools(
  whitelist: string[] | null | undefined,
  scopes: string[] | null | undefined
): PlatformTool[] {
  const allowedTools = whitelist || [];
  const allowedScopes = scopes || [];
  return PLATFORM_MCP_TOOLS.filter((tool) =>
    (allowedTools.includes('*') || allowedTools.includes(tool.name)) &&
    (allowedScopes.includes('*') || allowedScopes.includes(tool.requiredScope))
  );
}

async function executePlatformTool(
  toolName: string,
  rawArguments: unknown,
  key: ApiKeyContext
): Promise<unknown> {
  const supabase = getSupabaseAdminClient();

  switch (toolName) {
    case 'list_mcp_profiles': {
      const args = listProfilesArgs.parse(rawArguments || {});
      const { data, error } = await supabase
        .from('mcp_profiles')
        .select('id, name, description, token_budget, settings, is_active, created_at, updated_at')
        .eq('org_id', key.tenant_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(args.limit || 20);
      if (error) throw new Error(`Could not list MCP profiles: ${error.message}`);
      return { profiles: data || [] };
    }
    case 'list_scheduled_tasks': {
      const args = listTasksArgs.parse(rawArguments || {});
      let query = supabase
        .from('supervisor_tasks')
        .select('id, title, description, status, target_time, metadata, created_at')
        .eq('tenant_id', key.tenant_id)
        .order('target_time', { ascending: true })
        .limit(args.limit || 20);
      if (args.status) query = query.eq('status', args.status);
      const { data, error } = await query;
      if (error) throw new Error(`Could not list scheduled tasks: ${error.message}`);
      return { tasks: data || [] };
    }
    case 'schedule_deferred_task': {
      const args = scheduleTaskArgs.parse(rawArguments || {});
      const targetTime = new Date(args.target_time);
      if (targetTime.getTime() <= Date.now()) {
        throw new Error('target_time must be in the future.');
      }

      if (args.profile_id) {
        const { data: profile, error: profileError } = await supabase
          .from('mcp_profiles')
          .select('id')
          .eq('id', args.profile_id)
          .eq('org_id', key.tenant_id)
          .eq('is_active', true)
          .maybeSingle();
        if (profileError) throw new Error(`Could not validate MCP profile: ${profileError.message}`);
        if (!profile) throw new Error('profile_id is not an active profile owned by this tenant.');
      }

      const { data, error } = await supabase
        .from('supervisor_tasks')
        .insert({
          tenant_id: key.tenant_id,
          title: args.title,
          description: args.instructions,
          status: 'scheduled',
          target_time: targetTime.toISOString(),
          metadata: { source: 'platform_mcp', profile_id: args.profile_id || null },
        })
        .select('id, title, description, status, target_time, created_at')
        .single();
      if (error || !data) throw new Error(`Could not create scheduled task: ${error?.message || 'no task returned'}`);
      return { task: data };
    }
    default:
      throw new Error(`Tool '${toolName}' is not implemented by the platform MCP server.`);
  }
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

  const keyHash = `\\x${hashApiKey(rawApiKey.replace(/^Bearer\s+/i, '').trim())}`;
  const supabase = getSupabaseAdminClient();
  const { data: keyRecord, error: keyErr } = await supabase
    .from('mcp_api_keys')
    .select('id, tenant_id, scopes, tools_whitelist, revoked_at, expires_at')
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


  await supabase
    .from('mcp_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRecord!.id);
  }

  const key = keyRecord as ApiKeyContext;
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
    case 'tools/list':
      return {
        statusCode: 200,
        body: { jsonrpc: '2.0', result: { tools: getAuthorizedPlatformTools(key.tools_whitelist, key.scopes) }, id },
      };
    case 'tools/call': {
      const name = params?.name;
      const allowedTool = getAuthorizedPlatformTools(key.tools_whitelist, key.scopes)
        .find((tool) => tool.name === name);
      if (!allowedTool) {
        return { statusCode: 200, body: toolError(id, `Tool '${name}' is not enabled for this API key.`) };
      }
      try {
        return { statusCode: 200, body: toolResult(id, await executePlatformTool(name, params?.arguments, key)) };
      } catch (error) {
        return {
          statusCode: 200,
          body: toolError(id, error instanceof Error ? error.message : 'Platform MCP tool execution failed.'),
        };
      }
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
