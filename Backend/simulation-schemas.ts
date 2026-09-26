import { z } from 'zod';

/**
 * Zod schemas for Simulator Mock-Pipeline Ingestion & Execution
 */

export const SimulatorEdgeCasePoliciesSchema = z.object({
  fallbackOnPrimaryFailure: z.enum(['escalate', 'retry', 'alert', 'abort']).default('escalate'),
  escalationTool: z.string().default('elevenlabs_trigger_call'),
  escalationInstructions: z.string().default('Trigger automated voice call briefing if primary task action fails.'),
  contactOverrides: z.record(z.string(), z.string()).default({
    boss: '+1 (555) 438-9021',
    emergency_lead: 'lead-dispatcher@enterprise.corp',
  }),
  maxRetries: z.number().int().min(0).max(5).default(1),
  notifyChannels: z.array(z.string()).default(['slack', 'voice_webhook']),
});

export const SimulationRunPayloadSchema = z.object({
  isSimulation: z.literal(true),
  profile_id: z.string().min(1, 'profile_id must be assigned to an Agent Team Blueprint or Profile'),
  thread_id: z.string().min(1, 'thread_id is required for checkpoint state isolation'),
  tenant_id: z.string().optional().default('tenant_enterprise_corp'),
  taskId: z.string().optional(),
  targetTime: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'targetTime must be a valid ISO 8601 timestamp string',
  }),
  primaryInstructions: z.string().min(3, 'primaryInstructions must be specified'),
  toolsWhitelist: z.array(z.string()).min(1, 'toolsWhitelist must contain at least one tool'),
  edgeCasePolicies: SimulatorEdgeCasePoliciesSchema.default({
    fallbackOnPrimaryFailure: 'escalate',
    escalationTool: 'elevenlabs_trigger_call',
    escalationInstructions: 'Trigger automated voice call briefing if primary task action fails.',
    contactOverrides: {
      boss: '+1 (555) 438-9021',
    },
    maxRetries: 1,
    notifyChannels: ['slack'],
  }),
  forcePromote: z.boolean().optional().default(false), // Time-warp: immediate promotion bypassing delay
  forceFailure: z.boolean().optional().default(false), // Stress-test: simulate primary tool failure to verify edge escalation
  mockWebhookData: z.record(z.string(), z.any()).optional(), // e.g. ElevenLabs post-call transcript, Stripe webhook, CRM event
});

export type SimulationRunPayload = z.infer<typeof SimulationRunPayloadSchema>;

export type QueueOperationalBadge =
  | 'Ingested'
  | 'Redis Delayed'
  | 'Active Node Execution'
  | 'Escalated'
  | 'Completed';

export interface SimulationTelemetryEvent {
  id: string;
  timestamp: string;
  queueBadge: QueueOperationalBadge;
  profileId: string;
  threadId: string;
  subWorkerNode: string; // The explicit sub-worker or supervisor router node in command
  thought: string;
  action?: string;
  toolUsed?: string;
  toolPayload?: Record<string, any>;
  toolResult?: Record<string, any>;
  isMockBypassed: boolean;
  checkpointId: string;
  stepIndex: number;
  durationMs: number;
}

export interface SimulationRunResult {
  success: boolean;
  isSimulation: true;
  taskId: string;
  threadId: string;
  profileId: string;
  operationalStatus: QueueOperationalBadge;
  timeWarpApplied: boolean;
  totalDurationMs: number;
  scheduledAt: string;
  executedAt: string;
  telemetryStream: SimulationTelemetryEvent[];
  finalOutcome: {
    summary: string;
    escalated: boolean;
    primaryToolUsed: string;
    escalationToolUsed?: string;
    isMocked: boolean;
  };
}
