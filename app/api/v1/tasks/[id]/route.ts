export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { heartbeatScheduleSchema } from '@/lib/agent/heartbeat-schedule';
import { cancelTask, getTask, setTaskPaused, taskHistory, upcomingRuns, updateTask } from '@/lib/services/tasks';
import { runTaskNow } from '@/lib/services/scheduled-tasks';

type Params = { params: Promise<{ id: string }> };

/** Task detail with the next runs and the run history. */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    const id = (await params).id;
    const { task } = await getTask(auth, { task_id: id });
    const { runs } = await taskHistory(auth, id);
    return NextResponse.json({ task: { ...task, upcoming: upcomingRuns(task, 5) }, runs });
  } catch (err) {
    return errorResponse(err, 'tasks:get');
  }
}

const patchBody = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    instructions: z.string().trim().min(1).max(10_000).optional(),
    team_id: z.string().uuid().optional(),
    target_time: z.string().datetime({ offset: true }).nullable().optional(),
    schedule: heartbeatScheduleSchema.nullable().optional(),
    max_retries: z.number().int().min(0).max(10).optional(),
    retry_delay_minutes: z.number().int().min(1).max(1440).optional(),
    escalate_to_board: z.boolean().optional(),
    escalation_team_id: z.string().uuid().nullable().optional(),
    paused: z.boolean().optional(),
  })
  .strict();

/** Edit, or pause/resume with { paused }. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const id = (await params).id;
    const { paused, ...patch } = patchBody.parse(await req.json());
    let result = Object.keys(patch).length ? await updateTask(auth, id, patch) : null;
    if (paused !== undefined) result = await setTaskPaused(auth, id, paused);
    const task = result?.task ?? (await getTask(auth, { task_id: id })).task;
    return NextResponse.json({ task: { ...task, upcoming: upcomingRuns(task, 5) } });
  } catch (err) {
    return errorResponse(err, 'tasks:update');
  }
}

/** { action: 'run_now' } starts a run immediately (the schedule is unchanged). */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const { action } = z.object({ action: z.literal('run_now') }).parse(await req.json());
    void action;
    return NextResponse.json(await runTaskNow(auth, (await params).id), { status: 202 });
  } catch (err) {
    return errorResponse(err, 'tasks:run-now');
  }
}

/** Cancel the task (kept for history). */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json(await cancelTask(auth, { task_id: (await params).id }));
  } catch (err) {
    return errorResponse(err, 'tasks:cancel');
  }
}
