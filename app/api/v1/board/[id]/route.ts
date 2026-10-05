export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { BOARD_PRIORITIES, boardGetArgs } from '@/lib/mcp/tool-catalog';
import { getBoardTask, manageBoardTask } from '@/lib/services/board';

type Params = { params: Promise<{ id: string }> };

const manageBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('edit'),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(10_000).nullable().optional(),
    priority: z.enum(BOARD_PRIORITIES).optional(),
    labels: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
    due_at: z.string().datetime({ offset: true }).nullable().optional(),
  }).strict(),
  z.object({ action: z.literal('assign'), assigned_team_id: z.string().uuid().nullable() }).strict(),
  z.object({ action: z.literal('cancel'), note: z.string().max(2000).optional() }).strict(),
  z.object({ action: z.literal('reopen'), note: z.string().max(2000).optional() }).strict(),
]);

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    const { id } = await params;
    return NextResponse.json(await getBoardTask(auth, boardGetArgs.parse({ task_id: id })));
  } catch (err) {
    return errorResponse(err, 'board:get');
  }
}

/** Human management: edit, assign, cancel, reopen. Agents use the board tools instead. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const { id } = await params;
    const { task_id } = boardGetArgs.parse({ task_id: id });
    return NextResponse.json(await manageBoardTask(auth, task_id, manageBody.parse(await req.json())));
  } catch (err) {
    return errorResponse(err, 'board:manage');
  }
}
