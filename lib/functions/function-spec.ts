import { z } from 'zod';

/** Browser-safe shapes shared by the Function Studio UI, routes and services. */

export const FUNCTION_LANGUAGES = ['python', 'typescript'] as const;
export const MAX_FUNCTIONS_PER_ORG = 25;
export const MAX_CODE_CHARS = 100_000;
export const DAILY_INVOCATION_CAP = 1000;

/** Tool-friendly slug: "Convert Temperature" -> "convert_temperature". */
export function functionSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return /^[a-z]/.test(slug) ? slug : `fn_${slug}`.slice(0, 48);
}

export const functionToolName = (slug: string) => `fn_${slug}`;

const jsonSchemaObject = z
  .record(z.string(), z.unknown())
  .refine((s) => s.type === undefined || s.type === 'object', 'The input schema must describe an object (type: "object").');

export const functionSaveSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(1000).optional().default(''),
    language: z.enum(FUNCTION_LANGUAGES),
    code: z.string().min(1).max(MAX_CODE_CHARS),
    input_schema: jsonSchemaObject.default({ type: 'object', properties: {} }),
    timeout_seconds: z.number().int().min(1).max(30).default(10),
    memory_mb: z.number().int().min(128).max(1024).default(256),
  })
  .strict()
  .refine((f) => /[a-z0-9]/i.test(f.name), { path: ['name'], message: 'Name needs letters or digits' });
export type FunctionSave = z.infer<typeof functionSaveSchema>;

export const secretNameSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{0,63}$/, 'Use UPPER_SNAKE_CASE, e.g. WEATHER_API_KEY');

export const draftRequestSchema = z
  .object({
    description: z.string().trim().min(5).max(4000),
    language: z.enum(FUNCTION_LANGUAGES),
    provider: z.enum(['anthropic', 'openai', 'gemini']).optional(),
  })
  .strict();

export const fixRequestSchema = z
  .object({
    error: z.string().trim().min(1).max(8000),
    input: z.unknown().optional(),
    code: z.string().min(1).max(MAX_CODE_CHARS).optional().describe('Current editor code; defaults to the saved code.'),
    provider: z.enum(['anthropic', 'openai', 'gemini']).optional(),
  })
  .strict();

/**
 * Light JSON-schema check for tool input: object type, required keys and primitive
 * property types. Returns readable problems (empty when valid).
 */
export function validateInput(schema: Record<string, any> | null | undefined, input: unknown): string[] {
  if (!schema || typeof schema !== 'object') return [];
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return ['Input must be a JSON object.'];
  const problems: string[] = [];
  const value = input as Record<string, unknown>;
  for (const key of (schema.required as string[]) || []) {
    if (value[key] === undefined) problems.push(`Missing required field "${key}".`);
  }
  const props = (schema.properties || {}) as Record<string, any>;
  for (const [key, prop] of Object.entries(props)) {
    const v = value[key];
    if (v === undefined || v === null || !prop?.type) continue;
    const types: string[] = Array.isArray(prop.type) ? prop.type : [prop.type];
    const ok = types.some((t) =>
      t === 'integer' ? Number.isInteger(v)
        : t === 'number' ? typeof v === 'number'
        : t === 'array' ? Array.isArray(v)
        : t === 'object' ? typeof v === 'object' && !Array.isArray(v)
        : typeof v === t
    );
    if (!ok) problems.push(`Field "${key}" must be ${types.join(' or ')}.`);
    if (ok && Array.isArray(prop.enum) && !prop.enum.includes(v)) problems.push(`Field "${key}" must be one of ${prop.enum.map((e: unknown) => JSON.stringify(e)).join(', ')}.`);
  }
  return problems;
}
