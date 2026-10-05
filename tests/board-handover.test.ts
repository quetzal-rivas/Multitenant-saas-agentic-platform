import assert from 'assert';
import crypto from 'crypto';
import { test, describe, before, after } from 'node:test';
import { fakePostgrest, resetTables, tables } from './helpers/fake-postgrest';
import {
  addBoardNote, claimBoardTask, completeBoardTask, getBoardTask, handoverBoardTask, listBoardTasks,
  parkRunClaims, postBoardTask, renewBoardLease, requestBoardHandover, teamHasBoardWork,
} from '../lib/services/board';
import { createTeam, getTeam } from '../lib/services/teams';
import { runTeamHeartbeat } from '../lib/services/heartbeats';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const user = { tenantId: TENANT, userId: crypto.randomUUID(), authMode: 'session' as const, scopes: ['*'] };
const run = (teamId: string, runId: string) => ({ ...user, authMode: 'webhook_signature' as const, userId: 'heartbeat', teamId, runId });
const expire = (taskId: string) => {
  const row = tables.board_tasks.find((t) => t.id === taskId)!;
  row.lease_expires_at = new Date(Date.now() - 1000).toISOString();
};

describe('Board handover, notes, late results and run-level holders', () => {
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

  test('two runs of the same team cannot both act on a claim', async () => {
    const { task } = await postBoardTask(user, { title: 'Run identity' });
    await claimBoardTask(run(teamA, 'run_1'), { task_id: task.id });
    await assert.rejects(completeBoardTask(run(teamA, 'run_2'), { task_id: task.id, result: 'x' }), /Another run of your team/);
    await assert.rejects(claimBoardTask(run(teamA, 'run_2'), { task_id: task.id }), /Another run of your team/);
    await assert.rejects(renewBoardLease(run(teamA, 'run_2'), { task_id: task.id }), /Another run of your team/);
  });

  test('a parked claim is resumed by the next run, with the progress note', async () => {
    const { task } = await postBoardTask(user, { title: 'Long job' });
    await claimBoardTask(run(teamA, 'run_a1'), { task_id: task.id });
    await addBoardNote(run(teamA, 'run_a1'), { task_id: task.id, note: 'Did steps 1-2; step 3 left.' });
    await parkRunClaims(TENANT, 'run_a1');

    assert.equal(await teamHasBoardWork(TENANT, teamA), true);
    const listed = await listBoardTasks(run(teamA, 'run_a2'), { status: 'claimable' });
    assert.ok(listed.tasks.some((t) => t.id === task.id), 'parked task is claimable for its holder');

    const resumed = await claimBoardTask(run(teamA, 'run_a2'), { task_id: task.id });
    assert.equal(resumed.task.claim_run_id, 'run_a2');
    assert.equal(resumed.task.handoff_note, 'Did steps 1-2; step 3 left.');
    assert.equal(resumed.task.attempts, 1, 'resuming is not a new attempt');
    await completeBoardTask(run(teamA, 'run_a2'), { task_id: task.id, result: 'Done' });

    const { events } = await getBoardTask(user, { task_id: task.id });
    assert.deepEqual(events.map((e: any) => e.event), ['posted', 'claimed', 'note', 'resumed', 'completed']);
  });

  test('handover: request -> holder hands over with a summary -> requester resumes', async () => {
    const { task } = await postBoardTask(user, { title: 'Handover me' });
    await claimBoardTask(run(teamA, 'run_h1'), { task_id: task.id });
    await assert.rejects(handoverBoardTask(run(teamA, 'run_h1'), { task_id: task.id, summary: 'x' }), /Nobody asked/);

    const req = await requestBoardHandover(run(teamB, 'run_b1'), { task_id: task.id, reason: 'We own billing' });
    assert.equal(req.task.handover_requested_by, `team:${teamB}`);
    await assert.rejects(requestBoardHandover({ ...user }, { task_id: task.id }), /already asked/);

    // The holder sees the request on its next board call.
    const renewed = await renewBoardLease(run(teamA, 'run_h1'), { task_id: task.id });
    assert.equal(renewed.task.handover_requested_by, `team:${teamB}`);

    const handed = await handoverBoardTask(run(teamA, 'run_h1'), { task_id: task.id, summary: 'Drafted invoice; needs approval.' });
    assert.equal(handed.task.claimed_by, `team:${teamB}`);
    assert.equal(handed.task.claim_run_id, null);
    assert.equal(handed.task.handover_requested_by, null);
    assert.equal(handed.task.handoff_note, 'Drafted invoice; needs approval.');

    await assert.rejects(completeBoardTask(run(teamA, 'run_h1'), { task_id: 'not-a-task' } as any));
    const resumed = await claimBoardTask(run(teamB, 'run_b2'), { task_id: task.id });
    assert.equal(resumed.task.claim_run_id, 'run_b2');
    const done = await completeBoardTask(run(teamB, 'run_b2'), { task_id: task.id, result: 'Approved and sent.' });
    assert.equal(done.task.status, 'done');
  });

  test('a result submitted after losing the task is kept as a late result', async () => {
    const { task } = await postBoardTask(user, { title: 'Slow worker' });
    await claimBoardTask(run(teamA, 'run_s1'), { task_id: task.id });
    expire(task.id);
    await claimBoardTask(run(teamB, 'run_s2'), { task_id: task.id });

    const late = await completeBoardTask(run(teamA, 'run_s1'), { task_id: task.id, result: 'Finished late: report attached.' });
    assert.equal(late.late, true);
    assert.equal(late.task.status, 'claimed');
    assert.equal(late.task.late_result, 'Finished late: report attached.');
    assert.equal(late.task.late_result_by, `team:${teamA}`);
    assert.match(late.message!, /late result/);

    // The new holder sees it and can complete with it.
    const view = await getBoardTask(run(teamB, 'run_s2'), { task_id: task.id });
    assert.equal(view.task.late_result, 'Finished late: report attached.');
    await completeBoardTask(run(teamB, 'run_s2'), { task_id: task.id, result: 'Used the late report.' });

    // A late result on a finished task is recorded in history only.
    const after = await completeBoardTask(run(teamA, 'run_s1'), { task_id: task.id, result: 'again' });
    assert.equal(after.late, true);
    assert.match(after.message!, /already done/);

    // Someone who never held the task cannot submit a result.
    const { task: t2 } = await postBoardTask(user, { title: 'Not yours' });
    await claimBoardTask(run(teamA, 'run_s3'), { task_id: t2.id });
    await assert.rejects(completeBoardTask(run(teamB, 'run_s4'), { task_id: t2.id, result: 'x' }), /Only the current holder/);
  });

  test('a late finisher whose lease expired but was not taken over still completes normally', async () => {
    const { task } = await postBoardTask(user, { title: 'Expired, untouched' });
    await claimBoardTask(run(teamA, 'run_e1'), { task_id: task.id });
    expire(task.id);
    const done = await completeBoardTask(run(teamA, 'run_e1'), { task_id: task.id, result: 'ok' });
    assert.equal(done.late, false);
    assert.equal(done.task.status, 'done');
  });

  test('heartbeat with wake_when=board_has_work makes no LLM call when idle', async () => {
    tables.board_tasks.length = 0;
    const spec = {
      name: 'Idle team',
      llm: { provider: 'gemini' },
      supervisor: { tools: [] },
      workers: [],
      heartbeat: {
        enabled: true,
        goal: 'Check the board',
        schedule: { mode: 'interval', every: 5, unit: 'minutes', timezone: 'UTC' },
        wake_when: 'board_has_work',
      },
    };
    const team = await createTeam(user, spec);
    let llmCalls = 0;
    const deps = { getSecret: async () => 'test-key', generate: async () => { llmCalls++; throw new Error('should not be called'); } };

    const idle = await runTeamHeartbeat(user, await getTeam(user, team.id), { deps: deps as any });
    assert.equal(idle.status, 'idle');
    assert.equal(llmCalls, 0);
    const row = tables.agent_teams.find((t) => t.id === team.id)!;
    assert.equal(row.heartbeat_last_status, 'idle');
    assert.equal(row.heartbeat_runs_today ?? 0, 0, 'idle wake-ups do not count toward the cap');

    await postBoardTask(user, { title: 'Work arrives' });
    assert.equal(await teamHasBoardWork(TENANT, team.id), true);
    const busy = await runTeamHeartbeat(user, await getTeam(user, team.id), { deps: deps as any });
    assert.equal(llmCalls, 1, 'the LLM runs once there is work');
    assert.equal(busy.status, 'error'); // our fake generate throws; the point is that it was called
  });
});
