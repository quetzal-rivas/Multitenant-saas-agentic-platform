// ==============================================================================
// API Ingestion (src/server.ts) - Validates Scheduled Task Payloads Using Zod
// Standard ingestion endpoint for live LLMs and Agent workflows
// ==============================================================================

import { TaskPayloadSchema, TaskPayload } from './types';
import { taskDb } from './db';
import { taskQueue } from './queue';

export interface IngestionResult {
  success: boolean;
  message: string;
  data?: {
    taskId: string;
    targetTime: string;
    status: string;
    queueJobId: string;
    delayMs: number;
    toolsWhitelisted: string[];
    edgeCaseFallback: string;
  };
  errors?: Array<{ path: string; message: string }>;
}

/**
 * Core validation and ingestion handler for /schedule_task
 */
export async function handleScheduleTask(rawPayload: unknown): Promise<{
  statusCode: number;
  result: IngestionResult;
}> {
  // 1. Validate payload using Zod
  const parseResult = TaskPayloadSchema.safeParse(rawPayload);

  if (!parseResult.success) {
    const rawIssues: any[] = (parseResult.error as any).issues || (parseResult.error as any).errors || [];
    const errorDetails = rawIssues.map((e: any) => ({
      path: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
      message: e.message || 'Validation error',
    }));

    return {
      statusCode: 400,
      result: {
        success: false,
        message: 'Zod Validation Error: Invalid scheduled task payload format',
        errors: errorDetails,
      },
    };
  }

  const payload: TaskPayload = parseResult.data;

  // 2. Persist initial task in Supabase PostgreSQL (ephemeral_context table)
  const savedRecord = await taskDb.saveTask(payload);

  // 3. Orchestrate with BullMQ & Redis for durable crash-proof delay
  const queueResult = await taskQueue.scheduleDeferredTask(payload);

  return {
    statusCode: 201,
    result: {
      success: true,
      message: `Task '${payload.taskId}' scheduled successfully in BullMQ queue and logged to Supabase PostgreSQL ephemeral_context.`,
      data: {
        taskId: savedRecord.taskId,
        targetTime: savedRecord.targetTime,
        status: savedRecord.status,
        queueJobId: queueResult.jobId,
        delayMs: queueResult.delayMs,
        toolsWhitelisted: savedRecord.toolsWhitelist,
        edgeCaseFallback: savedRecord.edgeCasePolicies.fallbackOnPrimaryFailure,
      },
    },
  };
}

export { taskDb, taskQueue, TaskPayloadSchema };
