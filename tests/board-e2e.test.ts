import assert from 'assert';
import crypto from 'crypto';
import { test, describe, before, after } from 'node:test';
import { fakePostgrest, resetTables, tables } from './helpers/fake-postgrest';
import {
  claimBoardTask, completeBoardTask, failBoardTask, getBoardTask, listBoardTasks,
  manageBoardTask, postBoardTask, releaseBoardTask, renewBoardLease, boardActor,
} from '../lib/services/board';
import { executePlatformTool, getAuthorizedPlatformTools } from '../lib/mcp/platform-mcp-server';
import { createTeam, createTeamSession } from '../lib/services/teams';
import { runSessionTurn } from '../lib/agent/session-runner';
import type { LLMGenerateOptions, LLMGenerateResult } from '../lib/agent/providers/llm-adapter';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const user = { tenantId: TENANT, userId: crypto.randomUUID(), authMode: 'session' as const, scopes: ['*'] };
const asTeam = (teamId: string) => ({ ...user, authMode: 'webhook_signature' as const, userId: 'heartbeat', teamId });

describe('Supervisor Board (fake PostgREST)', () => {
  const realFetch = globalThis.fetch;
  let teamA: string;
  let teamB: string;

  before(async () => {
    globalThis.fetch = fakePostgrest as typeof fetch;
    resetTables(['board_tasks', 'board_task_events', 'agent_teams', 'team_workers', 'agent_sessions', 'checkpoints', 'encrypted_secrets', 'run_events', 'context_profiles', 'mcp_profiles']);
    tables.encrypted_secrets.push({ tenant_id: TENANT, provider: 'gemini', updated_at: '2026-10-01', encrypted_payload: {} });
    const spec = { llm: { provider: 'gemini' }, supervisor: { tools: [] }, workers: [] };
    teamA = (await createTeam(user, { ...spec, name: 'Team A' })).id;
    teamB = (await createTeam(user, { ...spec, name: 'Team B' })).id;
  });
  after(() => {
    globalThis.fetch = realFetch;
  });

  test('post -> claim -> complete, with an event trail', async () => {
    const { task } = await postBoardTask(user, { title: 'Audit profiles', priority: 'high', labels: ['ops'] });
    assert.equal(task.status, 'open');
    assert.equal(task.claimable, true);
    assert.equal(task.posted_by, `user:${user.userId}`);

    const claimed = await claimBoardTask(asTeam(teamA), { task_id: task.id, lease_minutes: 15 });
    assert.equal(claimed.task.status, 'claimed');
    assert.equal(claimed.task.claimed_by, `team:${teamA}`);
    assert.equal(claimed.task.claimed_by_team_id, teamA);
    assert.equal(claimed.task.attempts, 1);

    await renewBoardLease(asTeam(teamA), { task_id: task.id, lease_minutes: 60 });
    const done = await completeBoardTask(asTeam(teamA), { task_id: task.id, result: 'All profiles fine.' });
    assert.equal(done.task.status, 'done');
    assert.equal(done.task.result, 'All profiles fine.');

    const { events } = await getBoardTask(user, { task_id: task.id });
    assert.deepEqual(events.map((e: any) => e.event), ['posted', 'claimed', 'renewed', 'completed']);
  });

  test('only one claimer wins; the loser gets an actionable error', async () => {
    const { task } = await postBoardTask(user, { title: 'Race' });
    await claimBoardTask(asTeam(teamA), { task_id: task.id });
    await assert.rejects(claimBoardTask(asTeam(teamB), { task_id: task.id }), /claimed by team:.*status="claimable"/);
    await assert.rejects(claimBoardTask(asTeam(teamA), { task_id: task.id }), /already hold/);
  });

  test('compare-and-set: a stale read cannot overwrite a fresh claim', async () => {
    const { task } = await postBoardTask(user, { title: 'Stale read' });
    // Simulate a competitor claiming between our read and our write.
    const realLoad = globalThis.fetch;
    let injected = false;
    globalThis.fetch = (async (input: any, init?: any) => {
      if (!injected && (init?.method || 'GET') === 'PATCH' && String(input).includes('board_tasks')) {
        injected = true;
        const row = tables.board_tasks.find((t) => t.id === task.id)!;
        Object.assign(row, { status: 'claimed', claimed_by: `team:${teamB}`, lease_expires_at: new Date(Date.now() + 600_000).toISOString() });
      }
      return realLoad(input, init);
    }) as typeof fetch;
    try {
      await assert.rejects(claimBoardTask(asTeam(teamA), { task_id: task.id }), /claimed this task a moment ago/);
    } finally {
      globalThis.fetch = realLoad;
    }
    assert.equal(tables.board_tasks.find((t) => t.id === task.id)!.claimed_by, `team:${teamB}`);
  });

  test('an expired lease is claimable again and logged', async () => {
    const { task } = await postBoardTask(user, { title: 'Abandoned' });
    await claimBoardTask(asTeam(teamA), { task_id: task.id });
    tables.board_tasks.find((t) => t.id === task.id)!.lease_expires_at = new Date(Date.now() - 1000).toISOString();

    const listed = await listBoardTasks(asTeam(teamB), { status: 'claimable' });
    assert.ok(listed.tasks.some((t: any) => t.id === task.id && t.lease_expired));
    const taken = await claimBoardTask(asTeam(teamB), { task_id: task.id });
    assert.equal(taken.task.claimed_by, `team:${teamB}`);
    assert.equal(taken.task.attempts, 2);
    // The previous holder can no longer finish it.
    await assert.rejects(completeBoardTask(asTeam(teamA), { task_id: task.id, result: 'late' }), /Only the current holder/);
    const { events } = await getBoardTask(user, { task_id: task.id });
    assert.ok(events.some((e: any) => e.event === 'lease_expired' && e.actor === `team:${teamA}`));
  });

  test('assigned tasks are reserved for that team', async () => {
    const { task } = await postBoardTask(user, { title: 'For B only', assigned_team_id: teamB });
    await assert.rejects(claimBoardTask(asTeam(teamA), { task_id: task.id }), /assigned to another team/);
    const claimableForA = await listBoardTasks(asTeam(teamA), { status: 'claimable' });
    assert.ok(!claimableForA.tasks.some((t: any) => t.id === task.id));
    const mine = await listBoardTasks(asTeam(teamB), { assigned_to_me: true });
    assert.ok(mine.tasks.some((t: any) => t.id === task.id));
    await claimBoardTask(asTeam(teamB), { task_id: task.id });
  });

  test('fail with retry reopens; release returns the task; humans can cancel and reopen', async () => {
    const { task } = await postBoardTask(user, { title: 'Flaky' });
    await claimBoardTask(asTeam(teamA), { task_id: task.id });
    const retried = await failBoardTask(asTeam(teamA), { task_id: task.id, reason: 'API down', retry: true });
    assert.equal(retried.task.status, 'open');
    assert.equal(retried.task.claimed_by, null);
    await claimBoardTask(asTeam(teamB), { task_id: task.id });
    assert.equal((await releaseBoardTask(asTeam(teamB), { task_id: task.id })).task.status, 'open');
    assert.equal((await manageBoardTask(user, task.id, { action: 'cancel' })).task.status, 'cancelled');
    await assert.rejects(claimBoardTask(asTeam(teamA), { task_id: task.id }), /cancelled/);
    assert.equal((await manageBoardTask(user, task.id, { action: 'reopen' })).task.status, 'open');
  });

  test('urgent work sorts first in the claimable queue', async () => {
    const low = await postBoardTask(user, { title: 'Low', priority: 'low' });
    const urgent = await postBoardTask(user, { title: 'Urgent', priority: 'urgent' });
    const queue = await listBoardTasks(asTeam(teamA), { status: 'claimable' });
    const ids = queue.tasks.map((t: any) => t.id);
    assert.ok(ids.indexOf(urgent.task.id) < ids.indexOf(low.task.id));
  });

  test('another organization sees nothing and cannot touch tasks', async () => {
    const { task } = await postBoardTask(user, { title: 'Private' });
    const other = { ...user, tenantId: OTHER };
    assert.equal((await listBoardTasks(other, {})).tasks.length, 0);
    await assert.rejects(getBoardTask(other, { task_id: task.id }), /not found/i);
    await assert.rejects(claimBoardTask(other, { task_id: task.id }), /not found/i);
    await assert.rejects(postBoardTask(other, { title: 'x', assigned_team_id: teamA }), /not a team/);
  });

  test('board tools require board scopes and attribute claims to the team in a team run', async () => {
    assert.ok(!getAuthorizedPlatformTools([], ['mcp:tasks:read']).some((t) => t.name.startsWith('contextcontrol_board_')));
    const names = getAuthorizedPlatformTools([], ['mcp:board:read']).map((t) => t.name).sort();
    assert.deepEqual(names, ['contextcontrol_board_get_task', 'contextcontrol_board_list_tasks']);
    assert.equal(boardActor({ ...user, authMode: 'api_key', apiKeyId: 'k1' }), 'api_key:k1');

    // A team instance whose supervisor claims and completes through the tools.
    const { task } = await postBoardTask(user, { title: 'Done by a team run' });
    const runner = await createTeam(user, {
      name: 'Runner',
      llm: { provider: 'gemini' },
      supervisor: { tools: ['contextcontrol_board_claim_task', 'contextcontrol_board_complete_task'] },
    });
    const session = await createTeamSession(user, runner.id);
    const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
    const script: Array<() => Partial<LLMGenerateResult>> = [
      () => ({ finishReason: 'tool_calls', toolCalls: [{ id: 'c1', name: 'contextcontrol_board_claim_task', arguments: { task_id: task.id } }] }),
      () => ({ finishReason: 'tool_calls', toolCalls: [{ id: 'c2', name: 'contextcontrol_board_complete_task', arguments: { task_id: task.id, result: 'Handled.' } }] }),
      () => ({ text: 'Claimed and completed.' }),
    ];
    const generate = async (_o: LLMGenerateOptions) => ({ text: '', usage, finishReason: 'stop', ...script.shift()!() }) as LLMGenerateResult;
    await runSessionTurn(user, session.id, 'Work the board', { generate, getSecret: async () => 'k' });
    const row = tables.board_tasks.find((t) => t.id === task.id)!;
    assert.equal(row.status, 'done');
    assert.equal(row.claimed_by, `team:${runner.id}`);

    // Same tool called outside a team run is attributed to the user.
    const solo = await postBoardTask(user, { title: 'Solo' });
    await executePlatformTool('contextcontrol_board_claim_task', { task_id: solo.task.id }, user);
    assert.equal(tables.board_tasks.find((t) => t.id === solo.task.id)!.claimed_by, `user:${user.userId}`);
  });
});
