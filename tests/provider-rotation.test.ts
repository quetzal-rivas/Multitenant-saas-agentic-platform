import assert from 'assert';
import { test, describe, before, after } from 'node:test';
import { fakePostgrest, resetTables, tables } from './helpers/fake-postgrest';
import { runSessionTurn } from '../lib/agent/session-runner';
import { createSession } from '../lib/services/agent-sessions';
import { generateLLMResponse, isRotatableError, type LLMGenerateOptions, type LLMGenerateResult } from '../lib/agent/providers/llm-adapter';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ctx = { tenantId: TENANT, userId: 'user-a', authMode: 'session' as const, scopes: ['*'] };
const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };

describe('xAI Grok over the Responses API', () => {
  const realFetch = globalThis.fetch;
  after(() => {
    globalThis.fetch = realFetch;
  });

  test('sends instructions, flat function tools and tool history; reads text and function calls', async () => {
    let sent: any = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), 'https://api.x.ai/v1/responses');
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer xai-key');
      sent = JSON.parse(String(init?.body));
      return Response.json({
        model: 'grok-4.7',
        output: [
          { type: 'message', content: [{ type: 'output_text', text: 'Checking the board.' }] },
          { type: 'function_call', call_id: 'call_2', name: 'board_list', arguments: '{"status":"open"}' },
        ],
        usage: { input_tokens: 40, output_tokens: 12 },
      });
    }) as typeof fetch;

    const res = await generateLLMResponse({
      provider: 'xai',
      apiKey: 'xai-key',
      systemPrompt: 'You are helpful.',
      tools: [{ name: 'board_list', description: 'List tasks', parameters: { type: 'object', properties: { status: { type: 'string' } } } }],
      messages: [
        { role: 'user', content: 'What is open?' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'board_list', arguments: {} }] },
        { role: 'tool', toolCallId: 'call_1', name: 'board_list', content: '{"tasks":[]}' },
      ],
    });

    assert.equal(sent.model, 'grok-4.7');
    assert.equal(sent.instructions, 'You are helpful.');
    assert.deepEqual(sent.tools[0], { type: 'function', name: 'board_list', description: 'List tasks', parameters: { type: 'object', properties: { status: { type: 'string' } } } });
    assert.deepEqual(sent.input, [
      { role: 'user', content: 'What is open?' },
      { type: 'function_call', call_id: 'call_1', name: 'board_list', arguments: '{}' },
      { type: 'function_call_output', call_id: 'call_1', output: '{"tasks":[]}' },
    ]);
    assert.equal(res.text, 'Checking the board.');
    assert.deepEqual(res.toolCalls, [{ id: 'call_2', name: 'board_list', arguments: { status: 'open' } }]);
    assert.deepEqual(res.usage, { inputTokens: 40, outputTokens: 12, totalTokens: 52 });
    assert.equal(res.finishReason, 'tool_calls');
  });

  test('which errors rotate to another provider', () => {
    assert.equal(isRotatableError(new Error('gemini request failed: All Gemini models are busy or over quota')), true);
    assert.equal(isRotatableError(new Error('Rate limited by the provider (OpenAI 429): slow down')), true);
    assert.equal(isRotatableError(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), true);
    assert.equal(isRotatableError(new Error('Gemini API error (400) from gemini-3.8-flash: API key not valid')), false, 'a bad key is a configuration problem');
    assert.equal(isRotatableError(new Error('Unknown tool')), false);
  });
});

describe('Provider rotation in agent turns', () => {
  const realFetch = globalThis.fetch;
  let sessionId: string;

  before(async () => {
    globalThis.fetch = fakePostgrest as typeof fetch;
    resetTables(['agent_sessions', 'checkpoints', 'encrypted_secrets', 'run_events', 'mcp_profiles', 'context_profiles']);
    // The organization has a free-tier Gemini key and an xAI key (like the real account).
    tables.encrypted_secrets.push(
      { tenant_id: TENANT, provider: 'gemini', updated_at: '2026-01-01', encrypted_payload: {} },
      { tenant_id: TENANT, provider: 'xai', updated_at: '2026-01-01', encrypted_payload: {} }
    );
    sessionId = (await createSession(ctx, { name: 'Gemini instance', provider: 'gemini', allowed_tools: [] })).id;
  });
  after(() => {
    globalThis.fetch = realFetch;
  });

  const keys = async (_t: string, p: string) => (p === 'gemini' ? 'g-key' : p === 'xai' ? 'x-key' : null);

  test('Gemini out of quota: the same answer comes from Grok', async () => {
    const calls: LLMGenerateOptions[] = [];
    const generate = async (o: LLMGenerateOptions): Promise<LLMGenerateResult> => {
      calls.push(o);
      if (o.provider === 'gemini') throw new Error('gemini request failed: All Gemini models are busy or over quota (tried gemini-3.8-flash)');
      return { text: 'Potro o potrilla.', usage, finishReason: 'stop', model: o.model } as LLMGenerateResult;
    };
    const res = await runSessionTurn(ctx, sessionId, '¿Cómo se llama la cría del caballo?', { generate, getSecret: keys as any });
    assert.equal(res.message, 'Potro o potrilla.');
    assert.deepEqual(calls.map((c) => c.provider), ['gemini', 'xai']);
    assert.equal(calls[1].apiKey, 'x-key');
    assert.equal(calls[1].model, 'grok-4.7');
    assert.equal(res.model, 'grok-4.7', 'the turn reports the model that answered');
  });

  test('a bad key does not rotate (the error is shown)', async () => {
    const calls: string[] = [];
    const generate = async (o: LLMGenerateOptions): Promise<LLMGenerateResult> => {
      calls.push(o.provider);
      throw new Error('Gemini API error (400) from gemini-3.8-flash: API key not valid');
    };
    await assert.rejects(runSessionTurn(ctx, sessionId, 'hola', { generate, getSecret: keys as any }), /key/i);
    assert.deepEqual(calls, ['gemini']);
  });
});
