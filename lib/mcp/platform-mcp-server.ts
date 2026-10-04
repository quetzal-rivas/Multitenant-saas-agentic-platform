import { ZodError } from 'zod';
import { ApiKeyError, extractRawApiKey, verifyApiKey } from '@/lib/auth/api-keys';
import type { AuthContext } from '@/lib/auth/require-auth';
import { listPlatformApiKeys } from '@/lib/auth/api-keys';
import { isServiceError } from '@/lib/services/errors';
import * as profiles from '@/lib/services/profiles';
import * as tasks from '@/lib/services/tasks';
import {
  PLATFORM_TOOL_DEFINITIONS,
  getAuthorizedPlatformTools,
  toMcpToolList,
  type PlatformToolName,
} from './tool-catalog';

export { getAuthorizedPlatformTools } from './tool-catalog';
export const PLATFORM_MCP_TOOLS = PLATFORM_TOOL_DEFINITIONS;

export type { ClientConfigSnippets } from './client-config';

/** Newest first; the first entry is offered when the client asks for something unknown. */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

type ToolCtx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode' | 'apiKeyId'>;

const TOOL_HANDLERS: Record<PlatformToolName, (ctx: ToolCtx, args: any) => Promise<unknown>> = {
  list_mcp_profiles: profiles.listProfiles,
  get_mcp_profile: profiles.getProfile,
  create_mcp_profile: profiles.createProfile,
  update_mcp_profile: profiles.updateProfile,
  archive_mcp_profile: profiles.archiveProfile,
  list_scheduled_tasks: tasks.listTasks,
  get_scheduled_task: tasks.getTask,
  schedule_deferred_task: tasks.scheduleTask,
  cancel_scheduled_task: tasks.cancelTask,
  list_api_keys: async (ctx) => ({
    keys: (await listPlatformApiKeys(ctx.tenantId)).map(({ tenant_id: _t, ...key }) => key),
  }),
};

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', error: { code, message }, id: id ?? null };
}

function toolResult(id: unknown, value: unknown) {
  return {
    jsonrpc: '2.0',
    result: {
      content: [{ type: 'text', text: JSON.stringify(value) }],
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

function describeToolFailure(error: unknown): string {
  if (error instanceof ZodError) {
    return `Invalid arguments: ${error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ')}`;
  }
  if (isServiceError(error)) return error.message;
  console.error('[platform-mcp] tool execution failed', error);
  return 'Platform MCP tool execution failed.';
}

export async function executePlatformTool(name: string, rawArguments: unknown, ctx: ToolCtx) {
  const tool = PLATFORM_TOOL_DEFINITIONS.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool '${name}' is not implemented by the platform MCP server.`);
  const args = tool.schema.parse(rawArguments ?? {});
  return TOOL_HANDLERS[tool.name](ctx, args);
}

export function negotiateProtocolVersion(requested: unknown): string {
  return typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
    ? requested
    : SUPPORTED_PROTOCOL_VERSIONS[0];
}

/** Handle authenticated MCP JSON-RPC requests for the platform endpoint. */
export async function handlePlatformMCPRPC(
  authorizationHeader: string,
  rpcBody: any
): Promise<{ statusCode: number; body: any }> {
  const id = rpcBody?.id ?? null;
  if (!rpcBody || rpcBody.jsonrpc !== '2.0' || typeof rpcBody.method !== 'string') {
    return { statusCode: 400, body: rpcError(id, -32600, 'Invalid JSON-RPC request') };
  }

  const rawApiKey = extractRawApiKey(authorizationHeader);
  if (!rawApiKey) {
    return { statusCode: 401, body: rpcError(id, -32001, 'Missing Authorization: Bearer <Context Control API key>') };
  }

  let key;
  try {
    key = await verifyApiKey(rawApiKey);
  } catch (err) {
    if (err instanceof ApiKeyError) {
      return { statusCode: err.code === 'RATE_LIMITED' ? 429 : 401, body: rpcError(id, -32001, err.message) };
    }
    throw err;
  }
  if (!key) {
    return { statusCode: 401, body: rpcError(id, -32001, 'Invalid or revoked Platform API Key') };
  }

  const ctx: ToolCtx = { tenantId: key.tenantId, userId: `key_${key.id}`, authMode: 'api_key', apiKeyId: key.id };
  const authorizedTools = getAuthorizedPlatformTools(key.toolsWhitelist, key.scopes);
  const { method, params } = rpcBody;

  // JSON-RPC notifications carry no id and get no response body.
  if (method.startsWith('notifications/')) {
    return { statusCode: 202, body: null };
  }

  switch (method) {
    case 'initialize':
      return {
        statusCode: 200,
        body: {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: negotiateProtocolVersion(params?.protocolVersion),
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'context-control', title: 'Context Control', version: '1.1.0' },
            instructions:
              'Manage this Context Control organization: profiles, scheduled tasks and API key inventory. ' +
              'Available tools depend on the scopes granted to the API key.',
          },
        },
      };
    case 'ping':
      return { statusCode: 200, body: { jsonrpc: '2.0', id, result: {} } };
    case 'tools/list':
      return { statusCode: 200, body: { jsonrpc: '2.0', result: { tools: toMcpToolList(authorizedTools) }, id } };
    case 'tools/call': {
      const name = params?.name;
      if (!authorizedTools.some((tool) => tool.name === name)) {
        return { statusCode: 200, body: toolError(id, `Tool '${name}' is not enabled for this API key.`) };
      }
      try {
        return { statusCode: 200, body: toolResult(id, await executePlatformTool(name, params?.arguments, ctx)) };
      } catch (error) {
        return { statusCode: 200, body: toolError(id, describeToolFailure(error)) };
      }
    }
    default:
      return { statusCode: 200, body: rpcError(id, -32601, `Method '${method}' not found`) };
  }
}

export { API_KEY_PLACEHOLDER, generateClientConfigSnippets } from './client-config';
