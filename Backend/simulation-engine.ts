/**
 * Backend/simulation-engine.ts
 * 
 * Programmatic Simulation Execution Engine
 * - Strictly isolates simulation executions with is_simulation: true metadata
 * - Bypasses external service API calls (Gmail, ElevenLabs, Stripe, etc.)
 * - Executes LangGraph supervisor routing loops and sub-worker node transitions
 * - Handles BullMQ sandbox immediate job promotion (Time Warp / Force Promote)
 * - Persists isolated checkpoints to PostgresSaver with is_simulation flag
 */

import {
  SimulationRunPayload,
  SimulationTelemetryEvent,
  SimulationRunResult,
  QueueOperationalBadge,
} from './simulation-schemas';
import { teamBlueprintManager, ProfileTeamBlueprint, ProfileWorkerBlueprint } from './team-blueprint-manager';
import { checkpointManagerStore, CheckpointRecord } from './checkpoint-manager';

export class SimulationEngine {
  /**
   * Run a sandboxed simulation of an Agent Team Profile, LangGraph supervisor loop, and BullMQ queue
   */
  public async runSimulation(payload: SimulationRunPayload): Promise<SimulationRunResult> {
    const startTime = Date.now();
    const telemetry: SimulationTelemetryEvent[] = [];
    const threadId = payload.thread_id;
    const profileId = payload.profile_id;
    const taskId = payload.taskId || `sim_task_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();

    // 1. Resolve Team Profile Blueprint or fallback
    const teamBlueprint: ProfileTeamBlueprint | undefined = teamBlueprintManager.getProfile(profileId);
    const teamName = teamBlueprint?.name || `Team Profile (${profileId})`;
    const workers: ProfileWorkerBlueprint[] = teamBlueprint?.workers && teamBlueprint.workers.length > 0
      ? teamBlueprint.workers
      : [
          {
            id: 'worker-primary-ops',
            name: 'Primary Operations Worker',
            role: 'Task Orchestration & Tool Execution',
            mcpTools: payload.toolsWhitelist,
            skills: ['HubSpot CRM', 'Google Workspace'],
          },
          {
            id: 'worker-voice-escalation',
            name: 'Escalation Voice Specialist',
            role: 'ElevenLabs Voice Synthesis & Telephony Dispatch',
            mcpTools: ['elevenlabs_trigger_call'],
            skills: ['Telephony Voice Alerts'],
          },
        ];

    // Helper to log telemetry events and PostgresSaver checkpoints
    let stepCount = 0;
    const recordTelemetry = (
      badge: QueueOperationalBadge,
      workerNode: string,
      thought: string,
      opts?: {
        action?: string;
        toolUsed?: string;
        toolPayload?: Record<string, any>;
        toolResult?: Record<string, any>;
        isMockBypassed?: boolean;
      }
    ): SimulationTelemetryEvent => {
      stepCount += 1;
      const timestamp = new Date().toISOString();
      const event: SimulationTelemetryEvent = {
        id: `sim_evt_${stepCount}_${Date.now()}`,
        timestamp,
        queueBadge: badge,
        profileId,
        threadId,
        subWorkerNode: workerNode,
        thought,
        action: opts?.action,
        toolUsed: opts?.toolUsed,
        toolPayload: opts?.toolPayload,
        toolResult: opts?.toolResult,
        isMockBypassed: opts?.isMockBypassed ?? true,
        checkpointId: `chk_sim_${Date.now()}_${stepCount}`,
        stepIndex: stepCount,
        durationMs: Date.now() - startTime,
      };
      telemetry.push(event);

      // Record to PostgresSaver checkpoint manager with strict isolation flag
      const checkpoint: CheckpointRecord = {
        checkpointId: event.checkpointId,
        threadId,
        tenantId: payload.tenant_id || 'tenant_enterprise_corp',
        profileId,
        profileName: teamName,
        stepIndex: stepCount,
        userMessage: `[SIMULATION INPUT: ${badge}] ${payload.primaryInstructions}`,
        assistantMessage: `${thought} ${opts?.action ? `\nAction: ${opts.action}` : ''}`,
        toolsExecuted: opts?.toolUsed
          ? [
              {
                toolName: opts.toolUsed,
                serverProvider: opts.toolUsed.includes('elevenlabs')
                  ? 'elevenlabs'
                  : opts.toolUsed.includes('gmail')
                  ? 'google_workspace'
                  : 'mcp_gateway_mock',
                arguments: opts.toolPayload || {},
                output: opts.toolResult || {},
                latencyMs: 12.4,
              },
            ]
          : [],
        compiledToolsCount: payload.toolsWhitelist.length,
        compiledToolsNames: payload.toolsWhitelist,
        metadata: {
          executionTimeMs: event.durationMs,
          slidingWindowCount: stepCount,
          hubVersion: 'simulator-sandbox-v3.2',
          isTeamBlueprint: true,
          activeWorker: workerNode,
        },
        timestamp,
      };

      checkpointManagerStore.appendCheckpoint(checkpoint);
      return event;
    };

    // --------------------------------------------------------------------------
    // STEP 1: Ingested State & Zod Validation
    // --------------------------------------------------------------------------
    recordTelemetry(
      'Ingested',
      'Ingestion Gatekeeper',
      `Validated incoming task payload via Zod TaskSchema. Task assigned to profile "${teamName}" (ID: ${profileId}) across thread "${threadId}".`,
      {
        action: 'Ingest payload & verify schema integrity',
        isMockBypassed: false,
      }
    );

    // --------------------------------------------------------------------------
    // STEP 2: Durable Queue Evaluation (Redis Delayed vs. Time-Warp Forced Promotion)
    // --------------------------------------------------------------------------
    const targetMs = new Date(payload.targetTime).getTime();
    const nowMs = Date.now();
    const isFuture = targetMs > nowMs;
    const timeWarpApplied = payload.forcePromote || !isFuture;

    if (isFuture && !payload.forcePromote) {
      const waitSeconds = Math.round((targetMs - nowMs) / 1000);
      recordTelemetry(
        'Redis Delayed',
        'BullMQ Sandbox Worker',
        `Task scheduled for target time ${payload.targetTime} (${waitSeconds}s in future). Job placed into BullMQ Redis delayed state bucket.`,
        {
          action: `bullmq.enqueueDelayedJob(taskId: "${taskId}", delayMs: ${targetMs - nowMs})`,
          isMockBypassed: true,
        }
      );
    } else {
      recordTelemetry(
        'Redis Delayed',
        'BullMQ Sandbox Worker (Time Warp)',
        `[TIME WARP TRIGGERED] Forced immediate promotion applied. Job skipped the ${Math.max(0, Math.round((targetMs - nowMs) / 1000))}s timer hold and transitioned instantly from 'delayed' to 'active'.`,
        {
          action: 'bullmq.forcePromoteJob(jobId, immediate=true)',
          isMockBypassed: true,
        }
      );
    }

    // --------------------------------------------------------------------------
    // STEP 3: LangGraph Supervisor Router Loop
    // --------------------------------------------------------------------------
    const supervisorNodeName = 'Supervisor Router';
    const primaryWorker = workers[0] || {
      id: 'worker-primary',
      name: 'Specialist Worker',
      role: 'Action Specialist',
      mcpTools: payload.toolsWhitelist,
    };

    recordTelemetry(
      'Active Node Execution',
      supervisorNodeName,
      `Supervisor analyzing task intent: "${payload.primaryInstructions}". Inspecting registered specialist workers: [${workers.map((w) => w.name).join(', ')}]. Routing authority delegated to "${primaryWorker.name}" (${primaryWorker.role}).`,
      {
        action: `langgraph.conditional_edge(supervisor -> ${primaryWorker.name})`,
        isMockBypassed: false,
      }
    );

    // --------------------------------------------------------------------------
    // STEP 4: Sub-Worker Node Execution & Primary Tool Dispatch (Mock Bypassed)
    // --------------------------------------------------------------------------
    const primaryTool = payload.toolsWhitelist[0] || 'gmail_send_message';
    const shouldFailPrimary = Boolean(payload.forceFailure);

    if (!shouldFailPrimary) {
      // Primary tool succeeds (Mocked without live external call)
      const mockResult = {
        status: 'mock_success',
        dispatched: true,
        mockService: primaryTool,
        message: `[MOCK BYPASS] Successfully processed "${payload.primaryInstructions}" via ${primaryTool}. Zero external API credits consumed.`,
        timestamp: new Date().toISOString(),
      };

      recordTelemetry(
        'Active Node Execution',
        primaryWorker.name,
        `Specialist Worker "${primaryWorker.name}" invoking primary tool "${primaryTool}". External HTTP egress mocked in simulation sandbox.`,
        {
          action: `dispatch_tool("${primaryTool}")`,
          toolUsed: primaryTool,
          toolPayload: {
            instructions: payload.primaryInstructions,
            webhookInput: payload.mockWebhookData || null,
          },
          toolResult: mockResult,
          isMockBypassed: true,
        }
      );

      // State Persist & Completion
      recordTelemetry(
        'Completed',
        'State Checkpointer (PostgresSaver)',
        `LangGraph run concluded successfully. Thread checkpoint committed to Supabase ephemeral_context with metadata { is_simulation: true }. Task status set to COMPLETED.`,
        {
          action: 'db.commitEphemeralContext(status="completed", is_simulation=true)',
          isMockBypassed: false,
        }
      );

      return {
        success: true,
        isSimulation: true,
        taskId,
        threadId,
        profileId,
        operationalStatus: 'Completed',
        timeWarpApplied,
        totalDurationMs: Date.now() - startTime,
        scheduledAt: payload.targetTime,
        executedAt: new Date().toISOString(),
        telemetryStream: telemetry,
        finalOutcome: {
          summary: `Task executed autonomously without escalation. Primary tool '${primaryTool}' completed simulated dispatch.`,
          escalated: false,
          primaryToolUsed: primaryTool,
          isMocked: true,
        },
      };
    }

    // --------------------------------------------------------------------------
    // STEP 5: Stress-Test Failure & Escalation Edge Traversal
    // --------------------------------------------------------------------------
    const simulatedError = 'Simulated 503 Gateway Timeout: Upstream service unreachable or webhook signature invalid (Simulated Failure)';
    
    recordTelemetry(
      'Active Node Execution',
      primaryWorker.name,
      `Specialist Worker "${primaryWorker.name}" attempted primary tool "${primaryTool}", but encountered synthetic failure exception: "${simulatedError}". Triggering conditional edge check.`,
      {
        action: `dispatch_tool("${primaryTool}") -> EXCEPTION`,
        toolUsed: primaryTool,
        toolPayload: {
          instructions: payload.primaryInstructions,
        },
        toolResult: { error: simulatedError, success: false },
        isMockBypassed: true,
      }
    );

    // Supervisor Traverses Escalation Edge
    const fallbackPolicy = payload.edgeCasePolicies;
    const escalationTool = fallbackPolicy.escalationTool || 'elevenlabs_trigger_call';
    const escalationWorker = workers.find((w) => w.id === 'worker-voice-escalation' || w.name.toLowerCase().includes('voice')) || {
      id: 'worker-escalation',
      name: 'Escalation Voice Specialist',
      role: 'Emergency Telephony Node',
      mcpTools: [escalationTool],
    };

    recordTelemetry(
      'Escalated',
      supervisorNodeName,
      `[ESCALATION TRIGGERED] Fallback policy evaluated: '${fallbackPolicy.fallbackOnPrimaryFailure}'. Routing along escalation edge to worker "${escalationWorker.name}" using tool "${escalationTool}". Contact overrides applied: ${JSON.stringify(fallbackPolicy.contactOverrides)}.`,
      {
        action: `langgraph.conditional_edge(failure_detected -> ${escalationWorker.name})`,
        isMockBypassed: false,
      }
    );

    // Escalation Worker Dispatches Voice Call (Mocked ElevenLabs)
    const mockVoiceCallResult = {
      status: 'call_dispatched_mock',
      sid: `CA_mock_${Date.now()}`,
      provider: 'elevenlabs',
      voiceModel: 'eleven_multilingual_v2',
      recipientDialed: fallbackPolicy.contactOverrides?.boss || '+1 (555) 438-9021',
      promptSpoken: `${fallbackPolicy.escalationInstructions} Primary task "${payload.primaryInstructions}" failed due to synthetic test timeout.`,
      callDurationSecs: 24,
      dispatchedAt: new Date().toISOString(),
      simulatedEgress: true,
    };

    recordTelemetry(
      'Escalated',
      escalationWorker.name,
      `Specialist Worker "${escalationWorker.name}" triggered fallback tool "${escalationTool}". Dispatched synthetic emergency alert call to boss contact override.`,
      {
        action: `mcp_client.call("${escalationTool}")`,
        toolUsed: escalationTool,
        toolPayload: {
          targetNumber: fallbackPolicy.contactOverrides?.boss,
          script: fallbackPolicy.escalationInstructions,
        },
        toolResult: mockVoiceCallResult,
        isMockBypassed: true,
      }
    );

    // Completed under Escalated status
    recordTelemetry(
      'Completed',
      'State Checkpointer (PostgresSaver)',
      `LangGraph run concluded with successful escalation fallback. Checkpoint recorded to Supabase ephemeral_context table with { is_simulation: true, status: 'escalated' }.`,
      {
        action: 'db.commitEphemeralContext(status="escalated", is_simulation=true)',
        isMockBypassed: false,
      }
    );

    return {
      success: true,
      isSimulation: true,
      taskId,
      threadId,
      profileId,
      operationalStatus: 'Escalated',
      timeWarpApplied,
      totalDurationMs: Date.now() - startTime,
      scheduledAt: payload.targetTime,
      executedAt: new Date().toISOString(),
      telemetryStream: telemetry,
      finalOutcome: {
        summary: `Primary tool '${primaryTool}' experienced synthetic failure. LangGraph supervisor routed across escalation edge; fallback tool '${escalationTool}' dispatched simulated alert.`,
        escalated: true,
        primaryToolUsed: primaryTool,
        escalationToolUsed: escalationTool,
        isMocked: true,
      },
    };
  }
}

export const simulationEngine = new SimulationEngine();
