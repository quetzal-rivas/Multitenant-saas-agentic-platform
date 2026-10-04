import { z } from 'zod';

/**
 * Single source of truth for the Context Control platform tool surface.
 * Shared by the MCP adapter (lib/mcp/platform-mcp-server.ts), the API key UI and
 * the MCP Hub. Contains no server-only imports so client components can use it.
 */

export type ToolSideEffect = 'read' | 'write';

export interface PlatformToolDefinition<S extends z.ZodType = z.ZodType> {
  name: string;
  title: string;
  description: string;
  requiredScope: string;
  sideEffect: ToolSideEffect;
  schema: S;
}

const limit = z.number().int().min(1).max(100).optional();
const taskStatus = z.enum(['scheduled', 'active', 'completed', 'escalated', 'cancelled']);
const profileSettings = z.record(z.string(), z.unknown());

export const listProfilesArgs = z.object({ limit, include_inactive: z.boolean().optional() }).strict();
export const getProfileArgs = z.object({ profile_id: z.string().uuid() }).strict();
export const createProfileArgs = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  token_budget: z.number().int().min(256).max(2_000_000),
  settings: profileSettings.optional(),
}).strict();
export const updateProfileArgs = z.object({
  profile_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  token_budget: z.number().int().min(256).max(2_000_000).optional(),
  settings: profileSettings.optional(),
}).strict();
export const archiveProfileArgs = z.object({ profile_id: z.string().uuid() }).strict();

export const listTasksArgs = z.object({ status: taskStatus.optional(), limit }).strict();
export const getTaskArgs = z.object({ task_id: z.string().uuid() }).strict();
export const scheduleTaskArgs = z.object({
  title: z.string().trim().min(1).max(255),
  instructions: z.string().trim().min(1).max(10000),
  target_time: z.string().datetime({ offset: true }),
  profile_id: z.string().uuid().optional(),
}).strict();
export const cancelTaskArgs = z.object({ task_id: z.string().uuid() }).strict();

export const listApiKeysArgs = z.object({}).strict();

export const PLATFORM_TOOL_DEFINITIONS = [
  {
    name: 'list_mcp_profiles',
    title: 'List profiles',
    description: 'List MCP profiles owned by the authenticated organization.',
    requiredScope: 'mcp:profiles:read',
    sideEffect: 'read',
    schema: listProfilesArgs,
  },
  {
    name: 'get_mcp_profile',
    title: 'Get profile',
    description: 'Fetch one MCP profile owned by the authenticated organization.',
    requiredScope: 'mcp:profiles:read',
    sideEffect: 'read',
    schema: getProfileArgs,
  },
  {
    name: 'create_mcp_profile',
    title: 'Create profile',
    description: 'Create a new MCP profile with a token budget and optional settings.',
    requiredScope: 'mcp:profiles:write',
    sideEffect: 'write',
    schema: createProfileArgs,
  },
  {
    name: 'update_mcp_profile',
    title: 'Update profile',
    description: 'Change the name, description, token budget or settings of an existing profile.',
    requiredScope: 'mcp:profiles:write',
    sideEffect: 'write',
    schema: updateProfileArgs,
  },
  {
    name: 'archive_mcp_profile',
    title: 'Archive profile',
    description: 'Deactivate a profile. It stays in the database and can be reactivated from the dashboard.',
    requiredScope: 'mcp:profiles:write',
    sideEffect: 'write',
    schema: archiveProfileArgs,
  },
  {
    name: 'list_scheduled_tasks',
    title: 'List tasks',
    description: 'List scheduled task records owned by the authenticated organization.',
    requiredScope: 'mcp:tasks:read',
    sideEffect: 'read',
    schema: listTasksArgs,
  },
  {
    name: 'get_scheduled_task',
    title: 'Get task',
    description: 'Fetch one scheduled task owned by the authenticated organization.',
    requiredScope: 'mcp:tasks:read',
    sideEffect: 'read',
    schema: getTaskArgs,
  },
  {
    name: 'schedule_deferred_task',
    title: 'Schedule task',
    description:
      'Record a task for a future execution time. The record is stored durably; execution depends on the deferred task worker being deployed.',
    requiredScope: 'mcp:tasks:write',
    sideEffect: 'write',
    schema: scheduleTaskArgs,
  },
  {
    name: 'cancel_scheduled_task',
    title: 'Cancel task',
    description: 'Cancel a task that has not started yet.',
    requiredScope: 'mcp:tasks:write',
    sideEffect: 'write',
    schema: cancelTaskArgs,
  },
  {
    name: 'list_api_keys',
    title: 'List API keys',
    description: 'List the organization’s API keys (prefix, scopes, last use). Secrets are never returned.',
    requiredScope: 'mcp:keys:read',
    sideEffect: 'read',
    schema: listApiKeysArgs,
  },
] as const satisfies readonly PlatformToolDefinition[];

export type PlatformToolName = (typeof PLATFORM_TOOL_DEFINITIONS)[number]['name'];

/** Every scope a key can be granted, derived from the catalog. */
export const PLATFORM_SCOPES: string[] = Array.from(
  new Set(PLATFORM_TOOL_DEFINITIONS.map((tool) => tool.requiredScope))
);

/**
 * Scope matching. '*' grants everything; a segment '*' matches one segment
 * (e.g. 'mcp:*:read' grants every read scope).
 */
export function hasScope(granted: string[] | null | undefined, required: string): boolean {
  const requiredParts = required.split(':');
  return (granted || []).some((scope) => {
    if (scope === '*' || scope === required) return true;
    const parts = scope.split(':');
    return parts.length === requiredParts.length && parts.every((p, i) => p === '*' || p === requiredParts[i]);
  });
}

/**
 * Tools a credential may use. The required scope must be granted; a non-empty
 * whitelist further narrows the set. An empty whitelist adds no restriction.
 */
export function getAuthorizedPlatformTools(
  whitelist: string[] | null | undefined,
  scopes: string[] | null | undefined
) {
  const allowed = whitelist || [];
  return PLATFORM_TOOL_DEFINITIONS.filter(
    (tool) =>
      hasScope(scopes, tool.requiredScope) &&
      (allowed.length === 0 || allowed.includes('*') || allowed.includes(tool.name))
  );
}

export function toolInputJsonSchema(tool: PlatformToolDefinition): Record<string, unknown> {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(tool.schema) as Record<string, unknown>;
  return schema;
}

/** MCP tools/list shape for a set of catalog tools. */
export function toMcpToolList(tools: readonly PlatformToolDefinition[]) {
  return tools.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: toolInputJsonSchema(tool),
    annotations: {
      readOnlyHint: tool.sideEffect === 'read',
      destructiveHint: tool.name.startsWith('archive_') || tool.name.startsWith('cancel_'),
    },
  }));
}
