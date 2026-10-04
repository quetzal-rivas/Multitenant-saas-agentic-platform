import assert from 'assert';
import crypto from 'crypto';
import { test, describe, before, after } from 'node:test';
import { fakePostgrest, resetTables, tables } from './helpers/fake-postgrest';
import { runSessionTurn, resolveSessionTools, MAX_AGENT_STEPS } from '../lib/agent/session-runner';
import { createSession, forkSession, latestCheckpoint, getSessionDetail } from '../lib/services/agent-sessions';
import { contextProfileInstructions } from '../lib/services/context-profiles';
import type { LLMGenerateOptions, LLMGenerateResult } from '../lib/agent/providers/llm-adapter';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ctxA = { tenantId: TENANT_A, userId: 'user-a', authMode: 'session' as const, scopes: ['*'] };
const ctxB = { tenantId: TENANT_B, userId: 'user-b', authMode: 'session' as const, scopes: ['*'] };
const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };

/** Scripted model: each call pops the next response and records what it was sent. */
function scriptedModel(responses: Array<(opts: LLMGenerateOptions) => Partial<LLMGenerateResult>>) {
  const calls: LLMGenerateOptions[] = [];
  const generate = async (opts: LLMGenerateOptions): Promise<LLMGenerateResult> => {
    calls.push(JSON.parse(JSON.stringify(opts)));
    const next = responses.shift();
    if (!next) throw new Error('model called more times than scripted');
    return { text: '', usage, finishReason: 'stop', ...next(opts) } as LLMGenerateResult;
  };
  return { generate, calls };
}

const getSecret = async () => 'sk-test-byok';

describe('contextProfileInstructions', () => {
  test('uses only enabled authored instruction/policy steps, highest priority first', () => {
    const text = contextProfileInstructions({
      name: 'Support',
      pipeline: [
        { id: '1', type: 'system_instructions', title: 'Tone', description: '', sourceId: '', priority: 5, enabled: true, config: { staticContent: 'Be concise.' } },
        { id: '2', type: 'policy', title: 'Refunds', description: '', sourceId: '', priority: 9, enabled: true, config: { staticContent: 'Never promise refunds.' } },
        { id: '3', type: 'relevant_knowledge', title: 'KB', description: '', sourceId: '', priority: 10, enabled: true, config: { staticContent: 'sample snippet' } },
        { id: '4', type: 'agent_instructions', title: 'Off', description: '', sourceId: '', priority: 8, enabled: false, config: { staticContent: 'disabled' } },
      ],
    } as any);
    assert.equal(text, '### Refunds\nNever promise refunds.\n\n### Tone\nBe concise.');
  });
});

