import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import { getTenantSecret } from '@/lib/secrets/secrets-service';
import { executePlatformTool } from '@/lib/mcp/platform-mcp-server';
import { PLATFORM_TOOL_DEFINITIONS, canonicalToolName, getAuthorizedPlatformTools, toolInputJsonSchema } from '@/lib/mcp/tool-catalog';
import { getSession, latestCheckpoint, toTranscript, type AgentSession } from '@/lib/services/agent-sessions';
import { contextProfileInstructions, getContextProfile } from '@/lib/services/context-profiles';
import { getProfile } from '@/lib/services/profiles';
import { ServiceError, isServiceError } from '@/lib/services/errors';
import { emitRunEvent } from './supervisor-graph';
import { generateLLMResponse, type LLMMessage, type LLMToolDefinition } from './providers/llm-adapter';

export const MAX_AGENT_STEPS = 8;
const MAX_TOOL_RESULT_CHARS = 20_000;

export interface ToolExecutionRecord {
  toolName: string;
  toolCallId: string;
  arguments: Record<string, any>;
  output: unknown;
  isError: boolean;
  latencyMs: number;
}

export interface TurnResult {
  session_id: string;
  checkpoint_id: string;
  step_index: number;
  message: string;
  tool_executions: ToolExecutionRecord[];
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; steps: number };
  model: string;
  transcript: ReturnType<typeof toTranscript>;
}

export interface RunnerDeps {
  generate?: typeof generateLLMResponse;
  getSecret?: typeof getTenantSecret;
}

type Ctx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode' | 'apiKeyId' | 'scopes' | 'toolsWhitelist'>;

/** Tools the instance may use, narrowed again by an API key's own grants. */
export function resolveSessionTools(session: Pick<AgentSession, 'allowed_tools'>, ctx: Pick<Ctx, 'authMode' | 'scopes' | 'toolsWhitelist'>) {
  const allowed = new Set(session.allowed_tools.map(canonicalToolName));
  const sessionTools = PLATFORM_TOOL_DEFINITIONS.filter((t) => allowed.has(t.name));
  if (ctx.authMode !== 'api_key') return sessionTools;
  const keyTools = new Set(getAuthorizedPlatformTools(ctx.toolsWhitelist, ctx.scopes).map((t) => t.name));
  return sessionTools.filter((t) => keyTools.has(t.name));
}

async function buildSystemPrompt(ctx: Ctx, session: AgentSession): Promise<string> {
  const sections = [
    `You are "${session.name}", an assistant operating inside a Context Control organization.`,
    'Use the provided tools to read or change organization data instead of guessing. ' +
      'If a request needs a capability you have no tool for, say so plainly. ' +
      'Never invent tool results, ids, or records.',
  ];

  if (session.context_profile_id) {
    try {
      const profile = await getContextProfile(ctx, session.context_profile_id);
      const instructions = contextProfileInstructions(profile);
      if (instructions) sections.push(`## Context profile: ${profile.name}\n${instructions}`);
    } catch (err) {
      if (!isServiceError(err)) throw err; // archived/removed profile: run without it
    }
  }

  if (session.mcp_profile_id) {
    try {
      const { profile } = await getProfile(ctx, { profile_id: session.mcp_profile_id });
      const external: string[] = (profile.settings as any)?.selectedToolNames || [];
      sections.push(
        `## MCP profile: ${profile.name}\n${profile.description || ''}`.trim() +
          (external.length
            ? `\nThis profile lists external tools (${external.join(', ')}) whose accounts are not connected yet; they are unavailable in this session.`
            : '')
      );
    } catch (err) {
      if (!isServiceError(err)) throw err;
    }
  }

  return sections.join('\n\n');
}

/** Surface LLM provider failures (bad key, rate limit, unknown model) as a 502 the UI can show. */
function providerError(provider: string, err: unknown): ServiceError {
  if (err instanceof Anthropic.AuthenticationError) {
    return new ServiceError('The stored Anthropic API key was rejected. Update it in Account & Billing → LLM keys.', 'INVALID', 502);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ServiceError('Anthropic rate limit reached for this organization’s key. Try again shortly.', 'INVALID', 502);
  }
  if (err instanceof Anthropic.APIError) {
    return new ServiceError(`Anthropic API error (${err.status ?? 'network'}): ${err.message}`, 'INVALID', 502);
  }
  const message = err instanceof Error ? err.message : String(err);
  // OpenAI (401) and Gemini (400 API_KEY_INVALID) report a bad key without a typed error.
  if (/API_KEY_INVALID|API key not valid|Incorrect API key|invalid_api_key|\(401\)/i.test(message)) {
    return new ServiceError(
      `The stored ${provider} API key was rejected by the provider. Replace it in Account & Billing → LLM keys.`,
      'INVALID',
      502
    );
  }
  return new ServiceError(`${provider} request failed: ${message.slice(0, 300)}`, 'INVALID', 502);
}

