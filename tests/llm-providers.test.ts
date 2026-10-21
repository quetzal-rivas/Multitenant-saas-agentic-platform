import assert from 'assert';
import { test, describe, before, after, beforeEach } from 'node:test';
import { fakePostgrest, resetTables, tables } from './helpers/fake-postgrest';
import {
  agentsLockedTo,
  createCustomProvider,
  deleteCustomProvider,
  listOrgProviders,
  providerChain,
  setLlmSettings,
} from '../lib/services/llm-providers';
import { createSession } from '../lib/services/agent-sessions';
import { createTeam } from '../lib/services/teams';
import { runSessionTurn } from '../lib/agent/session-runner';
import { generateLLMResponse, type LLMGenerateOptions, type LLMGenerateResult } from '../lib/agent/providers/llm-adapter';
import { customProviderDef } from '../lib/agent/providers/registry';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ctx = { tenantId: TENANT, userId: 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', authMode: 'session' as const, scopes: ['*'] };
const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };

/** Keys this organization has: Gemini, Grok and its own DeepSeek (no Claude, no OpenAI). */
const KEYS: Record<string, string> = { gemini: 'g-key', xai: 'x-key', 'llm:deepseek': 'd-key' };
const getSecret = async (_t: string, name: string) => KEYS[name] ?? null;

const deepseekRow = { slug: 'deepseek', label: 'DeepSeek', base_url: 'https://api.deepseek.com', default_model: 'deepseek-flash', fast_model: null, supports_tools: true };

