'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { RequestLog, ExecutionStep } from '@/lib/types';
import { getLogs } from '@/lib/data-service';
import { INITIAL_LOGS } from '@/lib/demo';

import {
  ScrollText,
  Search,
  CheckCircle2,
  Clock,
  Zap,
  Layers,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  AlertTriangle,
  RotateCcw,
  Shield,
  ArrowRight,
  Database,
  Bot,
  Workflow,
  Activity,
  PhoneCall,
  Terminal,
  Filter,
  Check,
  Copy,
  Gauge,
  ExternalLink,
  Cpu,
  Flame,
  Radio,
  Sparkles,
} from 'lucide-react';

export const LogsView: React.FC = () => {
  const [logs, setLogs] = useState<RequestLog[]>(INITIAL_LOGS);
  const [selectedLog, setSelectedLog] = useState<RequestLog | null>(INITIAL_LOGS[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('ALL');
  const [profileFilter, setProfileFilter] = useState<string>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    async function loadLogs() {
      const data = await getLogs();
      if (data && data.length > 0) {
        setLogs(data);
        setSelectedLog(data[0]);
      }
    }
    loadLogs();
  }, []);


  // Copy helper
  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Simulate streaming new telemetry log or refreshing
  const handleRefreshStream = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Event type filter
      if (eventTypeFilter !== 'ALL') {
        if (eventTypeFilter === 'LANGGRAPH' && log.eventType !== 'LANGGRAPH_EXECUTION') return false;
        if (eventTypeFilter === 'BULLMQ' && !log.eventType?.startsWith('BULLMQ')) return false;
        if (eventTypeFilter === 'ESCALATION' && log.eventType !== 'ESCALATION_ALERT') return false;
        if (eventTypeFilter === 'HTTP' && log.eventType !== 'HTTP_RESOLVE') return false;
      }

      // Profile filter
      if (profileFilter !== 'ALL' && log.profileSlug !== profileFilter) {
        return false;
      }

      // Search term
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesId = log.id.toLowerCase().includes(query);
        const matchesProfile = log.profileSlug.toLowerCase().includes(query);
        const matchesTenant = log.identity?.tenant_id ? log.identity.tenant_id.toLowerCase().includes(query) : false;
        const matchesInput = JSON.stringify(log.input).toLowerCase().includes(query);
        const matchesThread = log.threadId?.toLowerCase().includes(query) ?? false;
        return matchesId || matchesProfile || matchesTenant || matchesInput || matchesThread;
      }

      return true;
    });
  }, [logs, eventTypeFilter, profileFilter, searchQuery]);

  // Status badge style helper
  const renderStatusBadge = (log: RequestLog) => {
    switch (log.statusLabel) {
      case 'DELAYED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-800/80">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>⏳ Delayed</span>
          </span>
        );
      case 'RETRYING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-950/80 text-sky-300 border border-sky-800/80">
            <RotateCcw className="w-3 h-3 text-sky-400 animate-spin" />
            <span>🔄 Retry ({log.retryAttempt ? `${log.retryAttempt.current}/${log.retryAttempt.max}` : '2/3'})</span>
          </span>
        );
      case 'ESCALATED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950/90 text-rose-300 border border-rose-800">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            <span>🚨 Escalated</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950/80 text-rose-400 border border-rose-800">
            <span>🔴 {log.statusCode}</span>
          </span>
        );
      case 'SUCCESS':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>200 OK</span>
          </span>
        );
    }
  };

  // Event category indicator
  const renderEventCategoryTag = (log: RequestLog) => {
    switch (log.eventType) {
      case 'LANGGRAPH_EXECUTION':
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-purple-950 text-purple-300 border border-purple-800">
            LangGraph Cascade
          </span>
        );
      case 'BULLMQ_DELAYED':
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-amber-950 text-amber-300 border border-amber-800">
            BullMQ Queue
          </span>
        );
      case 'BULLMQ_RETRY':
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-sky-950 text-sky-300 border border-sky-800">
            BullMQ Backoff
          </span>
        );
      case 'ESCALATION_ALERT':
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-rose-950 text-rose-300 border border-rose-800">
            Voice Escalation
          </span>
        );
      case 'HTTP_RESOLVE':
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
            HTTP Sync
          </span>
        );
    }
  };

  // Step Node Icon
  const getStepIcon = (step: ExecutionStep) => {
    switch (step.type) {
      case 'supervisor':
        return <Workflow className="w-3.5 h-3.5 text-purple-400" />;
      case 'worker_agent':
        return <Bot className="w-3.5 h-3.5 text-indigo-400" />;
      case 'mcp_tool':
        return <Terminal className="w-3.5 h-3.5 text-emerald-400" />;
      case 'queue':
        return <Clock className="w-3.5 h-3.5 text-amber-400" />;
      case 'escalation':
        return <PhoneCall className="w-3.5 h-3.5 text-rose-400" />;
      case 'checkpoint':
        return <Database className="w-3.5 h-3.5 text-sky-400" />;
      case 'ingestion':
      default:
        return <Zap className="w-3.5 h-3.5 text-cyan-400" />;
    }
  };

  // Step Status Color
  const getStepStatusBadge = (status: ExecutionStep['status']) => {
    switch (status) {
      case 'completed':
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800">
            ✓ Done
          </span>
        );
      case 'delayed':
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-950/80 text-amber-300 border border-amber-800">
            ⏳ Held in Redis
          </span>
        );
      case 'retrying':
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-sky-950/80 text-sky-300 border border-sky-800">
            🔄 Backoff Jitter
          </span>
        );
      case 'escalated':
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-rose-950/80 text-rose-300 border border-rose-800">
            🚨 Dispatched
          </span>
        );
      case 'bypassed':
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
            Bypassed (OK)
          </span>
        );
      case 'failed':
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-rose-950 text-rose-400 border border-rose-800">
            ✕ Failed
          </span>
        );
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 font-sans">
      {/* ==================================================================== */}
      {/* HEADER & CONTROLS */}
      {/* ==================================================================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
              Request Logs & Multi-Agent Tracing
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700 font-semibold uppercase tracking-wider">
              OpenTelemetry / LangGraph
            </span>
          </div>
          <p className="text-zinc-400 text-sm max-w-3xl">
            Live telemetry of synchronous context resolution, BullMQ delayed job lifecycles, LangGraph node-to-node routing waterfalls, and emergency ElevenLabs voice escalations.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleRefreshStream}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-mono transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Poll Stream</span>
          </button>

          <span className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Live Ephemeral Context Stream</span>
          </span>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* FILTER AND SEARCH BAR */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs font-mono">
        {/* Search */}
        <div className="sm:col-span-5 relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Log ID, Task ID, Tenant ID, or Prompt..."
            className="w-full bg-[#11151e] border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Event Type Filter */}
        <div className="sm:col-span-4 flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            className="w-full bg-[#11151e] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Event Streams ({logs.length})</option>
            <option value="LANGGRAPH">🧠 LangGraph Node Transitions</option>
            <option value="BULLMQ">⏳ BullMQ Queue & Retries</option>
            <option value="ESCALATION">🚨 Escalation & Voice Alerts</option>
            <option value="HTTP">🟢 HTTP Synchronous Requests</option>
          </select>
        </div>

        {/* Persona Profile Filter */}
        <div className="sm:col-span-3">
          <select
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value)}
            className="w-full bg-[#11151e] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Persona Profiles</option>
            <option value="sales-agent">sales-agent (Sales Pipeline)</option>
            <option value="support-agent">support-agent (Support Concierge)</option>
            <option value="executive-copilot">executive-copilot</option>
          </select>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MAIN TWO-COLUMN SPLIT: STREAM LIST & TRACE INSPECTOR WATERFALL */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ================================================================== */}
        {/* LEFT COLUMN: LIVE STREAM LOGS LIST (5 COLS) */}
        {/* ================================================================== */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold px-1">
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <span>Event Stream ({filteredLogs.length})</span>
            </span>
            <span className="text-[10px] text-zinc-500">Sorted by timestamp</span>
          </div>

          <div className="space-y-2.5 max-h-[820px] overflow-y-auto pr-1">
            {filteredLogs.length === 0 ? (
              <div className="p-8 text-center bg-[#11151e] border border-zinc-800 rounded-xl text-zinc-500 font-mono text-xs">
                No logs match the current filters.
              </div>
            ) : (
              filteredLogs.map((log) => {
                const isSelected = selectedLog?.id === log.id;
                const queryText = log.input.query || JSON.stringify(log.input.trigger) || 'No query string provided';
                const hasCascade = Boolean(log.nodeCascade && log.nodeCascade.length > 0);

                return (
                  <div
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2.5 relative overflow-hidden ${
                      isSelected
                        ? 'bg-[#151b27] border-indigo-500/90 shadow-lg shadow-indigo-950/30'
                        : 'bg-[#11151e] hover:bg-[#131722] border-zinc-800/90 hover:border-zinc-700'
                    }`}
                  >
                    {/* Left Accent Stripe when selected */}
                    {isSelected && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500 to-emerald-400" />
                    )}

                    {/* Top row: Status, Event Category, Profile & Timestamp */}
                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2 flex-wrap">
                        {renderStatusBadge(log)}
                        {renderEventCategoryTag(log)}
                      </div>

                      <span className="text-zinc-500 text-[11px] shrink-0">{log.timestamp}</span>
                    </div>

                    {/* Profile & ID row */}
                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white tracking-tight">{log.profileSlug}</span>
                        {log.threadId && (
                          <span className="text-[10px] text-zinc-500 font-normal">
                            #{log.threadId.slice(0, 16)}
                          </span>
                        )}
                      </div>

                      <span className="text-emerald-400 font-semibold">{log.latencyMs}ms</span>
                    </div>

                    {/* Query Snippet */}
                    <p className="text-xs text-zinc-300 font-mono line-clamp-2 leading-relaxed bg-[#0a0d14] p-2 rounded border border-zinc-800/80">
                      {queryText}
                    </p>

                    {/* Bottom Metadata row */}
                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 pt-1 border-t border-zinc-800/60">
                      <span className="truncate max-w-[170px] text-zinc-500">
                        {log.identity?.tenant_id || 'tenant_default'}
                      </span>

                      <div className="flex items-center gap-2 text-zinc-400">
                        {hasCascade && (
                          <span className="flex items-center gap-1 text-purple-300">
                            <Workflow className="w-3 h-3 text-purple-400" />
                            <span>{log.nodeCascade?.length} steps</span>
                          </span>
                        )}
                        <span>•</span>
                        <span>{log.tokenCount.toLocaleString()} tkn</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ================================================================== */}
        {/* RIGHT COLUMN: TRACE INSPECTOR & STEP BREAKDOWN (7 COLS) */}
        {/* ================================================================== */}
        <div className="lg:col-span-7">
          {selectedLog ? (
            <div className="p-6 rounded-2xl bg-[#11151e] border border-zinc-800 space-y-6 sticky top-20 shadow-xl">
              {/* Card Header */}
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-zinc-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-bold">
                      Trace Inspector:
                    </span>
                    <span className="text-sm font-mono font-bold text-indigo-300 bg-indigo-950/70 px-2 py-0.5 rounded border border-indigo-800">
                      {selectedLog.id}
                    </span>
                    {renderStatusBadge(selectedLog)}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-zinc-400">
                    <span>Profile: <strong className="text-white">{selectedLog.profileSlug}</strong></span>
                    <span>•</span>
                    <span>Team: <strong className="text-zinc-300">{selectedLog.teamBlueprintId || 'default'}</strong></span>
                    {selectedLog.checkpointId && (
                      <>
                        <span>•</span>
                        <span className="text-sky-300">Checkpoint: {selectedLog.checkpointId}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleCopy(selectedLog.id, JSON.stringify(selectedLog, null, 2))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-mono transition-colors"
                  >
                    {copiedId === selectedLog.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Copy Trace JSON</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Top Telemetry Metric Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-3 rounded-lg bg-[#0a0d14] border border-zinc-800/90 space-y-1">
                  <span className="text-zinc-500 text-[10px] uppercase block">Total Latency</span>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-bold text-sm">
                      {selectedLog.latencyMs} ms
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#0a0d14] border border-zinc-800/90 space-y-1">
                  <span className="text-zinc-500 text-[10px] uppercase block">Tokens Compiled</span>
                  <div className="flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-white font-bold text-sm">
                      {selectedLog.tokenCount.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#0a0d14] border border-zinc-800/90 space-y-1">
                  <span className="text-zinc-500 text-[10px] uppercase block">Tenant Scope</span>
                  <div className="flex items-center gap-1.5 truncate">
                    <Shield className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="text-zinc-200 font-semibold text-xs truncate">
                      {selectedLog.identity?.tenant_id || 'tenant_default'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#0a0d14] border border-zinc-800/90 space-y-1">
                  <span className="text-zinc-500 text-[10px] uppercase block">State Checkpoint</span>
                  <div className="flex items-center gap-1.5 truncate">
                    <Database className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="text-zinc-300 font-mono text-xs truncate">
                      {selectedLog.checkpointId || 'ephemeral_01'}
                    </span>
                  </div>
                </div>
              </div>

              {/* ============================================================ */}
              {/* ASYNC EXECUTION WATERFALL (LangGraph + BullMQ Step Breakdown) */}
              {/* ============================================================ */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-white font-bold uppercase tracking-wider flex items-center gap-2">
                    <Workflow className="w-4 h-4 text-purple-400" />
                    <span>Async & Multi-Agent Execution Path</span>
                  </span>
                  <span className="text-zinc-500 text-[11px]">
                    {selectedLog.nodeCascade ? `${selectedLog.nodeCascade.length} Transitions Recorded` : 'Direct HTTP Resolution'}
                  </span>
                </div>

                {/* The Waterfall Cascade */}
                <div className="p-4 rounded-xl bg-[#090c13] border border-zinc-800 space-y-3">
                  {selectedLog.nodeCascade && selectedLog.nodeCascade.length > 0 ? (
                    <div className="space-y-3 relative before:absolute before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-zinc-800">
                      {selectedLog.nodeCascade.map((step, idx) => {
                        const isExpanded = expandedStepId === step.stepId;
                        return (
                          <div key={step.stepId} className="relative flex items-start gap-3 pl-1">
                            {/* Bullet icon */}
                            <div className="w-7 h-7 rounded-full bg-[#121624] border border-zinc-700 flex items-center justify-center shrink-0 z-10 shadow-sm">
                              {getStepIcon(step)}
                            </div>

                            {/* Step Container */}
                            <div className="flex-1 p-3 rounded-xl bg-[#0e121c] border border-zinc-800/90 hover:border-zinc-700 transition-all space-y-1.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-bold text-white">
                                    {step.node}
                                  </span>
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                                    {step.name}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  {step.durationMs > 0 && (
                                    <span className="text-[11px] font-mono text-emerald-400">
                                      +{step.durationMs}ms
                                    </span>
                                  )}
                                  {getStepStatusBadge(step.status)}
                                </div>
                              </div>

                              <p className="text-xs text-zinc-300 font-sans leading-relaxed">
                                {step.detail}
                              </p>

                              {step.toolName && (
                                <div className="pt-1 flex items-center gap-1.5 text-[10px] font-mono text-indigo-300">
                                  <Terminal className="w-3 h-3 text-indigo-400" />
                                  <span>MCP Tool: <code className="bg-black/50 px-1.5 py-0.5 rounded border border-indigo-900/60">{step.toolName}</code></span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-3 text-zinc-400 text-xs font-mono flex items-center gap-2">
                      <Zap className="w-4 h-4 text-emerald-400" />
                      <span>Synchronous HTTP Resolution: 100% completed in {selectedLog.latencyMs}ms.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ============================================================ */}
              {/* EDGE CASE POLICY & ESCALATION AUDIT PANEL */}
              {/* ============================================================ */}
              {selectedLog.edgeCaseTrace && (
                <div className="p-4 rounded-xl bg-[#090b11] border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-white font-bold flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-amber-400" />
                      <span>Crash-Proof EdgeCasePolicy Audit</span>
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        selectedLog.edgeCaseTrace.evaluationStatus === 'escalated_triggered'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : selectedLog.edgeCaseTrace.evaluationStatus === 'retrying_queued'
                          ? 'bg-sky-950 text-sky-300 border border-sky-800'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      }`}
                    >
                      {selectedLog.edgeCaseTrace.evaluationStatus === 'escalated_triggered'
                        ? '🚨 Fallback Triggered'
                        : selectedLog.edgeCaseTrace.evaluationStatus === 'retrying_queued'
                        ? '🔄 Retrying with Backoff'
                        : '✓ Bypassed (Primary Succeeded)'}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                    {selectedLog.edgeCaseTrace.reason}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono pt-1 text-zinc-400">
                    <div className="p-2 rounded bg-black/40 border border-zinc-800">
                      <span className="text-zinc-500 block text-[10px]">Configured Fallback Tool:</span>
                      <span className="text-white font-semibold">
                        {selectedLog.edgeCaseTrace.policyConfigured.fallbackTool}
                      </span>
                    </div>
                    <div className="p-2 rounded bg-black/40 border border-zinc-800">
                      <span className="text-zinc-500 block text-[10px]">Contact Overrides:</span>
                      <span className="text-amber-300 font-semibold">
                        {selectedLog.edgeCaseTrace.policyConfigured.contactOverrides
                          ? JSON.stringify(selectedLog.edgeCaseTrace.policyConfigured.contactOverrides)
                          : 'None'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================ */}
              {/* RAW PAYLOADS INSPECTOR (IDENTITY & TRIGGER) */}
              {/* ============================================================ */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <span className="text-zinc-500 block mb-1">Identity Contract:</span>
                  <pre className="p-3 rounded-lg bg-[#090b0f] border border-zinc-800 text-zinc-300 overflow-x-auto text-[11px] max-h-36">
                    {JSON.stringify(selectedLog.identity, null, 2)}
                  </pre>
                </div>

                <div>
                  <span className="text-zinc-500 block mb-1">Input Trigger / Intent:</span>
                  <pre className="p-3 rounded-lg bg-[#090b0f] border border-zinc-800 text-zinc-300 overflow-x-auto text-[11px] max-h-36">
                    {JSON.stringify(selectedLog.input, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center bg-[#11151e] border border-zinc-800 rounded-2xl text-zinc-500 font-mono text-xs space-y-2">
              <ScrollText className="w-8 h-8 text-zinc-600 mx-auto" />
              <p className="text-zinc-300 font-semibold">No Trace Selected</p>
              <p>Click on any log or async event in the left stream to inspect the execution waterfall.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