function serializeToolOutput(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_TOOL_RESULT_CHARS ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}… [truncated]` : text;
}

/**
 * Run one user turn for an Agent Studio instance: rehydrate state from the latest
 * checkpoint, loop model ↔ real platform tools on the tenant's own LLM key, and
 * append one checkpoint holding the full resulting state.
 */
export async function runSessionTurn(
  ctx: Ctx,
  sessionId: string,
  message: string,
  deps: RunnerDeps = {}
): Promise<TurnResult> {
  const generate = deps.generate || generateLLMResponse;
  const getSecret = deps.getSecret || getTenantSecret;

  const session = await getSession(ctx, sessionId);
  const apiKey = await getSecret(ctx.tenantId, session.provider);
  if (!apiKey) {
    throw new ServiceError(
      `No ${session.provider} API key is stored for this organization. Add one in Account & Billing → LLM keys.`,
      'CONFLICT'
    );
  }

  const previous = await latestCheckpoint(ctx, session.id);
  const state: LLMMessage[] = [...(previous?.state || []), { role: 'user', content: message }];
  const systemPrompt = await buildSystemPrompt(ctx, session);
  const tools = resolveSessionTools(session, ctx);
  const toolDefs: LLMToolDefinition[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: toolInputJsonSchema(t),
  }));
  const allowedNames = new Set<string>(tools.map((t) => t.name));
  const toolCtx = { tenantId: ctx.tenantId, userId: ctx.userId, authMode: ctx.authMode, apiKeyId: ctx.apiKeyId };

  const runId = `run_${crypto.randomUUID()}`;
  const emit = (event: Parameters<typeof emitRunEvent>[0]) => emitRunEvent(event).catch(() => undefined);
  await emit({
    run_id: runId,
    tenant_id: ctx.tenantId,
    step_name: 'start',
    status: 'running',
    event_type: 'agent_start',
    payload: { sessionId: session.id, provider: session.provider, model: session.model },
  });

  const executions: ToolExecutionRecord[] = [];
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, steps: 0 };
  let finalText = '';
  let servedBy = session.model;

  try {
    for (let step = 1; step <= MAX_AGENT_STEPS; step++) {
      usage.steps = step;
      let result;
      try {
        result = await generate({
          provider: session.provider,
          model: session.model,
          apiKey,
          systemPrompt,
          messages: state,
          tools: toolDefs,
        });
      } catch (err) {
        throw providerError(session.provider, err);
      }
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
      usage.totalTokens += result.usage.totalTokens;
      if (result.model) servedBy = result.model;

      if (result.finishReason === 'refusal') {
        finalText = 'The model declined to answer this request.';
        state.push({ role: 'assistant', content: finalText });
        break;
      }

      state.push({
        role: 'assistant',
        content: result.text,
        ...(result.toolCalls?.length ? { toolCalls: result.toolCalls } : {}),
        ...(result.providerContent ? { providerContent: result.providerContent } : {}),
      });
      if (result.text) finalText = result.text;

      if (!result.toolCalls?.length) break;

      for (const call of result.toolCalls) {
        const started = Date.now();
        let output: unknown;
        let isError = false;
        if (!allowedNames.has(call.name)) {
          output = `Tool '${call.name}' is not enabled for this instance.`;
          isError = true;
        } else {
          try {
            output = await executePlatformTool(call.name, call.arguments, toolCtx);
          } catch (err) {
            isError = true;
            output = err instanceof Error ? err.message : 'Tool execution failed.';
          }
        }
        const latencyMs = Date.now() - started;
        executions.push({ toolName: call.name, toolCallId: call.id, arguments: call.arguments, output, isError, latencyMs });
        state.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: serializeToolOutput(output),
          ...(isError ? { isError: true } : {}),
        });
        await emit({
          run_id: runId,
          tenant_id: ctx.tenantId,
          step_name: `step_${step}_${call.name}`,
          status: isError ? 'failed' : 'completed',
          event_type: 'tool_result',
          payload: { toolName: call.name, latencyMs, isError },
        });
      }

      if (step === MAX_AGENT_STEPS) {
        finalText = `${finalText ? `${finalText}\n\n` : ''}(Stopped after ${MAX_AGENT_STEPS} tool steps.)`;
        state.push({ role: 'assistant', content: finalText });
      }
    }
  } catch (err) {
    await emit({
      run_id: runId,
      tenant_id: ctx.tenantId,
      step_name: 'error',
      status: 'failed',
      event_type: 'agent_error',
      payload: { error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }

  const stepIndex = (previous?.stepIndex || 0) + 1;
  const supabase = getSupabaseAdminClient();
  const { data: checkpoint, error } = await supabase
    .from('checkpoints')
    .insert({
      checkpoint_id: `chk_${crypto.randomUUID()}`,
      thread_id: session.id,
      session_id: session.id,
      tenant_id: ctx.tenantId,
      profile_id: `session:${session.id}`,
      profile_name: session.name,
      step_index: stepIndex,
      parent_id: previous?.id || null,
      user_message: message,
      assistant_message: finalText,
      tools_executed: executions,
      compiled_tools_count: tools.length,
      compiled_tools_names: tools.map((t) => t.name),
      usage,
      state,
      metadata: { provider: session.provider, requested_model: session.model, served_by: servedBy, run_id: runId, caller: ctx.authMode },
    })
    .select('id')
    .single();
  if (error || !checkpoint) throw new Error(`Could not save checkpoint: ${error?.message}`);

  await supabase.from('agent_sessions').update({ last_active_at: new Date().toISOString() }).eq('id', session.id);
  await emit({
    run_id: runId,
    tenant_id: ctx.tenantId,
    step_name: 'finish',
    status: 'completed',
    event_type: 'agent_finish',
    payload: { checkpointId: checkpoint.id, steps: usage.steps, totalTokens: usage.totalTokens },
  });

  return {
    session_id: session.id,
    checkpoint_id: checkpoint.id,
    step_index: stepIndex,
    message: finalText,
    tool_executions: executions,
    usage,
    model: servedBy,
    transcript: toTranscript(state),
  };
}
