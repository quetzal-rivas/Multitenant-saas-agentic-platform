import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiKeyError, extractRawApiKey, listPlatformApiKeys, verifyApiKey } from '@/lib/auth/api-keys';
import type { AuthContext } from '@/lib/auth/require-auth';
import { isServiceError } from '@/lib/services/errors';
import * as profiles from '@/lib/services/profiles';
import * as tasks from '@/lib/services/tasks';
import {
  PLATFORM_TOOL_DEFINITIONS,
  canonicalToolName,
  getAuthorizedPlatformTools,
  type PlatformToolDefinition,
  type PlatformToolName,
} from './tool-catalog';

export { getAuthorizedPlatformTools } from './tool-catalog';
export { API_KEY_PLACEHOLDER, generateClientConfigSnippets } from './client-config';
export type { ClientConfigSnippets } from './client-config';
export const PLATFORM_MCP_TOOLS = PLATFORM_TOOL_DEFINITIONS;

export const MCP_SERVER_INFO = { name: 'context-control-mcp-server', title: 'Context Control', version: '2.0.0' };
/** Upper bound for the text part of a tool result; structuredContent is not truncated. */
export const CHARACTER_LIMIT = 25_000;

type ToolCtx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode' | 'apiKeyId'>;
type Row = Record<string, any>;

const TOOL_HANDLERS: Record<PlatformToolName, (ctx: ToolCtx, args: any) => Promise<Record<string, unknown>>> = {
  contextcontrol_list_profiles: profiles.listProfiles,
  contextcontrol_get_profile: profiles.getProfile,
  contextcontrol_create_profile: profiles.createProfile,
  contextcontrol_update_profile: profiles.updateProfile,
  contextcontrol_archive_profile: profiles.archiveProfile,
  contextcontrol_list_tasks: tasks.listTasks,
  contextcontrol_get_task: tasks.getTask,
  contextcontrol_schedule_task: tasks.scheduleTask,
  contextcontrol_cancel_task: tasks.cancelTask,
  contextcontrol_list_api_keys: async (ctx) => ({
    keys: (await listPlatformApiKeys(ctx.tenantId)).map(({ tenant_id: _t, ...key }) => key),
  }),
};

/**
 * Validate and run a catalog tool for a tenant. Used by Agent Studio; the MCP server
 * goes through the same handlers. Accepts legacy (unprefixed) names.
 */
