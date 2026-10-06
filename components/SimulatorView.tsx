'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Terminal,
  FastForward,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Radio,
  Clock,
  Layers,
  Sparkles,
  Bot,
  User,
  ShieldCheck,
  Zap,
  Code2,
  Activity,
  ChevronRight,
  Copy,
  Check,
  Cpu,
  ArrowUpRight,
  Database,
  Filter,
  Users,
  Calendar,
  Trash2,
  Maximize2,
  SlidersHorizontal,
} from 'lucide-react';
import { ContextProfile } from '@/lib/types';
import {
  QueueOperationalBadge,
  SimulationTelemetryEvent,
  SimulationRunResult,
} from '@/lib/demo/legacy_mocks/simulation-schemas';

interface SimulatorViewProps {
  profiles?: ContextProfile[];
  initialProfile?: ContextProfile;
  onOpenTeamBuilder?: () => void;
  onOpenCalendar?: () => void;
}

interface TeamBlueprintOption {
  id: string;
  name: string;
  workersCount: number;
  routingStrategy: string;
  supervisorPrompt?: string;
  workers: Array<{ id: string; name: string; role: string; mcpTools: string[] }>;
}

export const SimulatorView: React.FC<SimulatorViewProps> = ({
  profiles = [],
  initialProfile,
  onOpenTeamBuilder,
  onOpenCalendar,
}) => {
  // Available Team Profiles / Blueprints
  const [teams, setTeams] = useState<TeamBlueprintOption[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);

  // LEFT PANEL - Configurator States
  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    initialProfile?.id || 'team_sales_pipeline'
  );
  const [threadId, setThreadId] = useState<string>(() => `sim_thread_${Date.now().toString(36)}`);
  const [targetTime, setTargetTime] = useState<string>(() => {
    // Default to +20 minutes in future to allow testing Redis Delayed & Time Warp
    const future = new Date(Date.now() + 1000 * 60 * 20);
    return future.toISOString().slice(0, 16);
  });
  const [simulateFailure, setSimulateFailure] = useState<boolean>(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('elevenlabs_webhook');

  // JSON Webhook / Task Payload Code Editor
  const [jsonPayloadString, setJsonPayloadString] = useState<string>(() =>
    JSON.stringify(
      {
        isSimulation: true,
        targetTime: new Date(Date.now() + 1000 * 60 * 20).toISOString(),
        primaryInstructions:
          'Review inbound call recording transcript and sync deal update to CRM pipeline. If delivery fails, trigger emergency voice alert to sales lead.',
        toolsWhitelist: ['hubspot_search_contact', 'gmail_send_message', 'elevenlabs_trigger_call'],
        edgeCasePolicies: {
          fallbackOnPrimaryFailure: 'escalate',
          escalationTool: 'elevenlabs_trigger_call',
          escalationInstructions: 'Trigger voice call briefing if primary action fails.',
          contactOverrides: {
            boss: '+1 (555) 438-9021',
            lead_dispatcher: 'lead-dispatcher@enterprise.corp',
          },
          maxRetries: 1,
          notifyChannels: ['slack', 'voice_webhook'],
        },
        mockWebhookData: {
          webhookSource: 'elevenlabs.conversational_ai.post_call',
          callId: 'call_el_99382104',
          callerPhoneNumber: '+1 (555) 782-9011',
          callerName: 'Sarah Jenkins',
          company: 'Acme Enterprise Retail',
          sentiment: 'High Purchase Intent',
          callDurationSeconds: 194,
          transcriptExcerpt:
            'Customer requested enterprise quota pricing for 500 seats and scheduled follow-up proposal for Monday 10am.',
        },
      },
      null,
      2
    )
  );

  const [jsonError, setJsonError] = useState<string | null>(null);

  // RIGHT PANEL - Live Trace Terminal States
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeOperationalBadge, setActiveOperationalBadge] = useState<QueueOperationalBadge | null>(null);
  const [telemetryEvents, setTelemetryEvents] = useState<SimulationTelemetryEvent[]>([]);
  const [simulationResult, setSimulationResult] = useState<SimulationRunResult | null>(null);
  const [filterBadge, setFilterBadge] = useState<string>('ALL');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);

  const terminalBottomRef = useRef<HTMLDivElement>(null);

  // Load team blueprints
  useEffect(() => {
    let isMounted = true;
    const fetchTeams = async () => {
      try {
        setLoadingTeams(true);
        // The workspace comes from the session cookie; the server never reads a tenant from the URL.
        const res = await fetch('/api/v1/agent-teams');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data.teams) && data.teams.length > 0) {
            const formatted: TeamBlueprintOption[] = data.teams.map((t: any) => ({
              id: t.id,
              name: t.name,
              workersCount: t.worker_count ?? 0,
              routingStrategy: t.routing_strategy || 'supervisor_router',
              supervisorPrompt: t.supervisor_instructions ?? undefined,
              workers: [],
            }));
            setTeams(formatted);
            setSelectedProfileId((prev) => (formatted.some((t) => t.id === prev) ? prev : formatted[0].id));
          }
        }
      } catch (e) {
        console.warn('Could not load dynamic teams, using fallback blueprints:', e);
      } finally {
        if (isMounted) setLoadingTeams(false);
      }
    };

    fetchTeams();
    return () => {
      isMounted = false;
    };
  }, []);

  // Auto-scroll terminal when new telemetry events stream in
  useEffect(() => {
    if (autoScroll && terminalBottomRef.current) {
      terminalBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [telemetryEvents, autoScroll]);

  // Preset templates for tenant sandbox testing
  const applyPresetTemplate = (templateType: string) => {
    setSelectedTemplate(templateType);
    const futureIso = new Date(Date.now() + 1000 * 60 * 25).toISOString();

    if (templateType === 'elevenlabs_webhook') {
      setJsonPayloadString(
        JSON.stringify(
          {
            isSimulation: true,
            targetTime: futureIso,
            primaryInstructions:
              'Parse ElevenLabs post-call transcript and dispatch customer summary via Gmail. If delivery encounters an SMTP timeout, trigger voice call escalation to regional sales boss.',
            toolsWhitelist: ['gmail_send_message', 'elevenlabs_trigger_call', 'hubspot_search_contact'],
            edgeCasePolicies: {
              fallbackOnPrimaryFailure: 'escalate',
              escalationTool: 'elevenlabs_trigger_call',
              escalationInstructions: 'Voice call executive lead if Gmail dispatch fails.',
              contactOverrides: {
                boss: '+1 (555) 438-9021',
              },
              maxRetries: 1,
              notifyChannels: ['slack'],
            },
            mockWebhookData: {
              event: 'elevenlabs.call.completed',
              call_id: 'call_sim_4492',
              duration_seconds: 142,
              caller: 'Elena Rostova',
              sentiment: 'Positive',
              transcript:
                'Client verified security requirements and agreed to schedule quarterly briefing. Follow-up email requested with quote.',
            },
          },
          null,
          2
        )
      );
    } else if (templateType === 'stripe_dispute') {
      setJsonPayloadString(
        JSON.stringify(
          {
            isSimulation: true,
            targetTime: futureIso,
            primaryInstructions:
              'Audit chargeback dispute from Stripe webhook and notify finance team Slack. Fallback to voice dispatch if Slack delivery fails.',
            toolsWhitelist: ['stripe_verify_charge', 'slack_post_message', 'elevenlabs_trigger_call'],
            edgeCasePolicies: {
              fallbackOnPrimaryFailure: 'escalate',
              escalationTool: 'elevenlabs_trigger_call',
              escalationInstructions: 'Trigger voice call to Head of Finance if alert not acknowledged.',
              contactOverrides: {
                boss: '+1 (555) 883-1199',
              },
              maxRetries: 2,
              notifyChannels: ['slack'],
            },
            mockWebhookData: {
              event: 'charge.dispute.created',
              charge_id: 'ch_sim_391024',
              amount_usd: 12500,
              reason: 'unrecognized_subscription',
              customer_email: 'finance@megacorp.io',
            },
          },
          null,
          2
        )
      );
    } else if (templateType === 'crm_pipeline_sync') {
      setJsonPayloadString(
        JSON.stringify(
          {
            isSimulation: true,
            targetTime: futureIso,
            primaryInstructions:
              'Synchronize HubSpot enterprise deal stages and dispatch automated calendar invitations for final signing ceremony.',
            toolsWhitelist: ['hubspot_search_contact', 'google_calendar_schedule', 'elevenlabs_trigger_call'],
            edgeCasePolicies: {
              fallbackOnPrimaryFailure: 'escalate',
              escalationTool: 'elevenlabs_trigger_call',
              escalationInstructions: 'Voice alert CRO if contract signature link fails to generate.',
              contactOverrides: {
                boss: '+1 (555) 991-3322',
              },
              maxRetries: 1,
              notifyChannels: ['slack'],
            },
            mockWebhookData: {
              event: 'hubspot.deal.stage_change',
              deal_id: 'deal_99482',
              deal_name: 'Vance Logistics Expansion',
              amount: 48000,
              new_stage: 'Contract Sent',
            },
          },
          null,
          2
        )
      );
    }
    setJsonError(null);
  };

  // Execute simulation against backend
  const handleExecuteSimulation = async (forcePromote: boolean = false) => {
    setJsonError(null);
    let parsed: any;

    try {
      parsed = JSON.parse(jsonPayloadString);
    } catch (err: any) {
      setJsonError(`JSON Syntax Error: ${err.message}`);
      return;
    }

    // Enforce optimistic initial feedback
    setIsRunning(true);
    setTelemetryEvents([]);
    setSimulationResult(null);

    // Initial optimistic event
    const optimisticInitial: SimulationTelemetryEvent = {
      id: `opt_evt_${Date.now()}`,
      timestamp: new Date().toISOString(),
      queueBadge: 'Ingested',
      profileId: selectedProfileId,
      threadId,
      subWorkerNode: 'Ingestion Gatekeeper',
      thought: `[OPTIMISTIC DISPATCH] Simulation payload dispatched to /api/v1/simulation/run with { isSimulation: true, forcePromote: ${forcePromote} }.`,
      action: 'Validating payload and routing to sandbox worker',
      isMockBypassed: false,
      checkpointId: `chk_opt_${Date.now()}`,
      stepIndex: 1,
      durationMs: 0,
    };
    setTelemetryEvents([optimisticInitial]);
    setActiveOperationalBadge('Ingested');

    const payload = {
      ...parsed,
      isSimulation: true,
      profile_id: selectedProfileId,
      thread_id: threadId,
      targetTime: parsed.targetTime || new Date(targetTime).toISOString(),
      forcePromote,
      forceFailure: simulateFailure,
    };

    try {
      const response = await fetch('/api/v1/simulation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      const data: SimulationRunResult = await response.json();
      setSimulationResult(data);
      setActiveOperationalBadge(data.operationalStatus);

      if (data.telemetryStream && data.telemetryStream.length > 0) {
        setTelemetryEvents(data.telemetryStream);
      }
    } catch (err: any) {
      console.error('Simulation error:', err);
      const failureEvt: SimulationTelemetryEvent = {
        id: `err_evt_${Date.now()}`,
        timestamp: new Date().toISOString(),
        queueBadge: 'Escalated',
        profileId: selectedProfileId,
        threadId,
        subWorkerNode: 'System Sandbox Monitor',
        thought: `Simulation execution error: ${err.message}`,
        action: 'Report client exception',
        isMockBypassed: false,
        checkpointId: `chk_err_${Date.now()}`,
        stepIndex: 2,
        durationMs: 120,
      };
      setTelemetryEvents((prev) => [...prev, failureEvt]);
      setActiveOperationalBadge('Escalated');
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopyLogs = () => {
    if (telemetryEvents.length === 0) return;
    const text = telemetryEvents
      .map(
        (e) =>
          `[${e.timestamp}] [${e.queueBadge}] [Profile: ${e.profileId}] [Node: ${e.subWorkerNode}]\n` +
          `Thought: ${e.thought}\n` +
          (e.action ? `Action: ${e.action}\n` : '') +
          (e.toolUsed ? `Tool: ${e.toolUsed} (Mock Bypassed: ${e.isMockBypassed})\n` : '') +
          '------------------------------------------------------------'
      )
      .join('\n');

    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const handleClearLogs = () => {
    setTelemetryEvents([]);
    setSimulationResult(null);
    setActiveOperationalBadge(null);
  };

  // Badge Color Helper
  const getBadgeStyle = (badge: QueueOperationalBadge) => {
    switch (badge) {
      case 'Ingested':
        return 'bg-blue-950/80 text-blue-300 border-blue-700/80';
      case 'Redis Delayed':
        return 'bg-amber-950/80 text-amber-300 border-amber-700/80 animate-pulse';
      case 'Active Node Execution':
        return 'bg-purple-950/80 text-purple-300 border-purple-700/80';
      case 'Escalated':
        return 'bg-rose-950/90 text-rose-300 border-rose-600 shadow-sm shadow-rose-950';
      case 'Completed':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-600';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  const filteredEvents =
    filterBadge === 'ALL'
      ? telemetryEvents
      : telemetryEvents.filter((e) => e.queueBadge === filterBadge);

  const selectedTeam = teams.find((t) => t.id === selectedProfileId);

  return (
    <div className="w-full h-full min-h-[calc(100vh-3.5rem)] flex flex-col bg-[#07090e] text-zinc-100 font-sans">
      {/* ==================================================================== */}
      {/* FULL-PAGE HEADER & STATUS BAR */}
      {/* ==================================================================== */}
      <div className="px-6 py-4 border-b border-zinc-800/80 bg-[#0a0d14] flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-700 flex items-center justify-center border border-indigo-400/40 text-white shadow-lg shadow-indigo-950/50">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold text-white tracking-tight">
                Agent Team & Queue Simulator
              </h1>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700 font-semibold tracking-wider">
                Full Page Module
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-700/60">
                Zero Cost • Egress Bypassed
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">
              POST /api/v1/simulation/run · LangGraph Supervisor Sandbox · Supabase Checkpoints {'{ is_simulation: true }'}
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-3">
          {activeOperationalBadge && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono font-medium shadow-sm bg-[#0e121c] border-zinc-800">
              <span className="text-zinc-400 text-[11px] uppercase">State:</span>
              <span className={`px-2 py-0.5 rounded border text-[11px] font-bold ${getBadgeStyle(activeOperationalBadge)}`}>
                {activeOperationalBadge}
              </span>
            </div>
          )}

          {onOpenTeamBuilder && (
            <button
              onClick={onOpenTeamBuilder}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-mono border border-zinc-800 transition-colors"
              title="Switch to Team Builder"
            >
              <Users className="w-3.5 h-3.5 text-purple-400" />
              <span>Team Blueprints</span>
            </button>
          )}

          {onOpenCalendar && (
            <button
              onClick={onOpenCalendar}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-mono border border-zinc-800 transition-colors"
              title="Open BullMQ Task Calendar"
            >
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              <span>Queue Calendar</span>
            </button>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MAIN TWO-COLUMN SPLIT PANE (CONFIGURATOR + LIVE TRACE TERMINAL) */}
      {/* ==================================================================== */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* ================================================================== */}
        {/* LEFT COLUMN: THE CONFIGURATOR */}
        {/* ================================================================== */}
        <div className="w-full lg:w-5/12 border-r border-zinc-800/80 bg-[#080b11] flex flex-col overflow-hidden">
          {/* Configurator Header & Preset Selector */}
          <div className="p-4 border-b border-zinc-800/80 bg-[#0c1018] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4" />
                Task Payload & Target Configurator
              </span>
              <span className="text-[11px] text-zinc-500 font-mono">Sandbox Inputs</span>
            </div>

            {/* Template Presets Bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-mono">
              <span className="text-zinc-500 text-[10px] uppercase font-semibold shrink-0">Presets:</span>
              <button
                type="button"
                onClick={() => applyPresetTemplate('elevenlabs_webhook')}
                className={`px-3 py-1 rounded-md text-[11px] border transition-colors shrink-0 ${
                  selectedTemplate === 'elevenlabs_webhook'
                    ? 'bg-indigo-950 text-indigo-200 border-indigo-600 font-medium shadow-sm'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                ElevenLabs Voice Call
              </button>
              <button
                type="button"
                onClick={() => applyPresetTemplate('stripe_dispute')}
                className={`px-3 py-1 rounded-md text-[11px] border transition-colors shrink-0 ${
                  selectedTemplate === 'stripe_dispute'
                    ? 'bg-indigo-950 text-indigo-200 border-indigo-600 font-medium shadow-sm'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                Stripe Dispute Webhook
              </button>
              <button
                type="button"
                onClick={() => applyPresetTemplate('crm_pipeline_sync')}
                className={`px-3 py-1 rounded-md text-[11px] border transition-colors shrink-0 ${
                  selectedTemplate === 'crm_pipeline_sync'
                    ? 'bg-indigo-950 text-indigo-200 border-indigo-600 font-medium shadow-sm'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                CRM Pipeline Sync
              </button>
            </div>
          </div>

          {/* Configurator Form Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Target Agent Team Profile */}
            <div>
              <label className="text-[11px] font-mono font-semibold uppercase text-zinc-400 block mb-1.5 flex items-center justify-between">
                <span>Target Agent Team Profile (`profile_id`)</span>
                <span className="text-zinc-500 font-normal">Team Blueprint</span>
              </label>
              <select
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                className="w-full bg-[#121622] border border-zinc-700/80 rounded-lg px-3.5 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              >
                {teams.length > 0 ? (
                  teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.workersCount} workers · {t.routingStrategy})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="team_sales_pipeline">Autonomous Sales & Executive Pipeline (3 workers)</option>
                    <option value="team_inbound_voice">Inbound Voice & Lead Booking Team (2 workers)</option>
                    <option value="team_support_triage">Customer Support & SLA Escalation (2 workers)</option>
                  </>
                )}
              </select>
              {selectedTeam && (
                <div className="mt-2 p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 text-[11px] text-zinc-400 font-mono space-y-1">
                  <div className="flex items-center justify-between">
                    <span>Supervisor Router Strategy:</span>
                    <span className="text-indigo-300 font-medium">{selectedTeam.routingStrategy}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Specialist Nodes:</span>{' '}
                    <span className="text-zinc-300">
                      {selectedTeam.workers.length > 0
                        ? selectedTeam.workers.map((w) => w.name).join(', ')
                        : `${selectedTeam.workersCount} workers`}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Thread Isolation & Target Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-mono font-semibold uppercase text-zinc-400 block mb-1.5">
                  thread_id (State Isolation)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={threadId}
                    onChange={(e) => setThreadId(e.target.value)}
                    placeholder="e.g. sim_thread_001"
                    className="w-full bg-[#121622] border border-zinc-700/80 rounded-lg px-3.5 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setThreadId(`sim_thread_${Date.now().toString(36)}`)}
                    className="absolute right-2.5 top-2 text-[10px] font-mono text-zinc-500 hover:text-indigo-400"
                    title="Generate fresh thread ID"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-mono font-semibold uppercase text-zinc-400 block mb-1.5">
                  targetTime (Future Queue Hold)
                </label>
                <input
                  type="datetime-local"
                  value={targetTime}
                  onChange={(e) => setTargetTime(e.target.value)}
                  className="w-full bg-[#121622] border border-zinc-700/80 rounded-lg px-3.5 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Stress-Testing Fault Injection Box */}
            <div className="p-3.5 rounded-lg bg-zinc-900/50 border border-zinc-800 space-y-2">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-rose-400" />
                Stress-Test Fault Injection
              </span>
              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={simulateFailure}
                  onChange={(e) => setSimulateFailure(e.target.checked)}
                  className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-rose-500 focus:ring-rose-500"
                />
                <span>
                  Inject Primary Failure Exception{' '}
                  <span className="text-zinc-500 font-mono text-[11px]">(Forces LangGraph Escalation Edge)</span>
                </span>
              </label>
              <p className="text-[11px] text-zinc-400 leading-relaxed font-mono">
                When enabled, the primary specialist tool synthetically throws a 503 timeout to verify ElevenLabs voice call fallback.
              </p>
            </div>

            {/* Rich JSON Code Editor */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-mono font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Task Payload & Mock Webhook JSON</span>
                  <span className="text-emerald-400 font-mono text-[10px]">(Zod Validated)</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(jsonPayloadString);
                      setJsonPayloadString(JSON.stringify(parsed, null, 2));
                      setJsonError(null);
                    } catch (err: any) {
                      setJsonError(err.message);
                    }
                  }}
                  className="text-[11px] font-mono text-indigo-400 hover:text-indigo-300"
                >
                  Format JSON
                </button>
              </div>

              <div className="relative rounded-lg border border-zinc-700/80 bg-[#0a0d14] overflow-hidden focus-within:border-indigo-500">
                <textarea
                  value={jsonPayloadString}
                  onChange={(e) => {
                    setJsonPayloadString(e.target.value);
                    setJsonError(null);
                  }}
                  rows={14}
                  spellCheck={false}
                  className="w-full p-3.5 font-mono text-xs text-emerald-300 bg-transparent resize-y focus:outline-none leading-relaxed"
                />
              </div>

              {jsonError && (
                <p className="mt-2 text-xs text-rose-400 font-mono flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{jsonError}</span>
                </p>
              )}
            </div>
          </div>

          {/* CONTROL OVERLAYS & ACTION BUTTONS */}
          <div className="p-4 border-t border-zinc-800/80 bg-[#0c1018] space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Standard Execution Button */}
              <button
                type="button"
                disabled={isRunning}
                onClick={() => handleExecuteSimulation(false)}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs transition-all border border-zinc-700 disabled:opacity-50"
                title="Schedule task into BullMQ Redis delayed bucket according to targetTime"
              >
                <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                <span>Queue Deferred Task</span>
              </button>

              {/* TIME WARP / FORCE PROMOTE Action Button */}
              <button
                type="button"
                disabled={isRunning}
                onClick={() => handleExecuteSimulation(true)}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-gradient-to-r from-amber-600 via-indigo-600 to-purple-600 hover:from-amber-500 hover:to-purple-500 text-white font-bold text-xs transition-all shadow-lg shadow-indigo-950 disabled:opacity-50 group"
                title="Skip the BullMQ timer hold and execute the LangGraph supervisor immediately"
              >
                <FastForward className="w-4 h-4 text-amber-300 group-hover:scale-110 transition-transform" />
                <span>Time Warp / Force Promote</span>
              </button>
            </div>

            <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono pt-1">
              <span>Memory Isolation: Enabled (Supabase metadata flag)</span>
              <span>Port 3000 Mock Egress</span>
            </div>
          </div>
        </div>

        {/* ================================================================== */}
        {/* RIGHT COLUMN: THE LIVE TRACE TERMINAL */}
        {/* ================================================================== */}
        <div className="w-full lg:w-7/12 bg-[#05070d] flex flex-col overflow-hidden">
          {/* Terminal Header & Operational Controls */}
          <div className="p-4 border-b border-zinc-800/80 bg-[#080c14] flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-zinc-900 flex items-center justify-center text-emerald-400 border border-zinc-800">
                <Terminal className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-zinc-200">
                  Live Telemetry Trace Terminal
                </h2>
                <p className="text-[10px] text-zinc-500 font-mono">
                  PostgresSaver Checkpoints · LangGraph Supervisor Loop · Sub-Worker Traversal
                </p>
              </div>
            </div>

            {/* Filter and Action Buttons */}
            <div className="flex items-center gap-2 text-xs font-mono">
              <Filter className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-[11px] text-zinc-400">Filter:</span>
              <select
                value={filterBadge}
                onChange={(e) => setFilterBadge(e.target.value)}
                className="bg-zinc-900 border border-zinc-700/80 rounded px-2.5 py-1 text-[11px] font-mono text-zinc-200 focus:outline-none"
              >
                <option value="ALL">All States ({telemetryEvents.length})</option>
                <option value="Ingested">Ingested</option>
                <option value="Redis Delayed">Redis Delayed</option>
                <option value="Active Node Execution">Active Node Execution</option>
                <option value="Escalated">Escalated</option>
                <option value="Completed">Completed</option>
              </select>

              <button
                type="button"
                onClick={handleClearLogs}
                disabled={telemetryEvents.length === 0}
                className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 disabled:opacity-40 transition-colors"
                title="Clear terminal trace"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={handleCopyLogs}
                disabled={telemetryEvents.length === 0}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 disabled:opacity-40 transition-colors"
                title="Copy telemetry log"
              >
                {copiedLogs ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Operational State Pipeline Indicator */}
          <div className="px-5 py-2.5 border-b border-zinc-800/60 bg-[#070a10] flex items-center gap-2 overflow-x-auto text-[11px] font-mono shrink-0">
            <span className="text-zinc-500 text-[10px] uppercase font-semibold">State Machine:</span>
            <span
              className={`px-2.5 py-0.5 rounded border transition-colors ${
                activeOperationalBadge === 'Ingested'
                  ? getBadgeStyle('Ingested')
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800'
              }`}
            >
              1. Ingested
            </span>
            <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
            <span
              className={`px-2.5 py-0.5 rounded border transition-colors ${
                activeOperationalBadge === 'Redis Delayed'
                  ? getBadgeStyle('Redis Delayed')
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800'
              }`}
            >
              2. Redis Delayed
            </span>
            <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
            <span
              className={`px-2.5 py-0.5 rounded border transition-colors ${
                activeOperationalBadge === 'Active Node Execution'
                  ? getBadgeStyle('Active Node Execution')
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800'
              }`}
            >
              3. Active Node
            </span>
            <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
            <span
              className={`px-2.5 py-0.5 rounded border transition-colors ${
                activeOperationalBadge === 'Escalated'
                  ? getBadgeStyle('Escalated')
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800'
              }`}
            >
              4. Escalated
            </span>
            <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
            <span
              className={`px-2.5 py-0.5 rounded border transition-colors ${
                activeOperationalBadge === 'Completed'
                  ? getBadgeStyle('Completed')
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800'
              }`}
            >
              5. Completed
            </span>
          </div>

          {/* Live Streaming Terminal Logs Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3.5 font-mono text-xs select-text bg-[#04060b]">
            {filteredEvents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-10 text-zinc-500 space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-zinc-900/80 flex items-center justify-center border border-zinc-800 text-zinc-600">
                  <Terminal className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-base font-semibold text-zinc-300">Ready for Simulation Ingestion</p>
                  <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
                    Select an Agent Team Blueprint on the left, inspect or modify the mock webhook JSON, then click{' '}
                    <span className="text-amber-400 font-semibold">&quot;Time Warp / Force Promote&quot;</span> to test the LangGraph supervisor loop.
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <span className="text-[11px] px-2.5 py-1 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                    Target: {selectedProfileId}
                  </span>
                  <span className="text-[11px] px-2.5 py-1 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                    Thread: {threadId}
                  </span>
                </div>
              </div>
            ) : (
              filteredEvents.map((evt, idx) => (
                <div
                  key={evt.id || idx}
                  className="p-4 rounded-xl bg-[#090d16] border border-zinc-800/80 shadow-md space-y-2.5 hover:border-zinc-700/80 transition-colors"
                >
                  {/* Event Meta Line */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/60 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getBadgeStyle(evt.queueBadge)}`}>
                        {evt.queueBadge}
                      </span>
                      <span className="text-[11px] font-semibold text-purple-300">
                        [{evt.subWorkerNode}]
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                      <span>Profile: <strong className="text-zinc-300">{evt.profileId}</strong></span>
                      <span>+{evt.durationMs}ms</span>
                      <span>{new Date(evt.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  {/* Inner Thought / Reasoning */}
                  <div className="text-zinc-200 text-xs leading-relaxed">
                    <span className="text-zinc-500 select-none mr-2 font-bold">»</span>
                    {evt.thought}
                  </div>

                  {/* Executed Action or Tool Call */}
                  {evt.action && (
                    <div className="p-2.5 rounded bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-300 flex items-center justify-between">
                      <span className="text-indigo-300 font-medium">{evt.action}</span>
                      {evt.isMockBypassed && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                          Mock Bypassed
                        </span>
                      )}
                    </div>
                  )}

                  {/* Tool Result Inspection (if tool executed) */}
                  {evt.toolResult && (
                    <div className="p-3 rounded bg-[#060810] border border-zinc-800/80 text-[11px] font-mono space-y-1.5">
                      <div className="flex items-center justify-between text-zinc-400 text-[10px]">
                        <span>Tool Payload & Output:</span>
                        <span className="text-emerald-400 font-bold">{evt.toolUsed}</span>
                      </div>
                      <pre className="text-zinc-400 text-[10px] overflow-x-auto p-2 bg-black/50 rounded border border-zinc-900">
                        {JSON.stringify(evt.toolResult, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Checkpoint ID */}
                  <div className="flex items-center justify-between text-[10px] text-zinc-600 font-mono pt-1">
                    <span>Checkpoint: {evt.checkpointId}</span>
                    <span>Thread: {evt.threadId}</span>
                  </div>
                </div>
              ))
            )}
            <div ref={terminalBottomRef} />
          </div>

          {/* Bottom Outcome Summary Bar */}
          {simulationResult && (
            <div className="p-4 border-t border-zinc-800/90 bg-[#080b13] flex flex-wrap items-center justify-between gap-4 text-xs font-mono shrink-0">
              <div className="flex items-center gap-2.5">
                {simulationResult.operationalStatus === 'Completed' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                )}
                <span className="text-zinc-200 font-medium">
                  {simulationResult.finalOutcome.summary}
                </span>
              </div>

              <div className="flex items-center gap-4 text-[11px] text-zinc-400">
                <span>
                  Time Warp:{' '}
                  <strong className={simulationResult.timeWarpApplied ? 'text-amber-400' : 'text-zinc-300'}>
                    {simulationResult.timeWarpApplied ? 'ACTIVE' : 'OFF'}
                  </strong>
                </span>
                <span>
                  Duration: <strong className="text-emerald-400">{simulationResult.totalDurationMs}ms</strong>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
