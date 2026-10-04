import { z } from 'zod';
import { PLATFORM_SCOPES, PLATFORM_TOOL_DEFINITIONS } from '@/lib/mcp/tool-catalog';

const toolNames = PLATFORM_TOOL_DEFINITIONS.map((t) => t.name) as [string, ...string[]];
const scopeValue = z.string().refine(
  (s) => s === '*' || PLATFORM_SCOPES.includes(s) || /^mcp:\*:(read|write)$/.test(s),
  { message: 'Unknown scope' }
);

export const createApiKeyBody = z.object({
  name: z.string().trim().min(1).max(120),
  environment: z.enum(['live', 'test']).default('live'),
  scopes: z.array(scopeValue).max(50).optional(),
  toolsWhitelist: z.array(z.enum(toolNames)).max(100).default([]),
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
}).strict();

export const updateApiKeyBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  scopes: z.array(scopeValue).min(1).max(50).optional(),
  toolsWhitelist: z.array(z.enum(toolNames)).max(100).optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
}).strict();
