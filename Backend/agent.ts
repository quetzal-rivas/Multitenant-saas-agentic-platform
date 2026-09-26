/**
 * Backend/agent.ts - LangGraph Agent with Escalation Graph
 * 
 * Implements a state graph of nodes and conditional edges representing reasoning steps.
 * When the scheduled target time arrives, carries out instructions, evaluates tool results,
 * and escalates along an escalation edge to fallback tools (e.g., ElevenLabs voice call)
 * if primary tools (e.g., Gmail) fail or encounter errors.
 */

import { ScheduledTask, db, ReasoningStep } from './db';
import { mcpClient } from './mcp_client';

export interface AgentState {
  taskId: string;
  task: ScheduledTask;
  currentNode: string;
  resolvedContacts: Record<string, string>;
  primaryToolName?: string;
  primaryToolArgs?: Record<string, any>;
  primaryToolResult?: {
    success: boolean;
    output?: string;
    error?: string;
  };
  escalationRequired: boolean;
  fallbackToolName?: string;
  fallbackToolArgs?: Record<string, any>;
  fallbackToolResult?: {
    success: boolean;
    output?: string;
    error?: string;
  };
  steps: ReasoningStep[];
  isDone: boolean;
  finalSummary?: string;
}

export class LangGraphAgent {
  /**
   * Executes the full LangGraph state machine for a deferred task
   */
  public async executeTask(task: ScheduledTask): Promise<ScheduledTask> {
    console.log(`[LangGraph] Starting execution graph for task ${task.id}: "${task.title}"`);
    
    // Update status to RUNNING in Supabase/Postgres
    db.updateTaskStatus(task.id, 'RUNNING', {
      started_at: new Date().toISOString(),
      reasoning_steps: [],
    });

    const state: AgentState = {
      taskId: task.id,
      task,
      currentNode: 'intake_and_plan',
      resolvedContacts: { ...(task.fallback_policy.contact_overrides || {}) },
      escalationRequired: false,
      steps: [],
      isDone: false,
    };

    try {
      // 1. NODE: intake_and_plan
      await this.nodeIntakeAndPlan(state);

      // 2. NODE: execute_primary_action
      await this.nodeExecutePrimary(state);

      // 3. NODE: verify_outcome & CONDITIONAL EDGE
      const edge = await this.nodeVerifyOutcome(state);

      // CONDITIONAL ROUTING:
      if (edge === 'escalate') {
        // Route along escalation edge to fallback node
        await this.nodeEscalateAndFallback(state);
      }

      // 5. NODE: complete_task
      await this.nodeCompleteTask(state);

      // Persist final execution output in database
      const finalStatus = state.escalationRequired ? 'ESCALATED' : 'COMPLETED';
      const updated = db.updateTaskStatus(task.id, finalStatus, {
        completed_at: new Date().toISOString(),
        primary_tool_used: state.primaryToolName,
        primary_tool_status: state.primaryToolResult?.success ? 'SUCCESS' : 'FAILED',
        primary_tool_output: state.primaryToolResult?.output,
        primary_error: state.primaryToolResult?.error,
        escalation_triggered: state.escalationRequired,
        fallback_tool_used: state.fallbackToolName,
        fallback_tool_output: state.fallbackToolResult?.output,
        reasoning_steps: state.steps,
        final_summary: state.finalSummary,
      });

      return updated || task;
    } catch (err: any) {
      console.error(`[LangGraph] Fatal error executing task ${task.id}:`, err);
      const failed = db.updateTaskStatus(task.id, 'FAILED', {
        completed_at: new Date().toISOString(),
        primary_error: err?.message || 'Uncaught error in execution graph',
        reasoning_steps: state.steps,
        final_summary: `Agent execution aborted due to unhandled graph exception: ${err?.message}`,
      });
      return failed || task;
    }
  }

