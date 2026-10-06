export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireScope } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { scheduleTaskArgs } from '@/lib/mcp/tool-catalog';
import { scheduleTask } from '@/lib/services/tasks';

/**
 * Legacy endpoint kept for existing integrations; same as the contextcontrol_schedule_task
 * tool. The tenant is the caller's verified workspace (tenant fields in the body are ignored).
 * Body: { title, instructions, team_id, target_time | schedule, max_retries?, escalate_to_board? }.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    requireScope(auth, 'mcp:tasks:write');
    const raw = await req.json();
    const args = scheduleTaskArgs.parse({
      title: raw.title,
      instructions: raw.instructions ?? raw.description,
      team_id: raw.team_id,
      target_time: raw.target_time ?? raw.targetTime ?? raw.scheduled_at,
      schedule: raw.schedule,
      max_retries: raw.max_retries,
      escalate_to_board: raw.escalate_to_board,
    });
    return NextResponse.json(await scheduleTask(auth, args), { status: 201 });
  } catch (err) {
    return errorResponse(err, 'schedule_task');
  }
}
