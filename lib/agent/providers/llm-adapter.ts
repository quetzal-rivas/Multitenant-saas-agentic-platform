import Anthropic from '@anthropic-ai/sdk';

export type LLMProvider = 'anthropic' | 'openai' | 'gemini';

/**
 * Provider-neutral conversation turn. Assistant turns also keep the provider's raw
 * content so the next request on the same provider can replay it unchanged
 * (Anthropic thinking blocks and Gemini thought signatures must round-trip intact).
 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  isError?: boolean;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
  providerContent?: { provider: LLMProvider; content: unknown };
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
}

export interface LLMGenerateOptions {
  provider: LLMProvider;
  model?: string;
  apiKey: string;
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
  systemPrompt?: string;
  /** Ignored by providers/models that reject sampling parameters (current Claude models). */
  temperature?: number;
  maxTokens?: number;
}

export interface LLMGenerateResult {
  text: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  finishReason: 'stop' | 'tool_calls' | 'length' | 'refusal' | 'error';
  /** Model that actually served the request (differs from the requested one after a fallback). */
  model?: string;
  providerContent?: { provider: LLMProvider; content: unknown };
}

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-5',
  gemini: 'gemini-3.8-flash',
};

/** Group consecutive tool results so each provider gets them in a single turn. */
function groupToolResults(messages: LLMMessage[]): Array<LLMMessage | LLMMessage[]> {
  const out: Array<LLMMessage | LLMMessage[]> = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (m.role === 'tool' && Array.isArray(last)) last.push(m);
    else out.push(m.role === 'tool' ? [m] : m);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Anthropic (official SDK)
// ---------------------------------------------------------------------------

/**
 * After a mid-output refusal fallback, blocks that precede the final `fallback`
 * marker must not be echoed back except text and paired server-tool blocks.
 */
function sanitizeAnthropicReplay(content: Anthropic.Beta.BetaContentBlock[]): Anthropic.Beta.BetaContentBlockParam[] {
  const lastFallback = content.map((b) => b.type).lastIndexOf('fallback');
  if (lastFallback === -1) return content as unknown as Anthropic.Beta.BetaContentBlockParam[];
  return content.filter(
    (b, i) => i > lastFallback || b.type === 'text'
  ) as unknown as Anthropic.Beta.BetaContentBlockParam[];
}

function toAnthropicMessages(messages: LLMMessage[]): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const entry of groupToolResults(messages.filter((m) => m.role !== 'system'))) {
    if (Array.isArray(entry)) {
      out.push({
        role: 'user',
        content: entry.map((t) => ({
          type: 'tool_result' as const,
          tool_use_id: t.toolCallId || '',
          content: t.content,
          ...(t.isError ? { is_error: true } : {}),
        })),
      });
    } else if (entry.role === 'assistant') {
      if (entry.providerContent?.provider === 'anthropic') {
        out.push({
          role: 'assistant',
          content: sanitizeAnthropicReplay(entry.providerContent.content as Anthropic.Beta.BetaContentBlock[]),
        });
      } else {
        const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
        if (entry.content) blocks.push({ type: 'text', text: entry.content });
        for (const tc of entry.toolCalls || []) {
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments });
        }
        out.push({ role: 'assistant', content: blocks.length ? blocks : entry.content || '' });
      }
    } else {
      out.push({ role: 'user', content: entry.content });
    }
  }
  return out;
}

async function generateAnthropic(options: LLMGenerateOptions): Promise<LLMGenerateResult> {
  const client = new Anthropic({ apiKey: options.apiKey });
  const model = options.model || DEFAULT_MODELS.anthropic;

  const response = await client.beta.messages.create({
    model,
    max_tokens: options.maxTokens || 16000,
    ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
    messages: toAnthropicMessages(options.messages),
    ...(options.tools?.length
      ? {
          tools: options.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema,
          })),
        }
      : {}),
    // Agent turns are short tool-driven exchanges; keep effort explicit.
    output_config: { effort: 'medium' },
    // On a safety decline, the API re-runs the request on an appropriate fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  });

  if (response.stop_reason === 'refusal') {
    return {
      text: '',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      finishReason: 'refusal',
      model: response.model,
    };
  }

  let text = '';
  const toolCalls: NonNullable<LLMGenerateResult['toolCalls']> = [];
  for (const block of response.content) {
    if (block.type === 'text') text += block.text;
    else if (block.type === 'tool_use') {
      toolCalls.push({ id: block.id, name: block.name, arguments: (block.input as Record<string, any>) || {} });
    }
  }

  return {
    text,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    },
    finishReason:
      response.stop_reason === 'tool_use' ? 'tool_calls' : response.stop_reason === 'max_tokens' ? 'length' : 'stop',
    model: response.model,
    providerContent: { provider: 'anthropic', content: response.content },
  };
}

// ---------------------------------------------------------------------------
// OpenAI (Chat Completions over fetch)
// ---------------------------------------------------------------------------