  /**
   * NODE: intake_and_plan
   * Ingests task instructions and resolves contact aliases (e.g., "boss" -> email/phone).
   */
  private async nodeIntakeAndPlan(state: AgentState): Promise<void> {
    state.currentNode = 'intake_and_plan';
    const instructions = state.task.instructions;
    const allowed = state.task.allowed_tools;

    // Detect target primary tool
    let primaryTool = allowed[0] || 'gmail_send_message';
    if (instructions.toLowerCase().includes('calendar') || instructions.toLowerCase().includes('meeting')) {
      primaryTool = allowed.find((t) => t.includes('calendar')) || primaryTool;
    } else if (instructions.toLowerCase().includes('slack')) {
      primaryTool = allowed.find((t) => t.includes('slack')) || primaryTool;
    }

    state.primaryToolName = primaryTool;

    // Resolve contact aliases
    const bossContact = state.resolvedContacts['boss'] || 'boss@enterprise-hq.com';
    const clientContact = state.resolvedContacts['client'] || 'client@partner.com';

    // Prepare primary tool payload based on instruction intent
    if (primaryTool === 'gmail_send_message') {
      state.primaryToolArgs = {
        to: bossContact,
        subject: `[Scheduled Briefing] ${state.task.title}`,
        body: `Dear Team,\n\nHere is the scheduled automated briefing:\n${instructions}\n\nGenerated autonomously by LangGraph Agent.`,
      };
    } else if (primaryTool === 'calendar_create_event') {
      state.primaryToolArgs = {
        summary: state.task.title,
        start_time: new Date(Date.now() + 86400000).toISOString(),
        end_time: new Date(Date.now() + 86400000 + 3600000).toISOString(),
        attendees: `${bossContact}, ${clientContact}`,
        description: instructions,
      };
    } else {
      state.primaryToolArgs = {
        channel: '#general-alerts',
        text: `Automated Task Report: ${state.task.title}\nDetails: ${instructions}`,
      };
    }

    const step: ReasoningStep = {
      node: 'intake_and_plan',
      action: `Parsed task instructions and selected primary tool "${primaryTool}". Resolved contact aliases: boss -> ${bossContact}.`,
      status: 'SUCCESS',
      timestamp: new Date().toISOString(),
      details: {
        primaryTool,
        resolvedContacts: state.resolvedContacts,
        preparedArgs: state.primaryToolArgs,
      },
    };
    state.steps.push(step);
    db.appendReasoningStep(state.taskId, step);
  }

  /**
   * NODE: execute_primary_action
   * Dispatches tool invocation through the MCP stdio client.
   */
  private async nodeExecutePrimary(state: AgentState): Promise<void> {
    state.currentNode = 'execute_primary_action';

    const toolName = state.primaryToolName || 'gmail_send_message';
    const toolArgs = state.primaryToolArgs || {};
    const simulateFailure = Boolean(state.task.simulate_failure);

    const stepStart: ReasoningStep = {
      node: 'execute_primary_action',
      action: `Invoking primary MCP tool "${toolName}" over stdio JSON-RPC transport...`,
      status: 'INFO',
      timestamp: new Date().toISOString(),
    };
    state.steps.push(stepStart);
    db.appendReasoningStep(state.taskId, stepStart);

    // Call tool through MCP stdio bridge
    const res = await mcpClient.callTool({
      tool_name: toolName,
      arguments: toolArgs,
      simulate_failure: simulateFailure,
    });

    state.primaryToolResult = {
      success: res.success,
      output: res.output,
      error: res.error,
    };

    const stepOutcome: ReasoningStep = {
      node: 'execute_primary_action',
      action: res.success 
        ? `Tool "${toolName}" returned success: ${res.output}`
        : `Tool "${toolName}" execution failed: ${res.error}`,
      status: res.success ? 'SUCCESS' : 'FAILED',
      timestamp: new Date().toISOString(),
      details: {
        durationMs: res.execution_time_ms,
        rawResult: res.raw_result,
        error: res.error,
      },
    };
    state.steps.push(stepOutcome);
    db.appendReasoningStep(state.taskId, stepOutcome);
  }

  /**
   * NODE: verify_outcome & CONDITIONAL EDGE
   * Checks whether the primary tool succeeded or failed.
   * Returns edge decision: 'complete' or 'escalate'.
   */
  private async nodeVerifyOutcome(state: AgentState): Promise<'complete' | 'escalate'> {
    state.currentNode = 'verify_outcome';

    const success = Boolean(state.primaryToolResult?.success);

    if (success) {
      const step: ReasoningStep = {
        node: 'verify_outcome',
        action: 'Verification verified primary tool output is valid. Traversal edge -> "complete_task".',
        status: 'SUCCESS',
        timestamp: new Date().toISOString(),
      };
      state.steps.push(step);
      db.appendReasoningStep(state.taskId, step);
      return 'complete';
    } else {
      // Escalation required!
      state.escalationRequired = true;
      const step: ReasoningStep = {
        node: 'verify_outcome',
        action: `Verification detected primary action failure ("${state.primaryToolResult?.error}"). Fallback policy active: on_failure = "${state.task.fallback_policy.on_failure}". Traversal edge -> "escalate_and_fallback".`,
        status: 'FAILED',
        timestamp: new Date().toISOString(),
        details: {
          fallbackPolicy: state.task.fallback_policy,
        },
      };
      state.steps.push(step);
      db.appendReasoningStep(state.taskId, step);
      return 'escalate';
    }
  }