describe('Agent Studio end-to-end (fake PostgREST, scripted model)', () => {
  const realFetch = globalThis.fetch;
  let profileA: string;
  let profileB: string;
  let contextA: string;

  before(() => {
    globalThis.fetch = fakePostgrest as typeof fetch;
    resetTables(['agent_sessions', 'checkpoints', 'supervisor_tasks', 'mcp_profiles', 'context_profiles', 'encrypted_secrets', 'run_events']);
    profileA = crypto.randomUUID();
    profileB = crypto.randomUUID();
    contextA = crypto.randomUUID();
    tables.mcp_profiles.push(
      { id: profileA, org_id: TENANT_A, name: 'A ops', description: 'Ops tooling', token_budget: 8000, settings: { selectedToolNames: ['gmail.send_draft'] }, is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: profileB, org_id: TENANT_B, name: 'B secret', description: null, token_budget: 8000, settings: {}, is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01' }
    );
    tables.context_profiles.push({
      id: contextA, tenant_id: TENANT_A, slug: 'support', name: 'Support voice', description: null, version: 1,
      created_at: '2026-01-01', updated_at: '2026-01-01', archived_at: null,
      definition: { pipeline: [{ id: 's', type: 'system_instructions', title: 'Voice', description: '', sourceId: '', priority: 5, enabled: true, config: { staticContent: 'Answer like a calm SRE.' } }] },
    });
    tables.supervisor_tasks.push({ id: crypto.randomUUID(), tenant_id: TENANT_A, title: 'Rotate keys', description: 'quarterly', status: 'scheduled', target_time: '2026-12-01T00:00:00Z', metadata: {}, created_at: '2026-01-01' });
    tables.encrypted_secrets.push({ tenant_id: TENANT_A, provider: 'anthropic', updated_at: '2026-01-01', encrypted_payload: { keyFingerprint: 'fp' } });
  });

  after(() => {
    globalThis.fetch = realFetch;
  });

  test('instance creation validates provider key and tenant-owned attachments', async () => {
    await assert.rejects(createSession(ctxA, { name: 'x', provider: 'openai' }), /No openai API key/);
    await assert.rejects(createSession(ctxA, { name: 'x', provider: 'anthropic', mcp_profile_id: profileB }), /not found/i);
    await assert.rejects(createSession(ctxA, { name: 'x', provider: 'anthropic', allowed_tools: ['drop_tables'] }));
  });

  let sessionId: string;
  let firstCheckpointId: string;

  test('a turn runs real tools, injects attached profiles, and writes a checkpoint', async () => {
    const session = await createSession(ctxA, {
      name: 'Ops assistant',
      provider: 'anthropic',
      mcp_profile_id: profileA,
      context_profile_id: contextA,
    });
    sessionId = session.id;
    assert.equal(session.model, 'claude-opus-5-5');
    assert.ok(session.allowed_tools.includes('contextcontrol_list_tasks'));
    assert.ok(!session.allowed_tools.includes('contextcontrol_create_profile'), 'write tools are opt-in');

    const model = scriptedModel([
      () => ({
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'call_1', name: 'contextcontrol_list_tasks', arguments: {} }],
        providerContent: { provider: 'anthropic', content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: 'call_1', name: 'contextcontrol_list_tasks', input: {} }] },
      }),
      (opts) => {
        const toolMsg = opts.messages.find((m) => m.role === 'tool')!;
        assert.match(toolMsg.content, /Rotate keys/, 'model receives the real tool output');
        return { text: 'You have one task: Rotate keys.', providerContent: { provider: 'anthropic', content: [{ type: 'text', text: 'You have one task: Rotate keys.' }] } };
      },
    ]);

    const result = await runSessionTurn(ctxA, sessionId, 'What is scheduled?', { generate: model.generate, getSecret });
    assert.equal(result.message, 'You have one task: Rotate keys.');
    assert.equal(result.step_index, 1);
    assert.equal(result.tool_executions[0].toolName, 'contextcontrol_list_tasks');
    assert.equal((result.tool_executions[0].output as any).tasks[0].title, 'Rotate keys');

    const system = model.calls[0].systemPrompt!;
    assert.match(system, /Answer like a calm SRE/);
    assert.match(system, /A ops/);
    assert.match(system, /gmail\.send_draft.*not connected/);
    assert.ok(model.calls[0].tools!.every((t) => session.allowed_tools.includes(t.name)));

    const checkpoint = tables.checkpoints.find((c) => c.id === result.checkpoint_id)!;
    firstCheckpointId = checkpoint.id;
    assert.equal(checkpoint.tenant_id, TENANT_A);
    assert.equal(checkpoint.parent_id, null);
    assert.deepEqual(checkpoint.state.map((m: any) => m.role), ['user', 'assistant', 'tool', 'assistant']);
    assert.equal(checkpoint.usage.totalTokens, 30);

    // The client transcript never carries provider-internal blocks.
    assert.ok(result.transcript.every((m: any) => !('providerContent' in m)));
  });

  test('the next turn resumes from the latest checkpoint with raw provider content intact', async () => {
    const model = scriptedModel([
      (opts) => {
        assert.deepEqual(opts.messages.map((m) => m.role), ['user', 'assistant', 'tool', 'assistant', 'user']);
        assert.equal((opts.messages[1].providerContent as any).content[0].type, 'thinking');
        return { text: 'Still just one.' };
      },
    ]);
    const result = await runSessionTurn(ctxA, sessionId, 'Anything else?', { generate: model.generate, getSecret });
    assert.equal(result.step_index, 2);
    const checkpoint = tables.checkpoints.find((c) => c.id === result.checkpoint_id)!;
    assert.equal(checkpoint.parent_id, firstCheckpointId);
  });

  test('fork starts a new instance from an earlier checkpoint without touching the source', async () => {
    const fork = await forkSession(ctxA, { checkpoint_id: firstCheckpointId });
    assert.notEqual(fork.id, sessionId);
    assert.equal(fork.forked_from_checkpoint, firstCheckpointId);
    const latest = await latestCheckpoint(ctxA, fork.id);
    assert.equal(latest!.state.length, 4);
    const source = await getSessionDetail(ctxA, sessionId);
    assert.equal(source.checkpoints.length, 2);
  });

  test('another tenant cannot run, read, or fork the instance', async () => {
    const model = scriptedModel([]);
    await assert.rejects(runSessionTurn(ctxB, sessionId, 'hi', { generate: model.generate, getSecret }), /not found/i);
    await assert.rejects(getSessionDetail(ctxB, sessionId), /not found/i);
    await assert.rejects(forkSession(ctxB, { checkpoint_id: firstCheckpointId }), /not found/i);
    assert.equal(model.calls.length, 0);
  });

  test('an API key only gets tools it also holds; a disallowed call becomes a tool error', async () => {
    const keyCtx = { tenantId: TENANT_A, userId: 'key_1', authMode: 'api_key' as const, apiKeyId: 'k1', scopes: ['agent:run', 'mcp:profiles:read'], toolsWhitelist: [] };
    const tools = resolveSessionTools({ allowed_tools: ['contextcontrol_list_tasks', 'contextcontrol_list_profiles'] }, keyCtx);
    assert.deepEqual(tools.map((t) => t.name), ['contextcontrol_list_profiles']);

    const model = scriptedModel([
      () => ({ finishReason: 'tool_calls', toolCalls: [{ id: 'c', name: 'contextcontrol_list_tasks', arguments: {} }] }),
      () => ({ text: 'I cannot see tasks with this key.' }),
    ]);
    const result = await runSessionTurn(keyCtx, sessionId, 'Show tasks', { generate: model.generate, getSecret });
    assert.equal(result.tool_executions[0].isError, true);
    assert.match(String(result.tool_executions[0].output), /not enabled/);
  });

  test('missing BYOK key and runaway tool loops are handled', async () => {
    await assert.rejects(
      runSessionTurn(ctxA, sessionId, 'hi', { generate: scriptedModel([]).generate, getSecret: async () => null }),
      /No anthropic API key/
    );

    const looping = scriptedModel(
      Array.from({ length: MAX_AGENT_STEPS }, (_, i) => () => ({
        finishReason: 'tool_calls' as const,
        toolCalls: [{ id: `loop_${i}`, name: 'contextcontrol_list_profiles', arguments: {} }],
      }))
    );
    const result = await runSessionTurn(ctxA, sessionId, 'loop', { generate: looping.generate, getSecret });
    assert.equal(looping.calls.length, MAX_AGENT_STEPS);
    assert.match(result.message, /Stopped after/);
    assert.equal(result.tool_executions.length, MAX_AGENT_STEPS);
  });
});
