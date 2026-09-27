export const dynamic = 'force-static';
import { NextRequest, NextResponse } from 'next/server';
import { handleScheduleTask, taskDb, taskQueue } from '@/Backend/deferred-task-engine/src/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { statusCode, result } = await handleScheduleTask(body);
    return NextResponse.json(result, { status: statusCode });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json(
      {
        success: false,
        message: `Failed to process /schedule_task request: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  const queueStats = taskQueue.getQueueStats();
  const tasks = await taskDb.listTasks();

  return NextResponse.json({
    engine: 'Deferred Task Engine (BullMQ + LangGraph + MCP + Supabase)',
    version: '1.0.0',
    status: 'online',
    queueStats,
    tasksCount: tasks.length,
    samplePayload: {
      taskId: 'task-202',
      targetTime: '2026-09-10T18:00:00Z',
      primaryInstructions: 'Send summary report via email.',
      toolsWhitelist: ['gmail'],
      edgeCasePolicies: {
        fallbackOnPrimaryFailure: 'escalate',
        escalationTool: 'elevenlabs',
        escalationInstructions: 'Trigger voice alert call if email fails.',
        contactOverrides: {
          boss: 'boss@example.com',
        },
      },
    },
  });
}
