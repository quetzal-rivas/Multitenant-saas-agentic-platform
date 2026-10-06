// ==============================================================================
// Execution Layer (src/agent.ts) - LangGraph StateGraph Agent Node Execution
// With Automatic Edge Escalation Handling (e.g. Gmail fallback -> ElevenLabs)
// ==============================================================================

import { mcpClient } from './mcp_client';
import { taskDb } from './db';
import { EphemeralContextRecord, NodeTraversalLog, AgentGraphState } from './types';

export class DeferredTaskAgentRunner {
  /**
   * Run the LangGraph StateGraph workflow for a scheduled task
   */
  public async executeTaskGraph(
    task: EphemeralContextRecord,
    options?: { forceFailure?: boolean }
  ): Promise<AgentGraphState> {
    const taskId = task.taskId;
    const now = new Date().toISOString();

    // Initialize Graph State
    const state: AgentGraphState = {
      taskId,
      tenantId: task.tenantId,
      primaryInstructions: task.primaryInstructions,
      toolsWhitelist: task.toolsWhitelist,
      edgeCasePolicies: task.edgeCasePolicies,
      currentStep: 'ingest_task',
      primarySuccess: false,
      escalationTriggered: false,
      intermediateOutputs: {},
      toolLogs: [],
      nodeHistory: [],
    };

    // Update DB status to 'executing'
    await taskDb.updateTaskStatus(taskId, 'executing', { executedAt: now });

    // --------------------------------------------------------------------------
    // Node 1: ingest_task
    // --------------------------------------------------------------------------
    const ingestStart = new Date().toISOString();
    state.currentStep = 'ingest_task';
    const ingestLog: NodeTraversalLog = {
      node: 'ingest_task',
      enteredAt: ingestStart,
      completedAt: new Date().toISOString(),
      status: 'success',
      details: {
        toolsWhitelisted: task.toolsWhitelist,
        targetTime: task.targetTime,
        fallbackStrategy: task.edgeCasePolicies.fallbackOnPrimaryFailure,
      },
    };
    state.nodeHistory.push(ingestLog);
    await taskDb.updateTaskStatus(taskId, 'executing', {}, ingestLog);

    // --------------------------------------------------------------------------
    // Node 2: execute_primary_node
    // --------------------------------------------------------------------------
    const primaryStart = new Date().toISOString();
    state.currentStep = 'execute_primary_node';
    const primaryTool = task.toolsWhitelist[0] || 'gmail';

    // Dispatch primary tool via MCP client wrapper
    const primaryResult = await mcpClient.executeTool(primaryTool, 'run_primary_directive', {
      instructions: task.primaryInstructions,
      recipient: task.edgeCasePolicies.contactOverrides?.boss || 'executive@company.com',
      forceFailure: options?.forceFailure,
    });

    state.toolLogs.push({
      tool: primaryTool,
      action: primaryResult.action,
      payload: { instructions: task.primaryInstructions },
      result: primaryResult.data,
      timestamp: new Date().toISOString(),
    });

    const primaryLog: NodeTraversalLog = {
      node: 'execute_primary_node',
      enteredAt: primaryStart,
      completedAt: new Date().toISOString(),
      status: primaryResult.success ? 'success' : 'failed',
      details: {
        tool: primaryTool,
        success: primaryResult.success,
        error: primaryResult.error,
        data: primaryResult.data,
      },
    };
    state.nodeHistory.push(primaryLog);

    // --------------------------------------------------------------------------
    // Conditional Edge: check_primary_outcome
    // --------------------------------------------------------------------------
    if (primaryResult.success) {
      state.primarySuccess = true;
      state.finalOutcome = {
        summary: `Primary directive executed successfully via MCP tool '${primaryTool}'.`,
        success: true,
        escalated: false,
        resolutionTool: primaryTool,
      };

      // Node: persist_ephemeral_context
      const persistLog: NodeTraversalLog = {
        node: 'persist_ephemeral_context',
        enteredAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: 'success',
        details: { targetTable: 'public.ephemeral_context', outcome: 'completed' },
      };
      state.nodeHistory.push(persistLog);

      await taskDb.updateTaskStatus(
        taskId,
        'completed',
        {
          executionResult: primaryResult.data,
          errorMessage: null,
        },
        persistLog
      );

      return state;
    }

    // --------------------------------------------------------------------------
    // Edge Escalation Handling: If Primary Failed -> Node: edge_escalation_node
    // --------------------------------------------------------------------------
    state.primarySuccess = false;
    state.escalationTriggered = true;
    state.currentStep = 'edge_escalation_node';

    const escalationStart = new Date().toISOString();
    const escalationTool = task.edgeCasePolicies.escalationTool || 'elevenlabs';
    const escalationInstructions =
      task.edgeCasePolicies.escalationInstructions ||
      'Primary delivery failed. Dispatching voice briefing alert.';

    // Execute edge escalation via MCP client (e.g. ElevenLabs Voice Call)
    const escalationResult = await mcpClient.executeTool(
      escalationTool,
      'trigger_escalation_voice_call',
      {
        escalationInstructions,
        contactOverrides: task.edgeCasePolicies.contactOverrides,
        primaryError: primaryResult.error,
      }
    );

    state.toolLogs.push({
      tool: escalationTool,
      action: escalationResult.action,
      payload: { instructions: escalationInstructions },
      result: escalationResult.data,
      timestamp: new Date().toISOString(),
    });

    const escalationLog: NodeTraversalLog = {
      node: 'edge_escalation_node',
      enteredAt: escalationStart,
      completedAt: new Date().toISOString(),
      status: 'escalated',
      details: {
        triggerReason: primaryResult.error || 'Primary tool execution failed',
        escalationTool,
        contactOverrides: task.edgeCasePolicies.contactOverrides,
        dispatchedCallData: escalationResult.data,
      },
    };
    state.nodeHistory.push(escalationLog);

    state.finalOutcome = {
      summary: `Primary tool '${primaryTool}' encountered exception. Edge escalation node successfully engaged '${escalationTool}' voice alert dispatch.`,
      success: true,
      escalated: true,
      resolutionTool: escalationTool,
    };

    // --------------------------------------------------------------------------
    // Final Node: persist_ephemeral_context
    // --------------------------------------------------------------------------
    const persistLog: NodeTraversalLog = {
      node: 'persist_ephemeral_context',
      enteredAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'success',
      details: { targetTable: 'public.ephemeral_context', outcome: 'escalated' },
    };
    state.nodeHistory.push(persistLog);

    await taskDb.updateTaskStatus(
      taskId,
      'escalated',
      {
        executionResult: {
          primaryTool,
          primaryError: primaryResult.error,
        },
        edgeEscalationDetails: {
          escalationTool,
          instructions: escalationInstructions,
          contactOverrides: task.edgeCasePolicies.contactOverrides,
          callData: escalationResult.data,
          resolvedAt: new Date().toISOString(),
        },
        errorMessage: primaryResult.error,
      },
      escalationLog
    );

    return state;
  }
}

export const agentRunner = new DeferredTaskAgentRunner();
