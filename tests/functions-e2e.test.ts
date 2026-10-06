import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';
import { test, describe, before, after } from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fakePostgrest, resetTables, tables } from './helpers/fake-postgrest';
import {
  archiveFunction, createFunction, deployFunction, getFunction, invokeFunction, listInvocations,
  setFunctionSecret, setLambdaClientForTests, testFunction, updateFunction,
} from '../lib/services/functions';
import { draftFunction, fixFunction } from '../lib/functions/ai-assist';
import { buildPackage } from '../lib/functions/runtime-wrappers';
import { validateInput } from '../lib/functions/function-spec';
import { registerFunctionTools } from '../lib/mcp/platform-mcp-server';
import { createTeam, createTeamSession } from '../lib/services/teams';
import { runSessionTurn } from '../lib/agent/session-runner';
import type { LLMGenerateOptions, LLMGenerateResult } from '../lib/agent/providers/llm-adapter';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const user = { tenantId: TENANT, userId: crypto.randomUUID(), authMode: 'session' as const, scopes: ['*'] };
const stranger = { ...user, tenantId: OTHER };
const EXEC_ROLE = 'arn:aws:iam::123456789012:role/test-exec';

const PY_CONVERT = `def main(input):
    value = input["value"]
    if input.get("from", "C") == "C":
        return {"result": value * 9 / 5 + 32, "unit": "F"}
    return {"result": (value - 32) * 5 / 9, "unit": "C"}
`;
const SCHEMA = { type: 'object', properties: { value: { type: 'number' }, from: { type: 'string', enum: ['C', 'F'] } }, required: ['value'] };

/** Fake Lambda that really runs the packaged code with local node/python. */
class FakeLambda {
  fns = new Map<string, any>();
  calls: string[] = [];
  nextFunctionError: Record<string, unknown> | null = null;

  async send(cmd: any) {
    const name = cmd.constructor.name as string;
    const input = cmd.input;
    this.calls.push(name);
    const notFound = () => Object.assign(new Error('Function not found'), { name: 'ResourceNotFoundException' });
    switch (name) {
      case 'GetFunctionConfigurationCommand':
        if (!this.fns.has(input.FunctionName)) throw notFound();
        return { State: 'Active', LastUpdateStatus: 'Successful', CodeSha256: 'sha-' + this.fns.get(input.FunctionName).zip.length };
      case 'CreateFunctionCommand':
        this.fns.set(input.FunctionName, { ...input, zip: input.Code.ZipFile });
        return {};
      case 'UpdateFunctionConfigurationCommand':
        Object.assign(this.fns.get(input.FunctionName), input);
        return {};
      case 'UpdateFunctionCodeCommand':
        this.fns.get(input.FunctionName).zip = input.ZipFile;
        return {};
      case 'DeleteFunctionCommand':
        if (!this.fns.delete(input.FunctionName)) throw notFound();
        return {};
      case 'InvokeCommand': {
        const fn = this.fns.get(input.FunctionName);
        if (!fn) throw notFound();
        if (this.nextFunctionError) {
          const payload = this.nextFunctionError;
          this.nextFunctionError = null;
          return { FunctionError: 'Unhandled', Payload: new TextEncoder().encode(JSON.stringify(payload)) };
        }
        const out = await this.run(fn, new TextDecoder().decode(input.Payload));
        return { Payload: new TextEncoder().encode(JSON.stringify(out)) };
      }
    }
    throw new Error(`unexpected command ${name}`);
  }

  private async run(fn: any, event: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccfn-'));
    for (const [file, bytes] of Object.entries(unzipSync(fn.zip))) fs.writeFileSync(path.join(dir, file), strFromU8(bytes));
    const env = fn.Environment?.Variables || {};
    if (fn.Runtime.startsWith('python')) {
      const script = `import json,sys; sys.path.insert(0, ${JSON.stringify(dir)}); import handler; print(json.dumps(handler.handler(json.loads(sys.stdin.read()), None)))`;
      const res = spawnSync('python3', ['-c', script], { input: event, env: { ...process.env, ...env }, encoding: 'utf8' });
      return JSON.parse(res.stdout);
    }
    const saved = { ...process.env };
    Object.assign(process.env, env);
    try {
      const mod = await import(pathToFileURL(path.join(dir, 'index.mjs')).href);
      return await mod.handler(JSON.parse(event));
    } finally {
      for (const k of Object.keys(env)) if (!(k in saved)) delete process.env[k];
    }
  }
}

