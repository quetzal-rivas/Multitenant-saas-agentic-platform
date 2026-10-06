export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { heartbeatScheduleSchema } from '@/lib/agent/heartbeat-schedule';
import { listTasks, scheduleTask, upcomingRuns, updateTask } from '@/lib/services/tasks';

// The tenant always comes from the signed-in session; any tenant_id in the request is ignored.

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const { tasks } = await listTasks(auth, { limit: 100 });
    return NextResponse.json({ tasks: tasks.map((t: any) => ({ ...t, upcoming: upcomingRuns(t, 3) })) });
  } catch (err) {
    return errorResponse(err, 'tasks:list');
  }
}

const createBody = z
  .object({
    title: z.string().trim().min(1).max(255),
    instructions: z.string().trim().min(1).max(10_000),
    team_id: z.string().uuid(),
    target_time: z.string().datetime({ offset: true }).optional(),
    schedule: heartbeatScheduleSchema.optional(),
    max_retries: z.number().int().min(0).max(10).optional(),
    retry_delay_minutes: z.number().int().min(1).max(1440).optional(),
    escalate_to_board: z.boolean().optional(),
    escalation_team_id: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine((b) => !!b.target_time !== !!b.schedule, { message: 'Give exactly one of target_time (one-off) or schedule (repeating).' });

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const body = createBody.parse(await req.json());
    const { task } = await scheduleTask(auth, {
      title: body.title,
      instructions: body.instructions,
      team_id: body.team_id,
      target_time: body.target_time,
      schedule: body.schedule,
      max_retries: body.max_retries,
      escalate_to_board: body.escalate_to_board,
    });
    const extra: Record<string, unknown> = {};
    if (body.retry_delay_minutes !== undefined) extra.retry_delay_minutes = body.retry_delay_minutes;
    if (body.escalation_team_id !== undefined) extra.escalation_team_id = body.escalation_team_id;
    const final = Object.keys(extra).length ? (await updateTask(auth, task.id, extra)).task : task;
    return NextResponse.json({ task: { ...final, upcoming: upcomingRuns(final, 3) } }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 'tasks:create');
  }
}
