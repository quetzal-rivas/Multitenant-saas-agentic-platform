import { z } from 'zod';
import type { AuthContext } from '@/lib/auth/require-auth';
import { DEFAULT_MODELS, generateLLMResponse, type LLMProvider } from '@/lib/agent/providers/llm-adapter';
import { getTenantSecret } from '@/lib/secrets/secrets-service';
import { configuredProviders } from '@/lib/services/agent-sessions';
import { ServiceError } from '@/lib/services/errors';
import { getFunction } from '@/lib/services/functions';
import { draftRequestSchema, fixRequestSchema, functionSlug } from './function-spec';
import { CODE_TEMPLATES, compileTypeScript, type FunctionLanguage } from './runtime-wrappers';

/**
 * AI help in Function Studio, using the organization's own LLM key. Results are
 * proposals: the UI shows them and nothing is saved or deployed until the user accepts.
 */

export interface AssistDeps {
  generate?: typeof generateLLMResponse;
  getSecret?: typeof getTenantSecret;
  providers?: (tenantId: string) => Promise<LLMProvider[]>;
}
type Ctx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode' | 'apiKeyId'>;
const AI_DEADLINE_MS = 25_000;

const CONTRACT: Record<FunctionLanguage, string> = {
  python: `Python 3.12. Define \`def main(input: dict) -> dict\` at module level. The return value must be JSON-serializable. Only the Python standard library is available (use urllib.request for HTTP). Read secrets from os.environ.`,
  typescript: `TypeScript on Node.js 22 (ES module). \`export default async function main(input)\` returning a JSON-serializable value. No npm packages are available; use the global fetch for HTTP. Read secrets from process.env.`,
};

const draftShape = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000),
  code: z.string().min(1).max(100_000),
  input_schema: z.record(z.string(), z.unknown()),
  explanation: z.string().max(2000).optional().default(''),
});
const fixShape = z.object({
  code: z.string().min(1).max(100_000),
  explanation: z.string().max(2000).optional().default(''),
});

/** Pull the first JSON object out of a model reply (tolerates code fences). */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in reply');
  return JSON.parse(candidate.slice(start, end + 1));
}

async function pickProvider(ctx: Ctx, requested: LLMProvider | undefined, deps: AssistDeps): Promise<LLMProvider> {
  const available = await (deps.providers || configuredProviders)(ctx.tenantId);
  if (requested) {
    if (!available.includes(requested)) throw new ServiceError(`No ${requested} key is stored. Add one in Account & Billing → LLM keys.`, 'CONFLICT');
    return requested;
  }
  if (!available.length) throw new ServiceError('No LLM key is stored for this organization. Add one in Account & Billing → LLM keys.', 'CONFLICT');
  return available.includes('gemini') ? 'gemini' : available[0];
}

/** Ask for JSON matching `shape`; one retry with the validation problem when the reply is not valid. */
async function askForJson<T>(ctx: Ctx, provider: LLMProvider, systemPrompt: string, prompt: string, shape: z.ZodType<T>, deps: AssistDeps): Promise<T> {
  const apiKey = await (deps.getSecret || getTenantSecret)(ctx.tenantId, provider);
  if (!apiKey) throw new ServiceError(`No ${provider} key is stored. Add one in Account & Billing → LLM keys.`, 'CONFLICT');
  const generate = deps.generate || generateLLMResponse;
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [{ role: 'user', content: prompt }];
  // The hosting gateway cuts requests at ~30 s; stay under it and fail with a clear message.
  const deadline = Date.now() + AI_DEADLINE_MS;
  let lastProblem = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 3000) break;
    let reply;
    try {
      reply = await generate({
        provider, model: DEFAULT_MODELS[provider], apiKey, systemPrompt, messages,
        maxTokens: 4000, reasoning: 'low', signal: AbortSignal.timeout(remaining),
      });
    } catch (err) {
      if ((err as Error)?.name === 'TimeoutError' || (err as Error)?.name === 'AbortError') {
        throw new ServiceError('The model took too long to answer (over 25 s). Try again, or describe a smaller function.', 'CONFLICT');
      }
      throw err;
    }
    try {
      return shape.parse(extractJson(reply.text));
    } catch (err) {
      lastProblem = err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : (err as Error).message;
      messages.push({ role: 'assistant', content: reply.text }, { role: 'user', content: `That was not valid (${lastProblem}). Reply with only the JSON object.` });
    }
  }
  throw new ServiceError(`The model did not return a usable answer (${lastProblem}). Try again or rephrase.`, 'CONFLICT');
}

export async function draftFunction(ctx: Ctx, body: unknown, deps: AssistDeps = {}) {
  const req = draftRequestSchema.parse(body);
  const provider = await pickProvider(ctx, req.provider, deps);
  const system = [
    'You write small, safe serverless functions that AI agents call as tools.',
    CONTRACT[req.language],
    'Validate inputs and raise/throw a clear error for bad input. Keep it short and readable. Never hard-code secrets.',
    'Reply with ONLY a JSON object: {"name": short human name, "description": one sentence an AI agent reads to decide when to call it, "code": the full source, "input_schema": JSON Schema object (type "object", properties with descriptions, required), "explanation": one or two sentences for the user}.',
    `Example of the expected code shape:\n${CODE_TEMPLATES[req.language]}`,
  ].join('\n\n');
  const draft = await askForJson(ctx, provider, system, `Write this function:\n${req.description}`, draftShape, deps);
  if (req.language === 'typescript') compileTypeScript(draft.code); // surfaces syntax problems early
  return {
    draft: {
      ...draft,
      language: req.language,
      input_schema: { type: 'object', properties: {}, ...draft.input_schema } as Record<string, any>,
      tool_name: `fn_${functionSlug(draft.name)}`,
    },
    provider,
  };
}

export async function fixFunction(ctx: Ctx, functionId: string, body: unknown, deps: AssistDeps = {}) {
  const req = fixRequestSchema.parse(body);
  const { function: fn } = await getFunction(ctx, functionId);
  const provider = await pickProvider(ctx, req.provider, deps);
  const language = fn.language as FunctionLanguage;
  const system = [
    'You fix small serverless functions. Keep the same behaviour and contract; change only what is needed.',
    CONTRACT[language],
    'Reply with ONLY a JSON object: {"code": the full corrected source, "explanation": one or two sentences on what was wrong and what you changed}.',
  ].join('\n\n');
  const prompt = [
    `Function: ${fn.name} — ${fn.description || 'no description'}`,
    `Input schema: ${JSON.stringify(fn.input_schema)}`,
    req.input !== undefined ? `Test input: ${JSON.stringify(req.input)}` : '',
    `Error:\n${req.error}`,
    `Code:\n${req.code ?? fn.code}`,
  ].filter(Boolean).join('\n\n');
  const fix = await askForJson(ctx, provider, system, prompt, fixShape, deps);
  if (language === 'typescript') compileTypeScript(fix.code);
  return { fix, provider };
}
