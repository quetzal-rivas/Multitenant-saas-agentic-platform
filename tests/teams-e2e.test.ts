import assert from 'assert';
import crypto from 'crypto';
import { test, describe, before, after } from 'node:test';
import { fakePostgrest, resetTables, tables } from './helpers/fake-postgrest';
import { createTeam, createTeamSession, getTeam, stableJson, teamSpecSchema, toTeamSpec, updateTeam, workerSlug } from '../lib/services/teams';
import { runSessionTurn } from '../lib/agent/session-runner';
import { processDueHeartbeats, runTeamHeartbeat } from '../lib/services/heartbeats';
import type { LLMGenerateOptions, LLMGenerateResult } from '../lib/agent/providers/llm-adapter';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ctx = { tenantId: TENANT, userId: crypto.randomUUID(), authMode: 'session' as const, scopes: ['*'] };
const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
const getSecret = async () => 'byok';

function scripted(responses: Array<(opts: LLMGenerateOptions) => Partial<LLMGenerateResult>>) {
  const calls: LLMGenerateOptions[] = [];
  const generate = async (opts: LLMGenerateOptions): Promise<LLMGenerateResult> => {
    calls.push(JSON.parse(JSON.stringify(opts)));
    const next = responses.shift();
    if (!next) throw new Error('model called more times than scripted');
    return { text: '', usage, finishReason: 'stop', ...next(opts) } as LLMGenerateResult;
  };
  return { generate, calls };
}

const baseSpec = {
  name: 'Ops Team',
  description: 'Keeps the workspace tidy',
  llm: { provider: 'gemini' },
  supervisor: { instructions: 'Be brief.', tools: ['contextcontrol_list_profiles'] },
  workers: [
    { name: 'Task Researcher', role: 'Finds scheduled tasks', tools: ['list_scheduled_tasks'] },
    { name: 'Profile Clerk', role: 'Creates and edits profiles', tools: ['contextcontrol_create_profile'] },
  ],
};

