import { z } from 'zod';

/**
 * Single source of truth for the Context Control platform tool surface.
 * Shared by the MCP server (lib/mcp/platform-mcp-server.ts), the Agent Studio runner,
 * the API key UI and the MCP Hub. No server-only imports, so client components can use it.
 */

export type ToolSideEffect = 'read' | 'write';

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface PlatformToolDefinition<S extends z.ZodObject = z.ZodObject, O extends z.ZodObject = z.ZodObject> {
  name: string;
  title: string;
  description: string;
  requiredScope: string;
  sideEffect: ToolSideEffect;
  annotations: ToolAnnotations;
  schema: S;
  outputSchema: O;
}

/** Tool names before the `contextcontrol_` prefix. Kept so stored whitelists keep matching. */
export const LEGACY_TOOL_NAMES: Record<string, string> = {
  list_mcp_profiles: 'contextcontrol_list_profiles',
  get_mcp_profile: 'contextcontrol_get_profile',
  create_mcp_profile: 'contextcontrol_create_profile',
  update_mcp_profile: 'contextcontrol_update_profile',
  archive_mcp_profile: 'contextcontrol_archive_profile',
  list_scheduled_tasks: 'contextcontrol_list_tasks',
  get_scheduled_task: 'contextcontrol_get_task',
  schedule_deferred_task: 'contextcontrol_schedule_task',
  cancel_scheduled_task: 'contextcontrol_cancel_task',
  list_api_keys: 'contextcontrol_list_api_keys',
};

