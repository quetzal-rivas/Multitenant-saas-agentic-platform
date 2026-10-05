import { z } from 'zod';
import { heartbeatScheduleSchema } from './heartbeat-schedule';
import { PLATFORM_TOOL_DEFINITIONS, canonicalToolName } from '@/lib/mcp/tool-catalog';

/**
 * Team as code: the single format used by the Team Builder form, the JSON editor,
 * export/import and the API. Browser-safe (no server imports) so the UI validates
 * exactly what the server will accept. A team with no workers is a single agent.
 */

export const TEAM_LLM_PROVIDERS = ['anthropic', 'openai', 'gemini'] as const;
export const MAX_TEAM_WORKERS = 8;
const toolNames = PLATFORM_TOOL_DEFINITIONS.map((t) => t.name) as [string, ...string[]];
/** Accept legacy tool names in pasted specs, store the canonical ones. */
const toolName = z.string().transform(canonicalToolName).pipe(z.enum(toolNames));
const optionalId = z.string().uuid().nullable().optional();

export const teamSpecSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).nullable().optional(),
    llm: z.object({
      provider: z.enum(TEAM_LLM_PROVIDERS),
      model: z.string().trim().min(1).max(120).optional(),
    }).strict(),
    routing_strategy: z.literal('supervisor_router').default('supervisor_router'),
    supervisor: z.object({
      instructions: z.string().trim().max(8000).nullable().optional(),
      context_profile_id: optionalId,
      mcp_profile_id: optionalId,
      tools: z.array(toolName).max(50).default([]),
    }).strict(),
    workers: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          role: z.string().trim().min(1).max(300),
          instructions: z.string().trim().max(8000).nullable().optional(),
          context_profile_id: optionalId,
          mcp_profile_id: optionalId,
          tools: z.array(toolName).max(50).default([]),
          model: z.string().trim().min(1).max(120).nullable().optional(),
        }).strict()
      )
      .max(MAX_TEAM_WORKERS)
      .default([]),
    heartbeat: z
      .object({
        enabled: z.boolean(),
        goal: z.string().trim().max(4000).nullable().optional(),
        schedule: heartbeatScheduleSchema.nullable().optional(),
        max_runs_per_day: z.number().int().min(1).max(288).default(48),
      })
      .strict()
      .default({ enabled: false, max_runs_per_day: 48 }),
  })
  .strict()
  .superRefine((spec, ctx) => {
    const slugs = spec.workers.map((w) => workerSlug(w.name));
    slugs.forEach((slug, i) => {
      if (!slug) ctx.addIssue({ code: 'custom', path: ['workers', i, 'name'], message: 'Name needs letters or digits' });
      else if (slugs.indexOf(slug) !== i) ctx.addIssue({ code: 'custom', path: ['workers', i, 'name'], message: 'Worker names must be unique' });
    });
    if (spec.heartbeat.enabled) {
      if (!spec.heartbeat.goal) ctx.addIssue({ code: 'custom', path: ['heartbeat', 'goal'], message: 'A heartbeat needs a goal' });
      if (!spec.heartbeat.schedule) ctx.addIssue({ code: 'custom', path: ['heartbeat', 'schedule'], message: 'A heartbeat needs a schedule' });
    }
  });

export type TeamSpec = z.infer<typeof teamSpecSchema>;

/** Stable tool-friendly id for a worker, e.g. "Billing Specialist" -> "billing_specialist". */
export function workerSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

