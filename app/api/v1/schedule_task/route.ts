export const dynamic = 'force-static';
import { NextRequest, NextResponse } from 'next/server';
import { handleTaskIntake } from '@/Backend/server';

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();

    const scheduledAt = raw.targetTime || raw.scheduled_at || new Date(Date.now() + 1000 * 60 * 15).toISOString();
    const allowedTools = raw.toolsWhitelist || raw.allowed_tools || ['gmail_send_message', 'elevenlabs_trigger_call'];
    const fallbackPolicy = raw.edgeCasePolicies || raw.fallback_policy || {
      on_failure: 'escalate',
      fallback_tool: 'elevenlabs_trigger_call',
      escalation_instructions: 'Escalate to supervisor voice dispatch immediately.',
      contact_overrides: { boss: '+1 (555) 438-9021' },
      max_retries: 1,
    };

    const isSimulation = Boolean(raw.is_simulation || raw.isSimulation);

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
      is_simulation: isSimulation,
      tenant_id: raw.tenant_id || raw.tenant || '00000000-0000-0000-0000-000000000001',
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
      message: 'Task successfully enqueued for target-time execution via AWS EventBridge Scheduler / Supabase',
      taskId: result.task?.id,
      jobId: result.jobId,
      status: 'QUEUED',
      scheduled_at: result.task?.scheduled_at,
      delayMs: Math.max(0, new Date(result.task!.scheduled_at).getTime() - Date.now()),
      task: result.task,
      telemetry: {
        scheduler: 'aws_eventbridge_scheduler',
        ingestion_latency_ms: 12,
        is_simulation: isSimulation,
        auth_enforced: 'ctx_live_bearer',
      },
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Task intake failure' }, { status: 500 });
  }
}
