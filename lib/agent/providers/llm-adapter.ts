export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
}

export interface LLMGenerateOptions {
  provider: 'anthropic' | 'openai' | 'gemini';
  model?: string;
  apiKey: string;
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
  systemPrompt?: string;
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
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}

/**
 * Execute LLM generation across Anthropic, OpenAI, or Gemini using tenant BYOK credentials.
 */
export async function generateLLMResponse(options: LLMGenerateOptions): Promise<LLMGenerateResult> {
  const { provider, apiKey, messages, tools = [], systemPrompt, temperature = 0.7, maxTokens = 2048 } = options;

  if (!apiKey) {
    throw new Error(`Missing BYOK API key for provider ${provider}`);
  }

  switch (provider) {
    case 'anthropic': {
      const model = options.model || 'claude-3-5-sonnet-20241022';
      const formattedMessages = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'tool' ? 'user' : m.role,
          content: m.content,
        }));

      const anthropicTools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));

      const payload: any = {
        model,
        messages: formattedMessages,
        max_tokens: maxTokens,
        temperature,
      };

      if (systemPrompt) {
        payload.system = systemPrompt;
      }
      if (anthropicTools.length > 0) {
        payload.tools = anthropicTools;
      }

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Anthropic API error (${res.status}): ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      let text = '';
      const toolCalls: LLMGenerateResult['toolCalls'] = [];

      for (const block of data.content || []) {
        if (block.type === 'text') {
          text += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input || {},
          });
        }
      }

      const inputTokens = data.usage?.input_tokens || 0;
      const outputTokens = data.usage?.output_tokens || 0;

      return {
        text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      };
    }

    case 'openai': {
      const model = options.model || 'gpt-4o';
      const formattedMessages: any[] = [];

      if (systemPrompt) {
        formattedMessages.push({ role: 'system', content: systemPrompt });
      }

      for (const m of messages) {
        formattedMessages.push({
          role: m.role,
          content: m.content,
        });
      }

      const openaiTools = tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));

      const payload: any = {
        model,
        messages: formattedMessages,
        temperature,
        max_tokens: maxTokens,
      };

      if (openaiTools.length > 0) {
        payload.tools = openaiTools;
      }

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI API error (${res.status}): ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const choice = data.choices?.[0];
      const message = choice?.message;

      const toolCalls: LLMGenerateResult['toolCalls'] = [];
      if (message?.tool_calls) {
        for (const tc of message.tool_calls) {
          try {
            toolCalls.push({
              id: tc.id,
              name: tc.function.name,
              arguments: JSON.parse(tc.function.arguments || '{}'),
            });
          } catch {
            toolCalls.push({
              id: tc.id,
              name: tc.function.name,
              arguments: {},
            });
          }
        }
      }

      const inputTokens = data.usage?.prompt_tokens || 0;
      const outputTokens = data.usage?.completion_tokens || 0;

      return {
        text: message?.content || '',
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      };
    }

    case 'gemini': {
      const model = options.model || 'gemini-1.5-pro';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const contents: any[] = [];
      for (const m of messages) {
        const role = m.role === 'assistant' ? 'model' : 'user';
        contents.push({
          role,
          parts: [{ text: m.content }],
        });
      }

      const payload: any = {
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      };

      if (systemPrompt) {
        payload.systemInstruction = {
          parts: [{ text: systemPrompt }],
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text || '';

      const inputTokens = data.usageMetadata?.promptTokenCount || 0;
      const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;

      return {
        text,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        finishReason: 'stop',
      };
    }

    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}