async function generateOpenAI(options: LLMGenerateOptions): Promise<LLMGenerateResult> {
  const model = options.model || DEFAULT_MODELS.openai;
  const messages: any[] = [];
  if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });

  for (const m of options.messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      messages.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
    } else if (m.role === 'assistant') {
      messages.push({
        role: 'assistant',
        content: m.content || null,
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
              })),
            }
          : {}),
      });
    } else {
      messages.push({ role: 'user', content: m.content });
    }
  }

  const payload: any = {
    model,
    messages,
    max_completion_tokens: options.maxTokens || 16000,
  };
  if (options.temperature !== undefined) payload.temperature = options.temperature;
  if (options.tools?.length) {
    payload.tools = options.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`OpenAI API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const message = choice?.message;
  const toolCalls: NonNullable<LLMGenerateResult['toolCalls']> = (message?.tool_calls || []).map((tc: any) => {
    let args: Record<string, any> = {};
    try {
      args = JSON.parse(tc.function?.arguments || '{}');
    } catch {
      args = {};
    }
    return { id: tc.id, name: tc.function?.name, arguments: args };
  });

  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;
  return {
    text: message?.content || '',
    toolCalls: toolCalls.length ? toolCalls : undefined,
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    finishReason: toolCalls.length ? 'tool_calls' : choice?.finish_reason === 'length' ? 'length' : 'stop',
    model: data.model,
  };
}

// ---------------------------------------------------------------------------
// Gemini (generateContent over fetch)
// ---------------------------------------------------------------------------

async function generateGemini(options: LLMGenerateOptions): Promise<LLMGenerateResult> {
  const model = options.model || DEFAULT_MODELS.gemini;
  const contents: any[] = [];

  for (const entry of groupToolResults(options.messages.filter((m) => m.role !== 'system'))) {
    if (Array.isArray(entry)) {
      contents.push({
        role: 'user',
        parts: entry.map((t) => ({
          functionResponse: {
            name: t.name,
            ...(t.toolCallId?.startsWith('gemini_') ? {} : { id: t.toolCallId }),
            response: t.isError ? { error: t.content } : { result: t.content },
          },
        })),
      });
    } else if (entry.role === 'assistant') {
      if (entry.providerContent?.provider === 'gemini') {
        contents.push({ role: 'model', parts: entry.providerContent.content });
      } else {
        const parts: any[] = [];
        if (entry.content) parts.push({ text: entry.content });
        for (const tc of entry.toolCalls || []) parts.push({ functionCall: { name: tc.name, args: tc.arguments } });
        contents.push({ role: 'model', parts: parts.length ? parts : [{ text: '' }] });
      }
    } else {
      contents.push({ role: 'user', parts: [{ text: entry.content }] });
    }
  }

  const payload: any = {
    contents,
    generationConfig: {
      maxOutputTokens: options.maxTokens || 16000,
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    },
  };
  if (options.systemPrompt) payload.systemInstruction = { parts: [{ text: options.systemPrompt }] };
  if (options.tools?.length) {
    payload.tools = [
      {
        functionDeclarations: options.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parametersJsonSchema: t.parameters,
        })),
      },
    ];
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': options.apiKey },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Gemini API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const parts: any[] = candidate?.content?.parts || [];
  let text = '';
  const toolCalls: NonNullable<LLMGenerateResult['toolCalls']> = [];
  parts.forEach((part, i) => {
    if (typeof part.text === 'string' && !part.thought) text += part.text;
    if (part.functionCall) {
      toolCalls.push({
        id: part.functionCall.id || `gemini_${i}_${part.functionCall.name}`,
        name: part.functionCall.name,
        arguments: part.functionCall.args || {},
      });
    }
  });

  const inputTokens = data.usageMetadata?.promptTokenCount || 0;
  const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
  return {
    text,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    finishReason: toolCalls.length
      ? 'tool_calls'
      : candidate?.finishReason === 'MAX_TOKENS'
      ? 'length'
      : candidate?.finishReason === 'SAFETY'
      ? 'refusal'
      : 'stop',
    model,
    providerContent: { provider: 'gemini', content: parts },
  };
}

/**
 * Run one model turn across Anthropic, OpenAI, or Gemini using tenant BYOK credentials.
 * The caller owns the tool loop: append the returned assistant turn (with
 * providerContent) and the tool results, then call again.
 */
export async function generateLLMResponse(options: LLMGenerateOptions): Promise<LLMGenerateResult> {
  if (!options.apiKey) {
    throw new Error(`Missing BYOK API key for provider ${options.provider}`);
  }
  switch (options.provider) {
    case 'anthropic':
      return generateAnthropic(options);
    case 'openai':
      return generateOpenAI(options);
    case 'gemini':
      return generateGemini(options);
    default:
      throw new Error(`Unsupported LLM provider: ${options.provider}`);
  }
}