describe('LLM providers: registry, organization order, modes', () => {
  const realFetch = globalThis.fetch;
  before(() => {
    globalThis.fetch = fakePostgrest as typeof fetch;
  });
  after(() => {
    globalThis.fetch = realFetch;
  });
  beforeEach(() => {
    resetTables(['organizations', 'encrypted_secrets', 'llm_providers', 'agent_sessions', 'agent_teams', 'team_workers', 'checkpoints', 'run_events', 'mcp_profiles', 'context_profiles']);
    tables.organizations.push({ id: TENANT, name: 'Acme', llm_settings: {} });
    for (const name of Object.keys(KEYS)) tables.encrypted_secrets.push({ tenant_id: TENANT, provider: name, updated_at: '2026-10-21', encrypted_payload: {} });
    tables.llm_providers.push({ id: 'p-deepseek', tenant_id: TENANT, ...deepseekRow, created_at: '2026-10-21', archived_at: null });
  });

  test('the organization sees built-in and its own providers, in its order, with key status', async () => {
    const list = await listOrgProviders(TENANT);
    assert.deepEqual(list.map((p) => p.id), ['gemini', 'anthropic', 'openai', 'xai', 'deepseek']);
    assert.deepEqual(list.filter((p) => p.configured).map((p) => p.id), ['gemini', 'xai', 'deepseek']);
    await setLlmSettings(ctx, { order: ['deepseek', 'xai', 'gemini'], disabled: ['gemini'] });
    const after = await listOrgProviders(TENANT);
    assert.deepEqual(after.slice(0, 3).map((p) => p.id), ['deepseek', 'xai', 'gemini']);
    assert.equal(after.find((p) => p.id === 'gemini')!.enabled, false);
    await assert.rejects(setLlmSettings(ctx, { order: ['nope'], disabled: [] }), /Unknown provider/);
  });

  test('auto follows the order and skips providers that are off or have no key', async () => {
    let chain = await providerChain(TENANT, { provider: null, model: null, mode: 'auto' }, { getSecret });
    assert.deepEqual(chain.map((c) => c.def.id), ['gemini', 'xai', 'deepseek']);
    await setLlmSettings(ctx, { order: ['deepseek', 'xai', 'gemini'], disabled: ['gemini'] });
    chain = await providerChain(TENANT, { provider: null, model: null, mode: 'auto' }, { getSecret, fast: true });
    assert.deepEqual(chain.map((c) => `${c.def.id}:${c.model}`), ['deepseek:deepseek-flash', 'xai:grok-4.20-0309-non-reasoning']);
  });

  test('preferred puts its provider and model first, then the order', async () => {
    const chain = await providerChain(TENANT, { provider: 'xai', model: 'grok-custom', mode: 'preferred' }, { getSecret });
    assert.deepEqual(chain.map((c) => `${c.def.id}:${c.model}`), ['xai:grok-custom', 'gemini:gemini-3.8-flash', 'deepseek:deepseek-flash']);
  });

  test('locked is only its provider and model, and fails clearly when it cannot run', async () => {
    const chain = await providerChain(TENANT, { provider: 'deepseek', model: 'deepseek-v4-pro', mode: 'locked' }, { getSecret });
    assert.deepEqual(chain.map((c) => `${c.def.id}:${c.model}`), ['deepseek:deepseek-v4-pro']);
    assert.equal(chain[0].def.baseUrl, 'https://api.deepseek.com');
    await assert.rejects(providerChain(TENANT, { provider: 'anthropic', model: null, mode: 'locked' }, { getSecret }), /locked to Anthropic \(Claude\), but no Anthropic \(Claude\) key/);
    await setLlmSettings(ctx, { order: [], disabled: ['deepseek'] });
    await assert.rejects(providerChain(TENANT, { provider: 'deepseek', model: null, mode: 'locked' }, { getSecret }), /locked to DeepSeek, which is turned off/);
  });

  test('an OpenAI-compatible provider is called at its URL with its parameters', async () => {
    let url = '';
    let body: any = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      url = String(input);
      body = JSON.parse(String(init?.body));
      return Response.json({ model: 'deepseek-flash', choices: [{ message: { content: 'hola' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1 } });
    }) as typeof fetch;
    try {
      const res = await generateLLMResponse({ provider: 'deepseek', def: customProviderDef(deepseekRow), apiKey: 'd-key', messages: [{ role: 'user', content: 'hi' }], reasoning: 'low' });
      assert.equal(url, 'https://api.deepseek.com/chat/completions');
      assert.equal(body.model, 'deepseek-flash');
      assert.equal(body.max_tokens, 16000);
      assert.equal(body.reasoning_effort, undefined, 'only sent to providers that accept it');
      assert.equal(res.text, 'hola');
    } finally {
      globalThis.fetch = fakePostgrest as typeof fetch;
    }
  });

  test('adding an own provider checks it first (answers, uses tools) and stores the key', async () => {
    tables.llm_providers.length = 0;
    const seen: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input instanceof Request ? input.url : input);
      if (u.startsWith('https://api.mistral.ai/')) {
        seen.push(u);
        return Response.json({ model: 'mistral-large-latest', choices: [{ message: { content: '', tool_calls: [{ id: 't1', function: { name: 'ping', arguments: '{"value":"ok"}' } }] }, finish_reason: 'tool_calls' }], usage: {} });
      }
      return fakePostgrest(input, init);
    }) as typeof fetch;
    try {
      const res = await createCustomProvider(ctx, { slug: 'mistral', label: 'Mistral', base_url: 'https://api.mistral.ai/v1/', default_model: 'mistral-large-latest', fast_model: 'mistral-small-latest', api_key: 'm-key-123456' });
      assert.equal(res.check.tools, true);
      assert.deepEqual(seen, ['https://api.mistral.ai/v1/chat/completions']);
      assert.equal(tables.llm_providers[0].base_url, 'https://api.mistral.ai/v1');
      assert.ok(tables.encrypted_secrets.some((s) => s.provider === 'llm:mistral'), 'key stored under the provider');
      await assert.rejects(createCustomProvider(ctx, { slug: 'openai', label: 'x', base_url: 'https://x.test', default_model: 'm', api_key: 'k-12345678' }), /built-in provider/);
      await assert.rejects(createCustomProvider(ctx, { slug: 'plain', label: 'x', base_url: 'http://x.test', default_model: 'm', api_key: 'k-12345678' }), /https/);
    } finally {
      globalThis.fetch = fakePostgrest as typeof fetch;
    }
  });

  test('instances: automatic by default, preferred when a provider is chosen, locked on request', async () => {
    const auto = await createSession(ctx, { name: 'Auto' });
    assert.equal(auto.provider_mode, 'auto');
    const pref = await createSession(ctx, { name: 'Pref', provider: 'deepseek' });
    assert.equal(pref.provider_mode, 'preferred');
    assert.equal(pref.model, 'deepseek-flash');
    const locked = await createSession(ctx, { name: 'Fable only', provider: 'deepseek', model: 'deepseek-v4-pro', provider_mode: 'locked' });
    assert.deepEqual((await agentsLockedTo(TENANT, 'deepseek')).map((a) => a.name), ['Fable only']);
    await assert.rejects(deleteCustomProvider(ctx, 'deepseek'), /locked to DeepSeek: Fable only/);
    await assert.rejects(createSession(ctx, { name: 'x', provider: 'anthropic' }), /No Anthropic \(Claude\) API key/);
    await assert.rejects(createSession(ctx, { name: 'x', provider: 'nope' }), /Unknown LLM provider/);
    assert.ok(locked.id);
  });

  test('a locked agent fails instead of switching; a preferred one rotates', async () => {
    const calls: string[] = [];
    const generate = async (o: LLMGenerateOptions): Promise<LLMGenerateResult> => {
      calls.push(`${o.provider}:${o.model}`);
      if (o.provider === 'deepseek') throw new Error('Rate limited by the provider (DeepSeek 429): busy');
      return { text: `from ${o.provider}`, usage, finishReason: 'stop', model: o.model } as LLMGenerateResult;
    };
    const locked = await createSession(ctx, { name: 'Locked', provider: 'deepseek', provider_mode: 'locked', allowed_tools: [] });
    await assert.rejects(runSessionTurn(ctx, locked.id, 'hola', { generate, getSecret: getSecret as any }), /DeepSeek \(deepseek-flash\) failed and this agent is locked to it/);
    assert.deepEqual(calls, ['deepseek:deepseek-flash']);

    calls.length = 0;
    const pref = await createSession(ctx, { name: 'Preferred', provider: 'deepseek', allowed_tools: [] });
    const res = await runSessionTurn(ctx, pref.id, 'hola', { generate, getSecret: getSecret as any });
    assert.equal(res.message, 'from gemini');
    assert.deepEqual(calls, ['deepseek:deepseek-flash', 'gemini:gemini-3.8-flash']);
  });

  test('a worker can run on its own provider, model and mode', async () => {
    const team = await createTeam(ctx, {
      name: 'Mixed team',
      llm: { provider: 'gemini' },
      supervisor: { tools: [] },
      workers: [{ name: 'Writer', role: 'Writes copy', tools: [], provider: 'deepseek', model: 'deepseek-v4-pro', provider_mode: 'locked' }],
    });
    assert.equal(team.workers[0].provider, 'deepseek');
    const session = await createSession(ctx, { name: 'Mixed run', team_id: team.id });
    const calls: string[] = [];
    let step = 0;
    const generate = async (o: LLMGenerateOptions): Promise<LLMGenerateResult> => {
      calls.push(`${o.provider}:${o.model}`);
      step++;
      if (step === 1) return { text: '', usage, finishReason: 'tool_calls', toolCalls: [{ id: 'd1', name: 'delegate_to_writer', arguments: { task: 'Write a tagline' } }] } as LLMGenerateResult;
      return { text: step === 2 ? 'Tagline!' : 'Done: Tagline!', usage, finishReason: 'stop', model: o.model } as LLMGenerateResult;
    };
    const res = await runSessionTurn(ctx, session.id, 'Need a tagline', { generate, getSecret: getSecret as any });
    assert.equal(res.message, 'Done: Tagline!');
    assert.deepEqual(calls, ['gemini:gemini-3.8-flash', 'deepseek:deepseek-v4-pro', 'gemini:gemini-3.8-flash']);
  });
});