describe('Teams (fake PostgREST, scripted model)', () => {
  const realFetch = globalThis.fetch;
  let teamId: string;

  before(() => {
    globalThis.fetch = fakePostgrest as typeof fetch;
    resetTables(['agent_teams', 'team_workers', 'agent_sessions', 'checkpoints', 'supervisor_tasks', 'mcp_profiles', 'context_profiles', 'encrypted_secrets', 'run_events']);
    tables.encrypted_secrets.push({ tenant_id: TENANT, provider: 'gemini', updated_at: '2026-10-01', encrypted_payload: {} });
    tables.supervisor_tasks.push({ id: crypto.randomUUID(), tenant_id: TENANT, title: 'Rotate keys', description: null, status: 'scheduled', target_time: '2026-12-01T00:00:00Z', metadata: {}, created_at: '2026-10-01' });
    tables.context_profiles.push({ id: crypto.randomUUID(), tenant_id: OTHER, slug: 'x', name: 'Foreign', definition: {}, version: 1, archived_at: null, created_at: '2026-10-01', updated_at: '2026-10-01' });
  });
  after(() => {
    globalThis.fetch = realFetch;
  });

  test('spec validation: unique workers, heartbeat needs goal+schedule, legacy tool names canonicalized', () => {
    const dup = teamSpecSchema.safeParse({ ...baseSpec, workers: [baseSpec.workers[0], { ...baseSpec.workers[0], name: 'task researcher!' }] });
    assert.equal(dup.success, false);
    const hb = teamSpecSchema.safeParse({ ...baseSpec, heartbeat: { enabled: true } });
    assert.equal(hb.success, false);
    const ok = teamSpecSchema.parse(baseSpec);
    assert.deepEqual(ok.workers[0].tools, ['contextcontrol_list_tasks']);
    assert.equal(workerSlug('Fácil Clerk #2'), 'facil_clerk_2');
    assert.equal(teamSpecSchema.safeParse({ ...baseSpec, supervisor: { tools: ['stripe.pay'] } }).success, false, 'fake skills are rejected');
  });

  test('saving a team without changing its schedule keeps the next heartbeat (jsonb key order)', async () => {
    assert.equal(stableJson({ b: 1, a: [{ d: 2, c: 3 }] }), stableJson({ a: [{ c: 3, d: 2 }], b: 1 }));
    const spec = {
      name: 'Clock keeper',
      llm: { provider: 'gemini' },
      supervisor: { tools: [] },
      heartbeat: { enabled: true, goal: 'Check in', schedule: { mode: 'interval', every: 15, unit: 'minutes', timezone: 'UTC' } },
    };
    const team = await createTeam(ctx, spec);
    const row = tables.agent_teams.find((t) => t.id === team.id)!;
    // Postgres jsonb returns keys in its own order; simulate that, and pin the planned run.
    row.heartbeat_schedule = { unit: 'minutes', every: 15, timezone: 'UTC', mode: 'interval' };
    row.heartbeat_next_run_at = '2030-01-01T00:00:00.000Z';
    await updateTeam(ctx, team.id, { ...spec, name: 'Clock keeper (renamed)' });
    assert.equal(row.heartbeat_next_run_at, '2030-01-01T00:00:00.000Z', 'renaming must not re-plan the heartbeat');
    await updateTeam(ctx, team.id, { ...spec, heartbeat: { ...spec.heartbeat, schedule: { ...spec.heartbeat.schedule, every: 30 } } });
    assert.notEqual(row.heartbeat_next_run_at, '2030-01-01T00:00:00.000Z', 'a real schedule change re-plans');
  });

  test('create team; profiles must belong to the tenant; export round-trips', async () => {
    const foreign = tables.context_profiles[0].id;
    await assert.rejects(createTeam(ctx, { ...baseSpec, supervisor: { ...baseSpec.supervisor, context_profile_id: foreign } }), /not found/i);
    const team = await createTeam(ctx, baseSpec);
    teamId = team.id;
    assert.equal(team.model, 'gemini-3.8-flash');
    assert.deepEqual(team.workers.map((w) => w.slug), ['task_researcher', 'profile_clerk']);
    const spec = toTeamSpec(team);
    // Exports spell out empty optional fields as null; compare meaning, not formatting.
    const dropNulls = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (_k, x) => (x === null ? undefined : x)));
    assert.deepEqual(
      dropNulls(teamSpecSchema.parse(spec)),
      dropNulls(teamSpecSchema.parse({ ...baseSpec, llm: { provider: 'gemini', model: 'gemini-3.8-flash' } }))
    );
  });

  test('supervisor delegates to a worker who uses only its own tools', async () => {
    const session = await createTeamSession(ctx, teamId);
    assert.equal(session.agent_type, 'team');
    const model = scripted([
      (o) => {
        assert.match(o.systemPrompt!, /supervisor of the "Ops Team" team/);
        assert.deepEqual(o.tools!.map((t) => t.name).sort(), ['contextcontrol_list_profiles', 'delegate_to_profile_clerk', 'delegate_to_task_researcher']);
        return { finishReason: 'tool_calls', toolCalls: [{ id: 'd1', name: 'delegate_to_task_researcher', arguments: { task: 'List scheduled tasks' } }] };
      },
      (o) => {
        assert.match(o.systemPrompt!, /You are Task Researcher/);
        assert.deepEqual(o.tools!.map((t) => t.name), ['contextcontrol_list_tasks']);
        assert.equal(o.messages[0].content, 'List scheduled tasks');
        return { finishReason: 'tool_calls', toolCalls: [{ id: 'w1', name: 'contextcontrol_list_tasks', arguments: {} }] };
      },
      (o) => {
        assert.match(o.messages.at(-1)!.content, /Rotate keys/);
        return { text: 'One task: Rotate keys.' };
      },
      (o) => {
        const toolMsg = o.messages.at(-1)!;
        assert.equal(toolMsg.role, 'tool');
        assert.match(toolMsg.content, /Task Researcher.*One task: Rotate keys/);
        return { text: 'Your team found one scheduled task: Rotate keys.' };
      },
    ]);
    const turn = await runSessionTurn(ctx, session.id, 'What is scheduled?', { generate: model.generate, getSecret });
    assert.equal(turn.message, 'Your team found one scheduled task: Rotate keys.');
    const byWorker = turn.tool_executions.map((e) => `${e.worker ?? 'supervisor'}:${e.toolName}`);
    assert.deepEqual(byWorker, ['Task Researcher:contextcontrol_list_tasks', 'supervisor:delegate_to_task_researcher']);
    const checkpoint = tables.checkpoints.find((c) => c.id === turn.checkpoint_id)!;
    assert.deepEqual(checkpoint.metadata.workers_used, ['Task Researcher']);
    // Only the supervisor's conversation is persisted; worker scratch work stays out of state.
    assert.deepEqual(checkpoint.state.map((m: any) => m.role), ['user', 'assistant', 'tool', 'assistant']);
  });

  test('a team with no workers behaves like a single agent', async () => {
    const solo = await createTeam(ctx, { ...baseSpec, name: 'Solo', workers: [] });
    const session = await createTeamSession(ctx, solo.id);
    const model = scripted([(o) => {
      assert.deepEqual(o.tools!.map((t) => t.name), ['contextcontrol_list_profiles']);
      assert.doesNotMatch(o.systemPrompt!, /Your team/);
      return { text: 'Hi!' };
    }]);
    const turn = await runSessionTurn(ctx, session.id, 'hi', { generate: model.generate, getSecret });
    assert.equal(turn.message, 'Hi!');
  });

  test('due heartbeats run once, advance the schedule, and respect the daily cap', async () => {
    const team = await updateTeam(ctx, teamId, {
      ...baseSpec,
      heartbeat: {
        enabled: true,
        goal: 'Check the board and report.',
        schedule: { mode: 'interval', every: 15, unit: 'minutes', timezone: 'America/Mexico_City' },
        max_runs_per_day: 2,
      },
    });
    assert.ok(team.heartbeat_next_run_at, 'enabling schedules the first run');
    // Make it due now.
    const row = tables.agent_teams.find((t) => t.id === teamId)!;
    row.heartbeat_next_run_at = '2026-10-05T14:00:00.000Z';
    const now = new Date('2026-10-05T15:00:00Z');

    const model = scripted([(o) => {
      assert.equal(o.messages.at(-1)!.content, 'Check the board and report.');
      return { text: 'All quiet.' };
    }]);
    const outcomes = await processDueHeartbeats({ now, deps: { generate: model.generate, getSecret } });
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].status, 'ok');
    assert.equal(row.heartbeat_next_run_at, '2026-10-05T15:15:00.000Z');
    assert.equal(row.heartbeat_runs_today, 1);
    assert.equal(row.heartbeat_last_status, 'ok');
    assert.ok(row.heartbeat_session_id, 'a dedicated heartbeat instance was created');
    const hbSession = tables.agent_sessions.find((s) => s.id === row.heartbeat_session_id)!;
    assert.equal(hbSession.name, 'Ops Team · Heartbeat');

    // Nothing else is due at the same instant.
    assert.equal((await processDueHeartbeats({ now, deps: { generate: model.generate, getSecret } })).length, 0);

    // Cap is 2 per day: the second run is allowed, the third is skipped.
    const again = scripted([() => ({ text: 'Still quiet.' })]);
    assert.equal((await runTeamHeartbeat(ctx, await getTeam(ctx, teamId), { manual: true, now, deps: { generate: again.generate, getSecret } })).status, 'ok');
    const capped = await runTeamHeartbeat(ctx, await getTeam(ctx, teamId), { manual: true, now, deps: { generate: again.generate, getSecret } });
    assert.equal(capped.status, 'skipped');
    assert.match(capped.detail!, /Daily cap of 2/);
  });

  test('another tenant cannot read or run the team', async () => {
    const otherCtx = { ...ctx, tenantId: OTHER };
    await assert.rejects(getTeam(otherCtx, teamId), /not found/i);
    await assert.rejects(createTeamSession(otherCtx, teamId), /not found/i);
  });
});
