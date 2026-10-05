export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { boardListArgs, boardPostArgs } from '@/lib/mcp/tool-catalog';
import { boardActor, listBoardTasks, postBoardTask } from '@/lib/services/board';

/** Board for the signed-in user's organization. Query: status, priority, label, limit, offset. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const q = req.nextUrl.searchParams;
    const args = boardListArgs.parse({
      status: q.get('status') || undefined,
      priority: q.get('priority') || undefined,
      label: q.get('label') || undefined,
      limit: q.get('limit') ? Number(q.get('limit')) : 100,
      offset: q.get('offset') ? Number(q.get('offset')) : undefined,
    });
    // `viewer` lets the UI show the signed-in user's own actions as "you".
    return NextResponse.json({ ...(await listBoardTasks(auth, args)), viewer: boardActor(auth) });
  } catch (err) {
    return errorResponse(err, 'board:list');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json(await postBoardTask(auth, boardPostArgs.parse(await req.json())), { status: 201 });
  } catch (err) {
    return errorResponse(err, 'board:post');
  }
}