export function canonicalToolName(name: string): string {
  return LEGACY_TOOL_NAMES[name] || name;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const limit = z.number().int().min(1).max(100).optional().describe('Maximum items to return (1-100, default 20).');
const offset = z.number().int().min(0).optional().describe('Number of items to skip, for paging (default 0).');
const responseFormat = z
  .enum(['markdown', 'json'])
  .optional()
  .describe("'markdown' (default) for a readable summary, 'json' for the raw records.");
const uuid = (what: string) => z.string().uuid().describe(`${what} (UUID). Use the matching list tool to find it.`);
const taskStatus = z.enum(['scheduled', 'active', 'completed', 'escalated', 'cancelled']);
const profileSettings = z.record(z.string(), z.unknown());

export const listProfilesArgs = z.object({
  limit,
  offset,
  include_inactive: z.boolean().optional().describe('Include archived profiles (default false).'),
  response_format: responseFormat,
}).strict();
export const getProfileArgs = z.object({ profile_id: uuid('Profile id') }).strict();
export const createProfileArgs = z.object({
  name: z.string().trim().min(1).max(120).describe('Unique name within the organization.'),
  description: z.string().trim().max(2000).optional(),
  token_budget: z.number().int().min(256).max(2_000_000).describe('Total context token budget, e.g. 16000.'),
  settings: profileSettings.optional().describe('Free-form settings object.'),
}).strict();
export const updateProfileArgs = z.object({
  profile_id: uuid('Profile id'),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  token_budget: z.number().int().min(256).max(2_000_000).optional(),
  settings: profileSettings.optional().describe('Replaces the whole settings object.'),
}).strict();
export const archiveProfileArgs = z.object({ profile_id: uuid('Profile id') }).strict();

export const listTasksArgs = z.object({
  status: taskStatus.optional().describe('Only tasks in this status.'),
  limit,
  offset,
  response_format: responseFormat,
}).strict();
export const getTaskArgs = z.object({ task_id: uuid('Task id') }).strict();
export const scheduleTaskArgs = z.object({
  title: z.string().trim().min(1).max(255),
  instructions: z.string().trim().min(1).max(10000).describe('What the task should do when it runs.'),
  target_time: z.string().datetime({ offset: true }).describe('Future ISO 8601 time with offset, e.g. 2026-12-01T09:00:00Z.'),
  profile_id: uuid('Active profile to run the task with').optional(),
}).strict();
export const cancelTaskArgs = z.object({ task_id: uuid('Task id of a not-yet-started task') }).strict();

export const listApiKeysArgs = z.object({ response_format: responseFormat }).strict();

// ---------------------------------------------------------------------------
// Outputs (loose objects: records may gain columns without breaking clients)
// ---------------------------------------------------------------------------

const profileRecord = z.looseObject({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  token_budget: z.number(),
  settings: z.unknown(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string().optional(),
});
const taskRecord = z.looseObject({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  target_time: z.string().nullable(),
  created_at: z.string(),
});
const apiKeyRecord = z.looseObject({
  id: z.string(),
  name: z.string(),
  key_prefix: z.string(),
  environment: z.string(),
  scopes: z.array(z.string()),
  tools_whitelist: z.array(z.string()),
  last_used_at: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  created_at: z.string(),
});
const page = {
  total_count: z.number().describe('Total matching records.'),
  has_more: z.boolean(),
  next_offset: z.number().nullable().describe('Pass as offset to get the next page; null on the last page.'),
};

const profileOutput = z.object({ profile: profileRecord });
const taskOutput = z.object({ task: taskRecord });

const READ: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = (destructive: boolean, idempotent: boolean): ToolAnnotations => ({
  readOnlyHint: false,
  destructiveHint: destructive,
  idempotentHint: idempotent,
  openWorldHint: false,
});

export const PLATFORM_TOOL_DEFINITIONS = [
  {
    name: 'contextcontrol_list_profiles',
    title: 'List profiles',
    description:
      'List MCP profiles in your Context Control organization, newest first. Returns { profiles: [{ id, name, description, token_budget, settings, is_active, ... }], total_count, has_more, next_offset }.',
    requiredScope: 'mcp:profiles:read',
    sideEffect: 'read',
    annotations: READ,
    schema: listProfilesArgs,
    outputSchema: z.object({ profiles: z.array(profileRecord), ...page }),
  },
  {
    name: 'contextcontrol_get_profile',
    title: 'Get profile',
    description: 'Fetch one MCP profile by id. Returns { profile }.',
    requiredScope: 'mcp:profiles:read',
    sideEffect: 'read',
    annotations: READ,
    schema: getProfileArgs,
    outputSchema: profileOutput,
  },
  {
    name: 'contextcontrol_create_profile',
    title: 'Create profile',
    description: 'Create an MCP profile with a token budget and optional settings. Names are unique per organization. Returns { profile }.',
    requiredScope: 'mcp:profiles:write',
    sideEffect: 'write',
    annotations: write(false, false),
    schema: createProfileArgs,
    outputSchema: profileOutput,
  },
  {
    name: 'contextcontrol_update_profile',
    title: 'Update profile',
    description: 'Change the name, description, token budget or settings of a profile. Only the fields you pass change. Returns { profile }.',
    requiredScope: 'mcp:profiles:write',
    sideEffect: 'write',
    annotations: write(false, true),
    schema: updateProfileArgs,
    outputSchema: profileOutput,
  },
  {
    name: 'contextcontrol_archive_profile',
    title: 'Archive profile',
    description: 'Deactivate a profile. It is kept (and can be reactivated from the dashboard) but no longer listed by default. Returns { profile }.',
    requiredScope: 'mcp:profiles:write',
    sideEffect: 'write',
    annotations: write(true, true),
    schema: archiveProfileArgs,
    outputSchema: profileOutput,
  },
  {
    name: 'contextcontrol_list_tasks',
    title: 'List tasks',
    description:
      'List scheduled tasks in your organization, soonest first, optionally filtered by status. Returns { tasks: [{ id, title, description, status, target_time, ... }], total_count, has_more, next_offset }.',
    requiredScope: 'mcp:tasks:read',
    sideEffect: 'read',
    annotations: READ,
    schema: listTasksArgs,
    outputSchema: z.object({ tasks: z.array(taskRecord), ...page }),
  },
  {
    name: 'contextcontrol_get_task',
    title: 'Get task',
    description: 'Fetch one scheduled task by id. Returns { task }.',
    requiredScope: 'mcp:tasks:read',
    sideEffect: 'read',
    annotations: READ,
    schema: getTaskArgs,
    outputSchema: taskOutput,
  },
  {
    name: 'contextcontrol_schedule_task',
    title: 'Schedule task',
    description:
      'Record a task to run at a future time, optionally bound to an active profile. The record is durable; execution requires the deferred task worker. Returns { task }.',
    requiredScope: 'mcp:tasks:write',
    sideEffect: 'write',
    annotations: write(false, false),
    schema: scheduleTaskArgs,
    outputSchema: taskOutput,
  },
  {
    name: 'contextcontrol_cancel_task',
    title: 'Cancel task',
    description: "Cancel a task that is still 'scheduled'. Tasks already running or finished cannot be cancelled. Returns { task }.",
    requiredScope: 'mcp:tasks:write',
    sideEffect: 'write',
    annotations: write(true, false),
    schema: cancelTaskArgs,
    outputSchema: taskOutput,
  },
  {
    name: 'contextcontrol_list_api_keys',
    title: 'List API keys',
    description:
      "List your organization's active API keys: name, prefix, scopes, tool whitelist, last use, expiry. Secrets are never returned. Returns { keys }.",
    requiredScope: 'mcp:keys:read',
    sideEffect: 'read',
    annotations: READ,
    schema: listApiKeysArgs,
    outputSchema: z.object({ keys: z.array(apiKeyRecord) }),
  },
] as const satisfies readonly PlatformToolDefinition[];

export type PlatformToolName = (typeof PLATFORM_TOOL_DEFINITIONS)[number]['name'];

/** Scopes for the Agent Studio API (not tied to a single MCP tool). */
export const AGENT_SCOPES = {
  run: 'agent:run',
  sessionsWrite: 'agent:sessions:write',
} as const;

/** Every scope a key can be granted: one per catalog tool scope, plus agent scopes. */
export const PLATFORM_SCOPES: string[] = Array.from(
  new Set([...PLATFORM_TOOL_DEFINITIONS.map((tool) => tool.requiredScope), ...Object.values(AGENT_SCOPES)])
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
 * whitelist further narrows the set (legacy names still match). An empty whitelist
 * adds no restriction.
 */
export function getAuthorizedPlatformTools(
  whitelist: string[] | null | undefined,
  scopes: string[] | null | undefined
) {
  const allowed = new Set((whitelist || []).map(canonicalToolName));
  return PLATFORM_TOOL_DEFINITIONS.filter(
    (tool) => hasScope(scopes, tool.requiredScope) && (allowed.size === 0 || allowed.has('*') || allowed.has(tool.name))
  );
}

function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema) as Record<string, unknown>;
  return json;
}

export function toolInputJsonSchema(tool: PlatformToolDefinition): Record<string, unknown> {
  return jsonSchemaOf(tool.schema);
}

export function toolOutputJsonSchema(tool: PlatformToolDefinition): Record<string, unknown> {
  return jsonSchemaOf(tool.outputSchema);
}
