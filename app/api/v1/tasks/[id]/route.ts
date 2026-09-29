export const dynamic = 'force-static';
export function generateStaticParams() {
  return [{ id: 'default' }];
}
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/Backend/legacy_ts_mocks/db';
import { handleCancelTask, handleTriggerNow } from '@/Backend/legacy_ts_mocks/server';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const task = db.getTaskById(id);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    return NextResponse.json({ task });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const action = body.action;

    if (action === 'trigger_now') {
      const result = await handleTriggerNow(id);
      return NextResponse.json(result);
    }

    if (action === 'toggle_simulate_failure') {
      const task = db.getTaskById(id);
      if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      task.simulate_failure = !task.simulate_failure;
      db.saveTask(task);
      return NextResponse.json({ success: true, simulate_failure: task.simulate_failure });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const result = handleCancelTask(id);
    db.deleteTask(id);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
