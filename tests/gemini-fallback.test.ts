import assert from 'assert';
import { test, describe, afterEach } from 'node:test';
import {
  GEMINI_FALLBACK_MODELS,
  buildGeminiContents,
  geminiModelChain,
  generateLLMResponse,
} from '../lib/agent/providers/llm-adapter';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Fake Gemini endpoint: `script` maps a model to the HTTP status it returns. */
function fakeGemini(script: Record<string, number>) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const model = decodeURIComponent(String(input).match(/models\/([^:]+):/)![1]);
    calls.push(model);
    const status = script[model] ?? 200;
    if (status !== 200) return new Response(JSON.stringify({ error: { code: status } }), { status });
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: `hi from ${model}` }] } }], modelVersion: model, usageMetadata: {} }),
      { status: 200 }
    );
  }) as typeof fetch;
  return calls;
}

const ask = (model?: string) =>
  generateLLMResponse({ provider: 'gemini', model, apiKey: 'k', messages: [{ role: 'user', content: 'hi' }] });

describe('Gemini fallback chain', () => {
  test('chain starts with the requested model, then the fallbacks, cheapest last, no duplicates', () => {
    assert.deepEqual(geminiModelChain('gemini-3.8-flash'), GEMINI_FALLBACK_MODELS);
    const custom = geminiModelChain('gemini-3.6-flash');
    assert.equal(custom[0], 'gemini-3.6-flash');
    assert.equal(new Set(custom).size, custom.length);
    assert.equal(custom.at(-1), 'gemini-3.1-flash-lite');
    assert.ok(GEMINI_FALLBACK_MODELS.length - 1 >= 3, 'at least three fallbacks');
  });

  test('overload (503) and quota (429) move on to the next model', async () => {
    const calls = fakeGemini({ 'gemini-3.8-flash': 503, 'gemini-3.7-flash': 429 });
    const result = await ask();
    assert.deepEqual(calls, ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash']);
    assert.equal(result.model, 'gemini-3.6-flash');
    assert.equal(result.text, 'hi from gemini-3.6-flash');
    assert.equal((result.providerContent as any).model, 'gemini-3.6-flash');
  });

  test('a bad key or bad request (400) fails immediately without trying other models', async () => {
    const calls = fakeGemini({ 'gemini-3.8-flash': 400 });
    await assert.rejects(ask(), /Gemini API error \(400\)/);
    assert.deepEqual(calls, ['gemini-3.8-flash']);
  });

  test('when every model is busy the error lists what was tried', async () => {
    const all = Object.fromEntries(GEMINI_FALLBACK_MODELS.map((m) => [m, 503]));
    const calls = fakeGemini(all);
    await assert.rejects(ask(), /All Gemini models are busy or over quota/);
    assert.deepEqual(calls, GEMINI_FALLBACK_MODELS);
  });

  test('thought signatures are kept for the same model and swapped for a different one', () => {
    const messages = [
      { role: 'user' as const, content: 'q' },
      {
        role: 'assistant' as const,
        content: '',
        providerContent: {
          provider: 'gemini' as const,
          model: 'gemini-3.8-flash',
          content: [{ functionCall: { name: 't', args: {} }, thoughtSignature: 'REAL_SIG' }],
        },
      },
    ];
    const same = buildGeminiContents(messages, 'gemini-3.8-flash');
    assert.equal(same[1].parts[0].thoughtSignature, 'REAL_SIG');
    const other = buildGeminiContents(messages, 'gemini-3.5-flash');
    assert.equal(other[1].parts[0].thoughtSignature, 'skip_thought_signature_validator');
    assert.equal(messages[1].providerContent!.content[0].thoughtSignature, 'REAL_SIG', 'stored state is not mutated');
  });
});