export async function executePlatformTool(name: string, rawArguments: unknown, ctx: ToolCtx) {
  const canonical = canonicalToolName(name);
  const tool = PLATFORM_TOOL_DEFINITIONS.find((t) => t.name === canonical);
  if (!tool) throw new Error(`Tool '${name}' is not implemented by the platform MCP server.`);
  const args = tool.schema.parse(rawArguments ?? {});
  return TOOL_HANDLERS[tool.name](ctx, args);
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

const when = (iso: unknown) => (typeof iso === 'string' && iso ? new Date(iso).toISOString().replace('.000Z', 'Z') : '—');

function profileLine(p: Row) {
  return `- **${p.name}** (\`${p.id}\`) · budget ${p.token_budget} tokens${p.is_active === false ? ' · archived' : ''}${p.description ? `\n  ${p.description}` : ''}`;
}
function taskLine(t: Row) {
  return `- **${t.title}** (\`${t.id}\`) · ${t.status} · runs ${when(t.target_time)}${t.description ? `\n  ${t.description}` : ''}`;
}
function keyLine(k: Row) {
  const tools = k.tools_whitelist?.length ? ` · tools: ${k.tools_whitelist.join(', ')}` : '';
  return `- **${k.name}** \`${k.key_prefix}…\` (${k.environment}) · scopes: ${(k.scopes || []).join(', ')}${tools} · last used ${when(k.last_used_at)}${k.expires_at ? ` · expires ${when(k.expires_at)}` : ''}`;
}
function pageFooter(r: Row) {
  return r.has_more
    ? `\n\nShowing ${r.next_offset} of ${r.total_count}. Pass offset=${r.next_offset} for more.`
    : `\n\n${r.total_count} total.`;
}

export function renderMarkdown(toolName: PlatformToolName, result: Row): string {
  switch (toolName) {
    case 'contextcontrol_list_profiles':
      return result.profiles.length ? `## Profiles\n${result.profiles.map(profileLine).join('\n')}${pageFooter(result)}` : 'No profiles found.';
    case 'contextcontrol_list_tasks':
      return result.tasks.length ? `## Tasks\n${result.tasks.map(taskLine).join('\n')}${pageFooter(result)}` : 'No tasks found.';
    case 'contextcontrol_list_api_keys':
      return result.keys.length ? `## API keys\n${result.keys.map(keyLine).join('\n')}` : 'No active API keys.';
    default:
      if (result.profile) return profileLine(result.profile);
      if (result.task) return taskLine(result.task);
      return JSON.stringify(result, null, 2);
  }
}

function capText(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return `${text.slice(0, CHARACTER_LIMIT)}\n\n[Truncated at ${CHARACTER_LIMIT} characters. Use limit/offset to request a smaller page.]`;
}

function toolFailure(error: unknown): CallToolResult {
  if (!isServiceError(error)) console.error('[platform-mcp] tool execution failed', error);
  const message = isServiceError(error)
    ? error.message
    : 'The tool failed unexpectedly. Try again; if it persists, contact support.';
  return { isError: true, content: [{ type: 'text', text: `Error: ${message}` }] };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

/** Build a per-request MCP server exposing only the tools this credential may use. */
export function buildPlatformMcpServer(ctx: ToolCtx, tools: readonly PlatformToolDefinition[]): McpServer {
  const server = new McpServer(MCP_SERVER_INFO, {
    capabilities: { tools: {} },
    instructions:
      'Manage this Context Control organization: MCP profiles, scheduled tasks and API key inventory. ' +
      'List tools return pages (use offset/next_offset). Ids come from the list tools.',
  });

  for (const tool of tools) {
    const name = tool.name as PlatformToolName;
    server.registerTool(
      name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.schema,
        outputSchema: tool.outputSchema,
        annotations: { title: tool.title, ...tool.annotations },
      },
      async (args: Row): Promise<CallToolResult> => {
        try {
          const result = await TOOL_HANDLERS[name](ctx, args);
          const text = args.response_format === 'json' ? JSON.stringify(result, null, 2) : renderMarkdown(name, result);
          return { content: [{ type: 'text', text: capText(text) }], structuredContent: result };
        } catch (error) {
          return toolFailure(error);
        }
      }
    );
  }
  return server;
}

function jsonRpcAuthError(status: number, message: string): Response {
  return Response.json(
    { jsonrpc: '2.0', error: { code: -32001, message }, id: null },
    {
      status,
      headers: status === 401 ? { 'WWW-Authenticate': 'Bearer realm="context-control", error="invalid_token"' } : {},
    }
  );
}

/**
 * Handle one Streamable HTTP request: authenticate the Bearer key, then let the
 * official SDK transport (stateless, JSON responses) process the JSON-RPC message.
 */
export async function handlePlatformMcpRequest(req: Request): Promise<Response> {
  const rawKey = extractRawApiKey(req.headers.get('authorization'));
  if (!rawKey) return jsonRpcAuthError(401, 'Missing Authorization: Bearer <Context Control API key>');

  let key;
  try {
    key = await verifyApiKey(rawKey);
  } catch (err) {
    if (err instanceof ApiKeyError) return jsonRpcAuthError(err.code === 'RATE_LIMITED' ? 429 : 401, err.message);
    throw err;
  }
  if (!key) return jsonRpcAuthError(401, 'Invalid or revoked Platform API Key');

  const ctx: ToolCtx = { tenantId: key.tenantId, userId: `key_${key.id}`, authMode: 'api_key', apiKeyId: key.id };
  const server = buildPlatformMcpServer(ctx, getAuthorizedPlatformTools(key.toolsWhitelist, key.scopes));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });

  try {
    await server.connect(transport);
    return await transport.handleRequest(req, {
      authInfo: { token: rawKey, clientId: key.id, scopes: key.scopes, extra: { tenantId: key.tenantId } },
    });
  } finally {
    // Stateless: nothing outlives the request.
    void transport.close().catch(() => undefined);
    void server.close().catch(() => undefined);
  }
}