describe('AI Function Studio (fake Lambda running real code)', () => {
  const realFetch = globalThis.fetch;
  const fake = new FakeLambda();

  before(() => {
    globalThis.fetch = fakePostgrest as typeof fetch;
    process.env.FUNCTION_EXEC_ROLE_ARN = EXEC_ROLE;
    setLambdaClientForTests(fake, 0);
    resetTables(['custom_functions', 'function_secrets', 'function_invocations', 'mcp_profiles', 'agent_teams', 'team_workers', 'agent_sessions', 'checkpoints', 'encrypted_secrets', 'run_events', 'context_profiles']);
    tables.encrypted_secrets.push({ tenant_id: TENANT, provider: 'gemini', updated_at: '2026-10-01', encrypted_payload: {} });
  });
  after(() => {
    globalThis.fetch = realFetch;
    setLambdaClientForTests(null);
  });

  let convertId: string;

  test('create -> deploy creates an isolated Lambda; test runs the real Python code', async () => {
    const { function: fn } = await createFunction(user, { name: 'Convert Temperature', description: 'Convert C<->F', language: 'python', code: PY_CONVERT, input_schema: SCHEMA });
    convertId = fn.id;
    assert.equal(fn.function_slug, 'convert_temperature');
    assert.equal(fn.status, 'draft');
    assert.equal(fn.needs_deploy, true);

    const { function: deployed } = await deployFunction(user, fn.id);
    assert.equal(deployed.status, 'deployed');
    assert.equal(deployed.needs_deploy, false);
    const lambda = fake.fns.get(deployed.lambda_name)!;
    assert.equal(lambda.Role, EXEC_ROLE);
    assert.equal(lambda.Runtime, 'python3.12');
    assert.deepEqual(lambda.Architectures, ['arm64']);
    assert.equal(lambda.Tags['context-control:tenant'], TENANT);

    const res = await invokeFunction(user, fn.id, { value: 100, from: 'C' }, 'test');
    assert.equal(res.status, 'ok', String(res.error));
    assert.deepEqual(res.output, { result: 212, unit: 'F' });
    const { invocations } = await listInvocations(user, fn.id);
    assert.equal(invocations[0].source, 'test');
    assert.equal(invocations[0].caller, `user:${user.userId}`);
  });

  test('editing the draft marks it stale; Test redeploys first and runs the new code', async () => {
    await updateFunction(user, convertId, { name: 'Convert Temperature', description: 'Convert C<->F', language: 'python', code: PY_CONVERT.replace('"unit": "F"', '"unit": "°F"'), input_schema: SCHEMA });
    assert.equal((await getFunction(user, convertId)).function.needs_deploy, true);
    const before = fake.calls.filter((c) => c === 'UpdateFunctionCodeCommand').length;
    const { result, redeployed } = await testFunction(user, convertId, { value: 0 });
    assert.equal(redeployed, true);
    assert.equal(fake.calls.filter((c) => c === 'UpdateFunctionCodeCommand').length, before + 1);
    assert.deepEqual(result.output, { result: 32, unit: '°F' });
  });

  test('errors, bad input, timeouts and the daily cap', async () => {
    await assert.rejects(invokeFunction(user, convertId, { from: 'C' }, 'test'), /Missing required field "value"/);
    await assert.rejects(invokeFunction(user, convertId, { value: 'hot' }, 'test'), /must be number/);

    const { function: broken } = await createFunction(user, { name: 'Broken', language: 'python', code: 'def main(input):\n    return 1 / 0\n' });
    const { result } = await testFunction(user, broken.id, {});
    assert.equal(result.status, 'error');
    assert.match(String(result.error), /ZeroDivisionError/);

    fake.nextFunctionError = { errorMessage: '2026-10-05 Task timed out after 10.01 seconds', errorType: 'Sandbox.Timedout' };
    const timedOut = await invokeFunction(user, convertId, { value: 1 }, 'test');
    assert.equal(timedOut.status, 'timeout');

    const now = new Date().toISOString();
    for (let i = 0; i < 1000; i++) tables.function_invocations.push({ id: `x${i}`, tenant_id: TENANT, function_id: convertId, created_at: now });
    await assert.rejects(invokeFunction(user, convertId, { value: 1 }, 'test'), /Daily limit/);
    tables.function_invocations = tables.function_invocations.filter((r) => !String(r.id).startsWith('x'));
  });

  test('TypeScript functions compile, read secrets from env, and secret values never leave the server', async () => {
    const code = `export default async function main(input: { name?: string }): Promise<{ text: string }> {
  return { text: \`\${process.env.GREETING ?? 'missing'}, \${input.name ?? 'you'}\` };
}`;
    const { function: fn } = await createFunction(user, { name: 'Greeter', language: 'typescript', code });
    await deployFunction(user, fn.id);
    const { function: withSecret } = await setFunctionSecret(user, fn.id, 'GREETING', 'Hola');
    assert.deepEqual(withSecret.secret_names, ['GREETING']);
    assert.ok(!JSON.stringify(withSecret).includes('Hola'));
    assert.equal(withSecret.needs_deploy, true, 'a new secret needs a redeploy');
    const stored = tables.function_secrets.find((s) => s.function_id === fn.id)!;
    assert.ok(!JSON.stringify(stored).includes('Hola'), 'stored encrypted');

    const { result } = await testFunction(user, fn.id, { name: 'Ana' });
    assert.equal(result.status, 'ok', String(result.error));
    assert.deepEqual(result.output, { text: 'Hola, Ana' });
    await assert.rejects(setFunctionSecret(user, fn.id, 'bad-name', 'x'), /UPPER_SNAKE_CASE/);
  });

  test('another organization cannot see, run or deploy the function', async () => {
    await assert.rejects(getFunction(stranger, convertId), /not found/);
    await assert.rejects(invokeFunction(stranger, convertId, { value: 1 }, 'test'), /not found/);
    await assert.rejects(deployFunction(stranger, convertId), /not found/);
  });

  test('profiles group functions: a team whose MCP profile includes the function calls it as a tool', async () => {
    const profileId = crypto.randomUUID();
    tables.mcp_profiles.push({ id: profileId, org_id: TENANT, name: 'Math tools', description: null, token_budget: 1000, settings: { function_ids: [convertId] }, is_active: true, archived_at: null, created_at: '2026-10-01', updated_at: '2026-10-01' });
    const team = await createTeam(user, { name: 'Calc team', llm: { provider: 'gemini' }, supervisor: { tools: [], mcp_profile_id: profileId } });
    const session = await createTeamSession(user, team.id);
    const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
    let offered: string[] = [];
    const script: Array<() => Partial<LLMGenerateResult>> = [
      () => ({ finishReason: 'tool_calls', toolCalls: [{ id: 'c1', name: 'fn_convert_temperature', arguments: { value: 30, from: 'C' } }] }),
      () => ({ text: '30 C is 86 F.' }),
    ];
    const generate = async (o: LLMGenerateOptions) => {
      offered = (o.tools || []).map((t) => t.name);
      return { text: '', usage, finishReason: 'stop', ...script.shift()!() } as LLMGenerateResult;
    };
    const turn = await runSessionTurn(user, session.id, 'What is 30 C in F?', { generate, getSecret: async () => 'k' });
    assert.ok(offered.includes('fn_convert_temperature'));
    assert.equal(turn.message, '30 C is 86 F.');
    const inv = tables.function_invocations.find((r) => r.source === 'agent')!;
    assert.equal(inv.caller, `team:${team.id}`);
    assert.equal(inv.status, 'ok');
  });

  test('MCP: functions are registered with their schema; a profile-bound key only sees its profile', async () => {
    const ctx = { tenantId: TENANT, userId: 'key_1', authMode: 'api_key' as const, apiKeyId: 'k1' };
    const all = await registerFunctionTools(new McpServer({ name: 't', version: '1' }), ctx, null);
    assert.deepEqual(all.sort(), ['fn_broken', 'fn_convert_temperature', 'fn_greeter']);
    const profileId = tables.mcp_profiles[0].id;
    const bound = await registerFunctionTools(new McpServer({ name: 't', version: '1' }), ctx, profileId);
    assert.deepEqual(bound, ['fn_convert_temperature']);
  });

  test('archiving deletes the Lambda', async () => {
    const { function: fn } = await getFunction(user, convertId);
    await archiveFunction(user, convertId);
    assert.ok(!fake.fns.has(fn.lambda_name));
    await assert.rejects(getFunction(user, convertId), /not found/);
  });

  test('AI drafting parses fenced JSON, retries once on invalid output, and fixes stay proposals', async () => {
    const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
    const replies = [
      'Sure! here you go: not json',
      '```json\n{"name":"Add numbers","description":"Adds a and b","code":"def main(input):\\n    return {\\"sum\\": input[\\"a\\"] + input[\\"b\\"]}\\n","input_schema":{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]},"explanation":"Adds."}\n```',
    ];
    const deps = {
      generate: async () => ({ text: replies.shift()!, usage, finishReason: 'stop' }) as LLMGenerateResult,
      getSecret: async () => 'k',
      providers: async () => ['gemini' as const],
    };
    const { draft } = await draftFunction(user, { description: 'add two numbers a and b', language: 'python' }, deps);
    assert.equal(draft.tool_name, 'fn_add_numbers');
    assert.deepEqual(draft.input_schema.required, ['a', 'b']);
    assert.equal(tables.custom_functions.filter((f) => f.name === 'Add numbers').length, 0, 'drafts are not saved');

    const bad = { ...deps, generate: async () => ({ text: 'nope', usage, finishReason: 'stop' }) as LLMGenerateResult };
    await assert.rejects(draftFunction(user, { description: 'add two numbers', language: 'python' }, bad), /did not return a usable answer/);
    let sawLowEffort = false;
    const slow = {
      ...deps,
      generate: async (o: LLMGenerateOptions) => {
        sawLowEffort = o.reasoning === 'low' && !!o.signal;
        throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
      },
    };
    await assert.rejects(draftFunction(user, { description: 'add two numbers', language: 'python' }, slow), /took too long/);
    assert.ok(sawLowEffort, 'AI calls ask for low effort under a deadline');

    const { function: broken } = await getFunction(user, tables.custom_functions.find((f) => f.name === 'Broken')!.id);
    const fixDeps = { ...deps, generate: async () => ({ text: '{"code":"def main(input):\\n    return 0\\n","explanation":"Avoid dividing by zero."}', usage, finishReason: 'stop' }) as LLMGenerateResult };
    const { fix } = await fixFunction(user, broken.id, { error: 'ZeroDivisionError' }, fixDeps);
    assert.match(fix.code, /return 0/);
    assert.equal((await getFunction(user, broken.id)).function.code.includes('1 / 0'), true, 'fix is not applied automatically');
  });

  test('wrappers and input validation', () => {
    const py = buildPackage('python', PY_CONVERT);
    assert.deepEqual(Object.keys(py.files).sort(), ['handler.py', 'user_function.py']);
    const ts = buildPackage('typescript', 'export default (i: { a: number }) => i.a;');
    assert.ok(!ts.files['user_function.mjs'].includes(': { a: number }'));
    assert.throws(() => buildPackage('typescript', 'export default (('), /could not be compiled/);
    assert.deepEqual(validateInput(SCHEMA, { value: 1, from: 'K' }), ['Field "from" must be one of "C", "F".']);
    assert.deepEqual(validateInput(SCHEMA, []), ['Input must be a JSON object.']);
  });
});
