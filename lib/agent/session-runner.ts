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
import { getTeam, type AgentTeam, type TeamWorker } from '@/lib/services/teams';
import { ServiceError, isServiceError } from '@/lib/services/errors';
import { emitRunEvent } from './supervisor-graph';
import { generateLLMResponse, type LLMMessage, type LLMToolDefinition } from './providers/llm-adapter';

export const MAX_AGENT_STEPS = 8;
/** Steps a worker may take per delegated task (workers cannot delegate further). */
export const MAX_WORKER_STEPS = 6;
const MAX_TOOL_RESULT_CHARS = 20_000;

export interface ToolExecutionRecord {
  toolName: string;
  toolCallId: string;
  arguments: Record<string, any>;
  output: unknown;
  isError: boolean;
  latencyMs: number;
  /** Set when a team worker (not the supervisor) made the call. */
  worker?: string;
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

async function contextProfileSection(ctx: Ctx, id: string | null): Promise<string | null> {
  if (!id) return null;
  try {
    const profile = await getContextProfile(ctx, id);
    const instructions = contextProfileInstructions(profile);
    return instructions ? `## Context profile: ${profile.name}\n${instructions}` : null;
  } catch (err) {
    if (!isServiceError(err)) throw err; // archived/removed profile: run without it
    return null;
  }
}

async function mcpProfileSection(ctx: Ctx, id: string | null): Promise<string | null> {
  if (!id) return null;
  try {
    const { profile } = await getProfile(ctx, { profile_id: id });
    const external: string[] = (profile.settings as any)?.selectedToolNames || [];
    return (
      `## MCP profile: ${profile.name}\n${profile.description || ''}`.trim() +
      (external.length
        ? `\nThis profile lists external tools (${external.join(', ')}) whose accounts are not connected yet; they are unavailable in this session.`
        : '')
    );
  } catch (err) {
    if (!isServiceError(err)) throw err;
    return null;
  }
}

const GROUNDING =
  'Use the provided tools to read or change organization data instead of guessing. ' +
  'If a request needs a capability you have no tool for, say so plainly. Never invent tool results, ids, or records.';

async function buildSystemPrompt(ctx: Ctx, session: AgentSession): Promise<string> {
  const sections = [
    `You are "${session.name}", an assistant operating inside a Context Control organization.`,
    GROUNDING,
    await contextProfileSection(ctx, session.context_profile_id),
    await mcpProfileSection(ctx, session.mcp_profile_id),
  ];
  return sections.filter(Boolean).join('\n\n');
}

async function buildSupervisorPrompt(ctx: Ctx, team: AgentTeam): Promise<string> {
  const roster = team.workers.length
    ? '## Your team\n' +
      team.workers.map((w) => `- ${w.name} (tool \`${delegateToolName(w)}\`): ${w.role}`).join('\n') +
      '\nDelegate a task to the worker best suited for it by calling their tool with a complete, self-contained task. ' +
      'Workers cannot see this conversation, so include every detail they need. You can call several workers, ' +
      'use your own tools, and then combine the results into one answer.'
    : null;
  const sections = [
    `You are the supervisor of the "${team.name}" team in a Context Control organization.` +
      (team.description ? `\nTeam purpose: ${team.description}` : ''),
    GROUNDING,
    team.supervisor_instructions ? `## Supervisor instructions\n${team.supervisor_instructions}` : null,
    roster,
    await contextProfileSection(ctx, team.supervisor_context_profile_id),
    await mcpProfileSection(ctx, team.supervisor_mcp_profile_id),
  ];
  return sections.filter(Boolean).join('\n\n');
}

async function buildWorkerPrompt(ctx: Ctx, team: AgentTeam, worker: TeamWorker): Promise<string> {
  const sections = [
    `You are ${worker.name}, a worker on the "${team.name}" team. Your role: ${worker.role}.`,
    'Your supervisor sends you one task at a time. Complete it and reply with a concise, factual result for the supervisor.',
    GROUNDING,
    worker.instructions ? `## Instructions\n${worker.instructions}` : null,
    await contextProfileSection(ctx, worker.context_profile_id),
    await mcpProfileSection(ctx, worker.mcp_profile_id),
  ];
  return sections.filter(Boolean).join('\n\n');
}

export function delegateToolName(worker: Pick<TeamWorker, 'slug'>): string {
  return `delegate_to_${worker.slug}`;
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

interface LoopTool {
  def: LLMToolDefinition;
  run: (args: Record<string, any>) => Promise<unknown>;
}

/**
 * Model <-> tools loop shared by single agents, supervisors and workers. Appends
 * every assistant/tool message to `messages` and returns the final text.
 */
async function runToolLoop(opts: {
  generate: typeof generateLLMResponse;
  provider: AgentSession['provider'];
  model: string;
  apiKey: string;
  systemPrompt: string;
  messages: LLMMessage[];
  tools: Map<string, LoopTool>;
  maxSteps: number;
  worker?: string;
  usage: TurnResult['usage'];
  onModel: (servedBy: string) => void;
  onTool: (record: ToolExecutionRecord) => Promise<void>;
}): Promise<string> {
  const defs = [...opts.tools.values()].map((t) => t.def);
  let finalText = '';
  for (let step = 1; step <= opts.maxSteps; step++) {
    opts.usage.steps += 1;
    let result;
    try {
      result = await opts.generate({
        provider: opts.provider,
        model: opts.model,
        apiKey: opts.apiKey,
        systemPrompt: opts.systemPrompt,
        messages: opts.messages,
        tools: defs,
      });
    } catch (err) {
      throw providerError(opts.provider, err);
    }
    opts.usage.inputTokens += result.usage.inputTokens;
    opts.usage.outputTokens += result.usage.outputTokens;
    opts.usage.totalTokens += result.usage.totalTokens;
    if (result.model) opts.onModel(result.model);

    if (result.finishReason === 'refusal') {
      finalText = 'The model declined to answer this request.';
      opts.messages.push({ role: 'assistant', content: finalText });
      return finalText;
    }

    opts.messages.push({
      role: 'assistant',
      content: result.text,
      ...(result.toolCalls?.length ? { toolCalls: result.toolCalls } : {}),
      ...(result.providerContent ? { providerContent: result.providerContent } : {}),
    });
    if (result.text) finalText = result.text;
    if (!result.toolCalls?.length) return finalText;

    for (const call of result.toolCalls) {
      const started = Date.now();
      let output: unknown;
      let isError = false;
      const tool = opts.tools.get(call.name);
      if (!tool) {
        output = `Tool '${call.name}' is not enabled here.`;
        isError = true;
      } else {
        try {
          output = await tool.run(call.arguments);
        } catch (err) {
          isError = true;
          output = isServiceError(err) || err instanceof Error ? (err as Error).message : 'Tool execution failed.';
        }
      }
      await opts.onTool({
        toolName: call.name,
        toolCallId: call.id,
        arguments: call.arguments,
        output,
        isError,
        latencyMs: Date.now() - started,
        ...(opts.worker ? { worker: opts.worker } : {}),
      });
      opts.messages.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: serializeToolOutput(output),
        ...(isError ? { isError: true } : {}),
      });
    }
  }
  finalText = `${finalText ? `${finalText}\n\n` : ''}(Stopped after ${opts.maxSteps} tool steps.)`;
  opts.messages.push({ role: 'assistant', content: finalText });
  return finalText;
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
  const team = session.team_id ? await getTeam(ctx, session.team_id) : null;
  const provider = team?.provider ?? session.provider;
  const model = team?.model ?? session.model;

