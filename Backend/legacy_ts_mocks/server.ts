/**
 * Backend/server.ts - Intake HTTP Endpoint & Zod Payload Validation
 * 
 * Provides HTTP endpoint ingestion for scheduling AI agent tasks:
 * - What to do (instructions)
 * - When to do it (scheduled_at timestamp)
 * - What tools it's allowed to use (allowed_tools array)
 * - Automatic fallback policy & contact overrides (fallback_policy)
 */

import { z } from 'zod';
import { ScheduledTask, db } from './db';
import { taskQueue } from './queue';

// Zod Schema validating the task intake payload
export const TaskIntakeSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(3, 'Task title must be at least 3 characters'),
  instructions: z.string().min(5, 'Task instructions must be at least 5 characters'),
  scheduled_at: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'scheduled_at must be a valid ISO 8601 timestamp',
  }),
  allowed_tools: z.array(z.string()).min(1, 'Must specify at least 1 allowed tool'),
  fallback_policy: z.object({
    on_failure: z.enum(['escalate', 'retry', 'abort']).default('escalate'),
    fallback_tool: z.string().default('elevenlabs_trigger_call'),
    escalation_instructions: z.string().min(5, 'Escalation instructions must be provided'),
    contact_overrides: z.record(z.string(), z.string()).optional(),
    max_retries: z.number().int().min(0).max(5).default(1),
  }),
  category: z.enum(['email', 'voice', 'calendar', 'maintenance', 'audit']).optional().default('email'),
  simulate_failure: z.boolean().optional().default(false),
  tenant_id: z.string().optional().default('tenant_enterprise_corp'),
  calendar_event_id: z.string().optional(),
});

export type TaskIntakeInput = z.infer<typeof TaskIntakeSchema>;

/**
 * Controller function for task intake (used by API routes and server scripts)
 */
export async function handleTaskIntake(payload: unknown): Promise<{
  success: boolean;
  task?: ScheduledTask;
  jobId?: string;
  error?: string;
  validationErrors?: z.ZodIssue[];
}> {
  // 1. Zod payload validation
  const validationResult = TaskIntakeSchema.safeParse(payload);
  if (!validationResult.success) {
    return {
      success: false,
      error: 'Invalid task intake payload shape',
      validationErrors: validationResult.error.issues,
    };
  }

  const validData = validationResult.data;

  // 2. Generate task ID if not supplied
  const taskId = validData.id || `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // 3. Construct full ScheduledTask model
  const task: ScheduledTask = {
    id: taskId,
    title: validData.title,
    instructions: validData.instructions,
    scheduled_at: validData.scheduled_at,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: 'SCHEDULED',
    allowed_tools: validData.allowed_tools,
    fallback_policy: validData.fallback_policy,
    category: validData.category,
    simulate_failure: validData.simulate_failure,
    tenant_id: validData.tenant_id,
    calendar_event_id: validData.calendar_event_id,
  };

  // 4. Save to Supabase / Postgres state store
  db.saveTask(task);

  // 5. Enqueue into Durable Queue (BullMQ + Redis)
  const job = await taskQueue.scheduleTask(task);

  console.log(`[Intake] Successfully ingested and queued task ${task.id} ("${task.title}") for ${task.scheduled_at}`);

  return {
    success: true,
    task,
    jobId: job.id,
  };
}

/**
 * Controller function for listing tasks
 */
export function handleListTasks(tenantId?: string) {
  return {
    tasks: db.getAllTasks(tenantId),
    queueStats: taskQueue.getStats(),
  };
}

/**
 * Controller function for task cancellation
 */
export function handleCancelTask(taskId: string) {
  const cancelled = taskQueue.cancelTask(taskId);
  return { success: cancelled, taskId };
}

/**
 * Controller function for manual immediate trigger (testing)
 */
export async function handleTriggerNow(taskId: string) {
  const result = await taskQueue.triggerNow(taskId);
  return { success: Boolean(result), task: result };
}

/**
 * Controller function for crash & restart simulation
 */
export function handleSimulateCrash() {
  return taskQueue.simulateServerCrash();
}

export function handleSimulateRestart() {
  return taskQueue.simulateServerRestart();
}
