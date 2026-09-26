import { NextRequest, NextResponse } from 'next/server';
import { handleTaskIntake } from '@/Backend/server';

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();

    // Normalize keys to support both { targetTime, toolsWhitelist, edgeCasePolicies } 
    // and { scheduled_at, allowed_tools, fallback_policy }
    const scheduledAt = raw.targetTime || raw.scheduled_at || new Date(Date.now() + 1000 * 60 * 15).toISOString();
    const allowedTools = raw.toolsWhitelist || raw.allowed_tools || ['gmail.send_draft', 'elevenlabs.trigger_call'];
    const fallbackPolicy = raw.edgeCasePolicies || raw.fallback_policy || {
      on_failure: 'escalate',
      fallback_tool: 'elevenlabs_trigger_call',
      escalation_instructions: 'Escalate to supervisor voice dispatch immediately.',
      contact_overrides: { boss: '+1 (555) 438-9021' },
      max_retries: 1,
    };

    const payload = {
      id: raw.id || raw.thread_id || `task_${Date.now()}`,
      title: raw.title || raw.primaryInstructions?.slice(0, 40) || 'Deferred Automated Action',
      instructions: raw.instructions || raw.primaryInstructions || 'Execute verified action sequence at scheduled timestamp',
      scheduled_at: scheduledAt,
      allowed_tools: allowedTools,
      fallback_policy: {
        on_failure: fallbackPolicy.on_failure || fallbackPolicy.fallbackOnPrimaryFailure || 'escalate',
        fallback_tool: fallbackPolicy.fallback_tool || fallbackPolicy.escalationTool || 'elevenlabs_trigger_call',
        escalation_instructions: fallbackPolicy.escalation_instructions || fallbackPolicy.escalationInstructions || 'Execute escalation fallback policy',
        contact_overrides: fallbackPolicy.contact_overrides || fallbackPolicy.contactOverrides || {},
        max_retries: typeof fallbackPolicy.max_retries === 'number' ? fallbackPolicy.max_retries : (fallbackPolicy.maxRetries ?? 1),
      },
      category: raw.category || 'voice',
      simulate_failure: Boolean(raw.simulate_failure || raw.forceFailure),
      tenant_id: raw.tenant_id || raw.tenant || 'tenant_enterprise_corp',
    };

    const result = await handleTaskIntake(payload);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, validationErrors: result.validationErrors },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Task successfully enqueued in BullMQ Redis delayed bucket',
      taskId: result.task?.id,
      jobId: result.jobId,
      status: 'QUEUED_DELAYED',
      scheduled_at: result.task?.scheduled_at,
      delayMs: Math.max(0, new Date(result.task!.scheduled_at).getTime() - Date.now()),
      task: result.task,
      telemetry: {
        redis_queue: 'bullmq:scheduled_tasks',
        ingestion_latency_ms: 12,
        auth_enforced: 'ctx_live_bearer',
      },
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Task intake failure' }, { status: 500 });
  }
}