  const apiKey = await getSecret(ctx.tenantId, provider);
  if (!apiKey) {
    throw new ServiceError(
      `No ${provider} API key is stored for this organization. Add one in Account & Billing → LLM keys.`,
      'CONFLICT'
    );
  }

  const previous = await latestCheckpoint(ctx, session.id);
  const state: LLMMessage[] = [...(previous?.state || []), { role: 'user', content: message }];
  const toolCtx = { tenantId: ctx.tenantId, userId: ctx.userId, authMode: ctx.authMode, apiKeyId: ctx.apiKeyId };

  const runId = `run_${crypto.randomUUID()}`;
  const emit = (event: Parameters<typeof emitRunEvent>[0]) => emitRunEvent(event).catch(() => undefined);
  await emit({
    run_id: runId,
    tenant_id: ctx.tenantId,
    step_name: 'start',
    status: 'running',
    event_type: 'agent_start',
    payload: { sessionId: session.id, provider, model, teamId: team?.id ?? null },
  });

  const executions: ToolExecutionRecord[] = [];
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, steps: 0 };
  const workersUsed = new Set<string>();
  let servedBy = model;

  const platformTools = (names: string[]): Map<string, LoopTool> =>
    new Map(
      resolveSessionTools({ allowed_tools: names }, ctx).map((t) => [
        t.name,
        {
          def: { name: t.name, description: t.description, parameters: toolInputJsonSchema(t) },
          run: (args: Record<string, any>) => executePlatformTool(t.name, args, toolCtx),
        },
      ])
    );

  const loop = (opts: { systemPrompt: string; messages: LLMMessage[]; tools: Map<string, LoopTool>; model: string; maxSteps: number; worker?: string }) =>
    runToolLoop({
      ...opts,
      generate,
      provider,
      apiKey,
      usage,
      onModel: (served) => {
        if (!opts.worker) servedBy = served;
      },
      onTool: async (record) => {
        executions.push(record);
        await emit({
          run_id: runId,
          tenant_id: ctx.tenantId,
          step_name: `${record.worker ? `${record.worker}:` : ''}${record.toolName}`,
          status: record.isError ? 'failed' : 'completed',
          event_type: 'tool_result',
          payload: { toolName: record.toolName, worker: record.worker ?? null, latencyMs: record.latencyMs, isError: record.isError },
        });
      },
    });

  let systemPrompt: string;
  let tools: Map<string, LoopTool>;
  if (team) {
    systemPrompt = await buildSupervisorPrompt(ctx, team);
    tools = platformTools(team.supervisor_tools);
    for (const worker of team.workers) {
      const name = delegateToolName(worker);
      tools.set(name, {
        def: {
          name,
          description: `Delegate a task to ${worker.name}: ${worker.role}. Returns the worker's answer.`,
          parameters: {
            type: 'object',
            properties: {
              task: { type: 'string', description: 'Complete, self-contained instructions for the worker.' },
              context: { type: 'string', description: 'Facts from the conversation the worker needs.' },
            },
            required: ['task'],
            additionalProperties: false,
          },
        },
        run: async (args: Record<string, any>) => {
          if (typeof args.task !== 'string' || !args.task.trim()) throw new ServiceError('task is required', 'INVALID');
          workersUsed.add(worker.name);
          const brief = args.context ? `${args.task}\n\nContext from the supervisor:\n${args.context}` : args.task;
          const answer = await loop({
            systemPrompt: await buildWorkerPrompt(ctx, team, worker),
            messages: [{ role: 'user', content: brief }],
            tools: platformTools(worker.tools),
            model: worker.model || team.model,
            maxSteps: MAX_WORKER_STEPS,
            worker: worker.name,
          });
          return { worker: worker.name, answer: answer || '(the worker returned no answer)' };
        },
      });
    }
  } else {
    systemPrompt = await buildSystemPrompt(ctx, session);
    tools = platformTools(session.allowed_tools);
  }

  let finalText: string;
  try {
    finalText = await loop({ systemPrompt, messages: state, tools, model, maxSteps: MAX_AGENT_STEPS });
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
      compiled_tools_count: tools.size,
      compiled_tools_names: [...tools.keys()],
      usage,
      state,
      metadata: {
        provider,
        requested_model: model,
        served_by: servedBy,
        run_id: runId,
        caller: ctx.authMode,
        ...(team ? { team_id: team.id, workers_used: [...workersUsed] } : {}),
      },
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