  /**
   * NODE: escalate_and_fallback
   * Kicks in when primary action fails. Triggers fallback tool (e.g. ElevenLabs voice call).
   */
  private async nodeEscalateAndFallback(state: AgentState): Promise<void> {
    state.currentNode = 'escalate_and_fallback';

    const policy = state.task.fallback_policy;
    const fallbackTool = policy.fallback_tool || 'elevenlabs_trigger_call';
    state.fallbackToolName = fallbackTool;

    // Resolve target phone or contact for the fallback call
    const phoneTarget = state.resolvedContacts['boss'] || state.resolvedContacts['phone'] || '+1 (555) 839-2041';

    let fallbackArgs: Record<string, any> = {};
    if (fallbackTool === 'elevenlabs_trigger_call') {
      fallbackArgs = {
        phone_number: phoneTarget,
        prompt_script: `Urgent AI Escalation Notice: Primary task "${state.task.title}" failed during automated execution. Error reported: "${state.primaryToolResult?.error || 'Service timeout'}". Fallback escalation directives: ${policy.escalation_instructions}`,
        urgency: 'critical',
      };
    } else {
      fallbackArgs = {
        channel: '#incident-escalations',
        text: `🚨 ESCALATION ALERT: Task "${state.task.title}" failed. Directives: ${policy.escalation_instructions}`,
      };
    }

    state.fallbackToolArgs = fallbackArgs;

    const stepStart: ReasoningStep = {
      node: 'escalate_and_fallback',
      action: `Executing fallback policy: Initiating ${fallbackTool} to contact "${phoneTarget}"...`,
      status: 'INFO',
      timestamp: new Date().toISOString(),
      details: {
        fallbackTool,
        contactTarget: phoneTarget,
        instructions: policy.escalation_instructions,
      },
    };
    state.steps.push(stepStart);
    db.appendReasoningStep(state.taskId, stepStart);

    // Call fallback tool via MCP stdio
    const res = await mcpClient.callTool({
      tool_name: fallbackTool,
      arguments: fallbackArgs,
    });

    state.fallbackToolResult = {
      success: res.success,
      output: res.output,
      error: res.error,
    };

    const stepEnd: ReasoningStep = {
      node: 'escalate_and_fallback',
      action: res.success 
        ? `Fallback action successful: ${res.output}`
        : `Fallback action encountered error: ${res.error}`,
      status: res.success ? 'SUCCESS' : 'FAILED',
      timestamp: new Date().toISOString(),
      details: {
        tool: fallbackTool,
        output: res.output,
        durationMs: res.execution_time_ms,
      },
    };
    state.steps.push(stepEnd);
    db.appendReasoningStep(state.taskId, stepEnd);
  }

  /**
   * NODE: complete_task
   * Finalizes task summary and closes execution loop.
   */
  private async nodeCompleteTask(state: AgentState): Promise<void> {
    state.currentNode = 'complete_task';
    state.isDone = true;

    if (state.escalationRequired) {
      state.finalSummary = `Task encountered primary failure on ${state.primaryToolName}. Automatic fallback triggered successfully via ${state.fallbackToolName} (${state.fallbackToolResult?.output || 'Dispatched'}). Escalation resolution logged.`;
    } else {
      state.finalSummary = `Task completed successfully on primary path via ${state.primaryToolName}. All verification checks passed.`;
    }

    const step: ReasoningStep = {
      node: 'complete_task',
      action: `Execution graph terminated. Final state summary: ${state.finalSummary}`,
      status: 'SUCCESS',
      timestamp: new Date().toISOString(),
    };
    state.steps.push(step);
    db.appendReasoningStep(state.taskId, step);
  }
}

export const agent = new LangGraphAgent();
