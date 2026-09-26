import { z } from 'zod';

// ==============================================================================
// 1. Zod Validation Schemas for Live LLM Ingestion
// ==============================================================================

export const EdgeCasePoliciesSchema = z.object({
  fallbackOnPrimaryFailure: z.enum(['escalate', 'retry', 'alert', 'abort']).default('escalate'),
  escalationTool: z.string().default('elevenlabs'),
  escalationInstructions: z.string().default('Trigger voice alert call if primary action fails.'),
  contactOverrides: z.record(z.string(), z.string()).default({}),
  maxRetries: z.number().int().min(0).max(5).default(2),
  notifyChannels: z.array(z.string()).default(['slack', 'email']),
});

export const TaskPayloadSchema = z.object({
  taskId: z.string().min(1, 'taskId must be provided (e.g. task-202)'),
  targetTime: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'targetTime must be a valid ISO 8601 timestamp string',
  }),
  primaryInstructions: z.string().min(1, 'primaryInstructions cannot be empty'),
  toolsWhitelist: z.array(z.string()).min(1, 'toolsWhitelist must contain at least one MCP tool'),
  edgeCasePolicies: EdgeCasePoliciesSchema.default({
    fallbackOnPrimaryFailure: 'escalate',
    escalationTool: 'elevenlabs',
    escalationInstructions: 'Trigger voice alert call if primary action fails.',
    contactOverrides: {},
    maxRetries: 2,
    notifyChannels: ['slack'],
  }),
  tenantId: z.string().optional().default('tenant_enterprise_corp'),
  teamId: z.string().optional().default('team_inbound_voice'),
  assignedAgent: z.string().optional().default('Lead Dispatcher'),
  isSimulation: z.boolean().optional().default(false),
});

export type EdgeCasePolicies = z.infer<typeof EdgeCasePoliciesSchema>;
export type TaskPayload = z.infer<typeof TaskPayloadSchema>;

// ==============================================================================
// 2. Ephemeral Context & Task Lifecycle Types
// ==============================================================================

export type TaskStatus =
  | 'scheduled'
  | 'queued'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'escalated'
  | 'cancelled';

export interface NodeTraversalLog {
  node: string;
  enteredAt: string;
  completedAt?: string;
  status: 'pending' | 'success' | 'escalated' | 'failed';
  details?: Record<string, unknown>;
  toolCalls?: Array<{
    tool: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    success: boolean;
    error?: string;
  }>;
}

export interface EphemeralContextRecord {
  id: string;
  taskId: string;
  tenantId: string;
  teamId?: string;
  teamName?: string;
  assignedAgent: string;
  targetTime: string;
  primaryInstructions: string;
  toolsWhitelist: string[];
  edgeCasePolicies: EdgeCasePolicies;
  status: TaskStatus;
  isSimulation?: boolean;
  executionResult?: Record<string, unknown> | null;
  edgeEscalationDetails?: Record<string, unknown> | null;
  nodeTraversalHistory: NodeTraversalLog[];
  errorMessage?: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  executedAt?: string | null;
}

// ==============================================================================
// 3. LangGraph StateGraph Execution State
// ==============================================================================

export interface AgentGraphState {
  taskId: string;
  tenantId: string;
  primaryInstructions: string;
  toolsWhitelist: string[];
  edgeCasePolicies: EdgeCasePolicies;
  currentStep: string;
  primarySuccess: boolean;
  escalationTriggered: boolean;
  intermediateOutputs: Record<string, unknown>;
  toolLogs: Array<{
    tool: string;
    action: string;
    payload: Record<string, unknown>;
    result: Record<string, unknown>;
    timestamp: string;
  }>;
  nodeHistory: NodeTraversalLog[];
  finalOutcome?: {
    summary: string;
    success: boolean;
    escalated: boolean;
    resolutionTool: string;
  };
}
