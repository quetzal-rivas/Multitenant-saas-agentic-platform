'use client';

import React, { useState } from 'react';
import {
  Copy,
  Check,
  Terminal,
  Globe2,
  Layers,
  Cpu,
  Shield,
  KeyRound,
  Lock,
  Clock,
  Gauge,
  Sliders,
  Sparkles,
  Zap,
  Play,
  ArrowRight,
  Code2,
  Activity,
  Send,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Database,
  Calendar,
  Settings2,
  Flame,
  ExternalLink,
} from 'lucide-react';
import { INITIAL_PROFILES, INITIAL_API_KEYS } from '@/lib/mock-data';

type EndpointId = 'schedule_task' | 'context_resolve' | 'context_token' | 'chat_generate' | 'simulation_run';

interface EndpointMeta {
  id: EndpointId;
  method: 'POST' | 'GET';
  path: string;
  internalRoute: string;
  title: string;
  badge: string;
  badgeColor: string;
  description: string;
  latencyMs: number;
  successRate: string;
  tokenConsumption: string;
  rateLimit: string;
  zodSchemaNotes: string;
  defaultPayload: any;
  sampleCurl: string;
}

const ENDPOINTS_CATALOG: EndpointMeta[] = [
  {
    id: 'schedule_task',
    method: 'POST',
    path: '/v1/schedule_task',
    internalRoute: '/api/v1/schedule_task',
    title: 'BullMQ Durable Task Scheduler',
    badge: 'NEW · BullMQ + Redis',
    badgeColor: 'bg-amber-950/80 text-amber-300 border-amber-700/80',
    description:
      'Durable execution ingestion route. Enqueues deferred jobs into the BullMQ delayed Redis queue. Third-party LLMs and agents can schedule crash-proof future tasks with tools whitelists and automatic escalation policies.',
    latencyMs: 18,
    successRate: '99.9%',
    tokenConsumption: 'N/A (Job Ingestion)',
    rateLimit: '60 req/min/key',
    zodSchemaNotes:
      'Zod-validated schema: targetTime (ISO timestamp), toolsWhitelist (string[]), and edgeCasePolicies ({ fallbackOnPrimaryFailure, escalationTool, escalationInstructions, contactOverrides, maxRetries }).',
    defaultPayload: {
      title: 'Post-Call CRM Deal Sync & Alert',
      targetTime: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
      toolsWhitelist: ['crm.search_contact', 'crm.update_deal_stage', 'elevenlabs.trigger_call'],
      edgeCasePolicies: {
        fallbackOnPrimaryFailure: 'escalate',
        escalationTool: 'elevenlabs_trigger_call',
        escalationInstructions: 'Trigger emergency voice call to lead boss if deal sync encounters network drop.',
        contactOverrides: {
          boss: '+1 (555) 438-9021',
          dispatch_email: 'ops-lead@enterprise.corp',
        },
        maxRetries: 2,
      },
      instructions: 'Review transcript of inbound sales call, verify deal size, and update pipeline stage in HubSpot CRM.',
      category: 'voice',
      tenant_id: 'tenant_enterprise_corp',
    },
    sampleCurl: `curl -X POST "https://api.contextcontrol.dev/v1/schedule_task" \\
  -H "Authorization: Bearer ctx_live_98a72f1bc0934e81a947d102e3b8a1" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Post-Call CRM Deal Sync & Alert",
    "targetTime": "2026-09-23T12:30:00.000Z",
    "toolsWhitelist": ["crm.search_contact", "crm.update_deal_stage", "elevenlabs.trigger_call"],
    "edgeCasePolicies": {
      "fallbackOnPrimaryFailure": "escalate",
      "escalationTool": "elevenlabs_trigger_call",
      "escalationInstructions": "Trigger voice alert if primary CRM sync fails.",
      "contactOverrides": { "boss": "+1 (555) 438-9021" },
      "maxRetries": 2
    },
    "instructions": "Update deal status in HubSpot CRM and notify account executive.",
    "category": "voice",
    "tenant_id": "tenant_enterprise_corp"
  }'`,
  },
  {
    id: 'context_resolve',
    method: 'POST',
    path: '/v1/context/resolve',
    internalRoute: '/api/v1/context/resolve',
    title: 'Primary Context Resolution Compiler',
    badge: 'Core Engine',
    badgeColor: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80',
    description:
      'Primary context compiler endpoint. Validates identity parameters against the profile contract, resolves connected data streams, enforces token budgeting, and compiles pristine markdown or JSON prompt blocks.',
    latencyMs: 14,
    successRate: '99.8%',
    tokenConsumption: '70% Budget (8,420 tokens)',
    rateLimit: '60 req/min/key',
    zodSchemaNotes:
      'Validates profile slug, identity contract (tenant_id, user_id, conversation_id), and dynamic trigger inputs.',
    defaultPayload: {
      profile: 'sales-agent',
      identity: {
        tenant_id: 'tenant_enterprise_corp',
        user_id: 'user_456',
        conversation_id: 'conversation_789',
      },
      input: {
        query: "Analyze this month's enterprise churn risks and pending upgrades.",
        trigger: {
          type: 'contract_review',
          contract_id: 'CTR-9281',
        },
      },
    },
    sampleCurl: `curl -X POST "https://api.contextcontrol.dev/v1/context/resolve" \\
  -H "Authorization: Bearer ctx_live_98a72f1bc0934e81a947d102e3b8a1" \\
  -H "Content-Type: application/json" \\
  -d '{
    "profile": "sales-agent",
    "identity": {
      "tenant_id": "tenant_enterprise_corp",
      "user_id": "user_456",
      "conversation_id": "conversation_789"
    },
    "input": {
      "query": "Analyze this month churn risks",
      "trigger": { "type": "contract_review", "contract_id": "CTR-9281" }
    }
  }'`,
  },
  {
    id: 'context_token',
    method: 'POST',
    path: '/v1/context/token',
    internalRoute: '/api/v1/context/token',
    title: 'Short-Lived Client JWT Minter (TTL)',
    badge: 'Cryptographic Auth',
    badgeColor: 'bg-cyan-950/80 text-cyan-300 border-cyan-700/80',
    description:
      'Mints short-lived, cryptographically signed RS256 JWT tokens for browser widgets. Embeds dynamic TTL (15m to 24h), user identity, and an explicit tools_whitelist to prevent leaked browser keys from executing unauthorized tools.',
    latencyMs: 9,
    successRate: '99.9%',
    tokenConsumption: 'N/A (Minter)',
    rateLimit: '120 req/min/key',
    zodSchemaNotes:
      'Validates tenant, user, profile, ttlSeconds, ttlString, and allowedTools whitelist array.',
    defaultPayload: {
      tenant: 'tenant_enterprise_corp',
      user: 'user_456',
      profile: 'sales-agent',
      ttlSeconds: 3600,
      ttlString: '1h',
      allowedTools: ['crm.search_contact', 'gmail.send_draft', 'elevenlabs.trigger_call'],
    },
    sampleCurl: `curl -X POST "https://api.contextcontrol.dev/v1/context/token" \\
  -H "Authorization: Bearer ctx_live_98a72f1bc0934e81a947d102e3b8a1" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tenant": "tenant_enterprise_corp",
    "user": "user_456",
    "profile": "sales-agent",
    "ttlSeconds": 3600,
    "ttlString": "1h",
    "allowedTools": ["crm.search_contact", "gmail.send_draft"]
  }'`,
  },
  {
    id: 'chat_generate',
    method: 'POST',
    path: '/v1/chat/generate',
    internalRoute: '/api/v1/chat/generate',
    title: 'LangGraph Multi-Agent Session Engine',
    badge: 'Stateful Checkpoints',
    badgeColor: 'bg-purple-950/80 text-purple-300 border-purple-700/80',
    description:
      'Dynamic multi-tenant session generation endpoint. Injects tenant_id and profile_id into LangGraph configuration metadata, queries the upstream MCP Gateway for authenticated tools, and persists turn checkpoints into PostgreSQL via PostgresSaver.',
    latencyMs: 380,
    successRate: '99.4%',
    tokenConsumption: '55% Budget (6,890 tokens)',
    rateLimit: '30 req/min/key',
    zodSchemaNotes:
      'Accepts thread_id, tenant_id, profile_id, and input user message. Emits streaming or structured AI responses.',
    defaultPayload: {
      thread_id: 'session_usr_456_lead_review',
      tenant_id: 'tenant_enterprise_corp',
      profile_id: 'sales-agent',
      message: 'What was the customer sentiment in the recent ElevenLabs post-call recording?',
    },
    sampleCurl: `curl -X POST "https://api.contextcontrol.dev/v1/chat/generate" \\
  -H "Authorization: Bearer ctx_live_98a72f1bc0934e81a947d102e3b8a1" \\
  -H "Content-Type: application/json" \\
  -d '{
    "thread_id": "session_usr_456_lead_review",
    "tenant_id": "tenant_enterprise_corp",
    "profile_id": "sales-agent",
    "message": "What was customer sentiment in the recent post-call recording?"
  }'`,
  },
  {
    id: 'simulation_run',
    method: 'POST',
    path: '/v1/simulation/run',
    internalRoute: '/api/v1/simulation/run',
    title: 'Queue & Supervisor Sandbox Runner',
    badge: 'Time Warp · Zero Cost',
    badgeColor: 'bg-indigo-950/80 text-indigo-300 border-indigo-700/80',
    description:
      'Simulates BullMQ delayed queues, LangGraph supervisor traversal, and mock tool execution with { isSimulation: true } metadata. Supports forcePromote to skip delayed holds and test execution immediately.',
    latencyMs: 125,
    successRate: '100%',
    tokenConsumption: 'Mock Bypassed',
    rateLimit: 'Unlimited Sandbox',
    zodSchemaNotes:
      'Requires isSimulation: true. Accepts targetTime, forcePromote, toolsWhitelist, and edgeCasePolicies.',
    defaultPayload: {
      isSimulation: true,
      forcePromote: true,
      profile_id: 'team_sales_pipeline',
      thread_id: `sim_${Date.now().toString(36)}`,
      targetTime: new Date(Date.now() + 1000 * 60 * 20).toISOString(),
      primaryInstructions: 'Parse ElevenLabs post-call transcript and dispatch customer summary via Gmail.',
      toolsWhitelist: ['crm.search_contact', 'gmail.send_draft', 'elevenlabs.trigger_call'],
    },
    sampleCurl: `curl -X POST "https://api.contextcontrol.dev/v1/simulation/run" \\
  -H "Authorization: Bearer ctx_live_98a72f1bc0934e81a947d102e3b8a1" \\
  -H "Content-Type: application/json" \\
  -d '{
    "isSimulation": true,
    "forcePromote": true,
    "profile_id": "team_sales_pipeline",
    "thread_id": "sim_live_test",
    "targetTime": "2026-09-23T12:00:00Z",
    "primaryInstructions": "Sync call transcript to CRM",
    "toolsWhitelist": ["crm.search_contact", "gmail.send_draft"]
  }'`,
  },
];

export const EndpointsView: React.FC = () => {
  // Selected endpoint for docs view & playground
  const [activeEndpointId, setActiveEndpointId] = useState<EndpointId>('schedule_task');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Playground States
  const [playgroundOpen, setPlaygroundOpen] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>(INITIAL_API_KEYS[0]?.key || 'ctx_live_98a72f1bc0934e81a947d102e3b8a1');
  const [selectedProfileSlug, setSelectedProfileSlug] = useState<string>('sales-agent');
  const [playgroundPayloadText, setPlaygroundPayloadText] = useState<string>(() =>
    JSON.stringify(ENDPOINTS_CATALOG[0].defaultPayload, null, 2)
  );
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [playgroundResponse, setPlaygroundResponse] = useState<{
    status: number;
    statusText: string;
    durationMs: number;
    data: any;
    error?: string;
  } | null>(null);

  const activeEndpoint = ENDPOINTS_CATALOG.find((e) => e.id === activeEndpointId) || ENDPOINTS_CATALOG[0];

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleOpenPlayground = (endpoint: EndpointMeta) => {
    setActiveEndpointId(endpoint.id);
    setPlaygroundPayloadText(JSON.stringify(endpoint.defaultPayload, null, 2));
    setPlaygroundResponse(null);
    setPlaygroundOpen(true);
  };

  const handleExecutePlayground = async () => {
    setIsExecuting(true);
    setPlaygroundResponse(null);
    const start = performance.now();

    let parsedBody: any;
    try {
      parsedBody = JSON.parse(playgroundPayloadText);
    } catch (err: any) {
      setPlaygroundResponse({
        status: 400,
        statusText: 'Bad Request (Client JSON Error)',
        durationMs: 0,
        data: null,
        error: `JSON parse error: ${err.message}`,
      });
      setIsExecuting(false);
      return;
    }

    try {
      const res = await fetch(activeEndpoint.internalRoute, {
        method: activeEndpoint.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKeyInput}`,
        },
        body: JSON.stringify(parsedBody),
      });

      const durationMs = Math.round(performance.now() - start);
      let responseData: any;
      const text = await res.text();
      try {
        responseData = JSON.parse(text);
      } catch {
        responseData = text;
      }

      setPlaygroundResponse({
        status: res.status,
        statusText: res.statusText || (res.ok ? 'OK' : 'Error'),
        durationMs,
        data: responseData,
        error: !res.ok ? (responseData?.error || `HTTP ${res.status}`) : undefined,
      });
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start);
      setPlaygroundResponse({
        status: 500,
        statusText: 'Network / Route Error',
        durationMs,
        data: null,
        error: err.message || 'Failed to dispatch request to backend route',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 font-sans">
      {/* ==================================================================== */}
      {/* PAGE HEADER */}
      {/* ==================================================================== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
              API Endpoints & Integration Gateway
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700 font-semibold tracking-wider uppercase">
              Production Gateway
            </span>
          </div>
          <p className="text-zinc-400 text-sm max-w-3xl">
            Developer documentation and live testing pathways for your multi-tenant backend architecture: BullMQ background queue scheduling, runtime context resolution, short-lived JWT token minting, and LangGraph agent execution.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => {
              setPlaygroundOpen(!playgroundOpen);
              if (!playgroundOpen) {
                setPlaygroundPayloadText(JSON.stringify(activeEndpoint.defaultPayload, null, 2));
              }
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold font-mono transition-all shadow-md border ${
              playgroundOpen
                ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950 border-amber-400'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{playgroundOpen ? 'Close Playground' : '⚡ Open Live cURL Playground'}</span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* LIVE cURL BUILDER PLAYGROUND (EXPANDABLE / INTERACTIVE PANEL) */}
      {/* ==================================================================== */}
      {playgroundOpen && (
        <div className="p-6 rounded-2xl bg-[#0b0e17] border-2 border-indigo-500/60 shadow-2xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-950 flex items-center justify-center text-indigo-400 border border-indigo-700/80">
                <Terminal className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white uppercase font-mono tracking-wider">
                    Interactive Live API Playground
                  </h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                    Real Next.js Fetch
                  </span>
                </div>
                <p className="text-xs text-zinc-400 font-mono">
                  Target Route: <code className="text-indigo-300 font-bold">{activeEndpoint.internalRoute}</code> ({activeEndpoint.method})
                </p>
              </div>
            </div>

            {/* Quick Switch Endpoint in Playground */}
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-zinc-500">Route:</span>
              <select
                value={activeEndpointId}
                onChange={(e) => {
                  const newId = e.target.value as EndpointId;
                  setActiveEndpointId(newId);
                  const ep = ENDPOINTS_CATALOG.find((x) => x.id === newId);
                  if (ep) {
                    setPlaygroundPayloadText(JSON.stringify(ep.defaultPayload, null, 2));
                    setPlaygroundResponse(null);
                  }
                }}
                className="bg-[#121624] border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              >
                {ENDPOINTS_CATALOG.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.method} {ep.path} ({ep.title})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Playground Settings Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1 font-semibold uppercase">
                Authorization Header (Bearer Secret):
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="ctx_live_..."
                  className="w-full bg-[#121725] border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-emerald-300 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setApiKeyInput(INITIAL_API_KEYS[0]?.key || 'ctx_live_default')}
                  className="absolute right-2 top-2 text-[10px] text-zinc-500 hover:text-indigo-300"
                >
                  Reset
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 block mb-1 font-semibold uppercase">
                Sample Context Profile:
              </label>
              <select
                value={selectedProfileSlug}
                onChange={(e) => {
                  const slug = e.target.value;
                  setSelectedProfileSlug(slug);
                  try {
                    const parsed = JSON.parse(playgroundPayloadText);
                    if ('profile' in parsed) parsed.profile = slug;
                    if ('profile_id' in parsed) parsed.profile_id = slug;
                    setPlaygroundPayloadText(JSON.stringify(parsed, null, 2));
                  } catch {}
                }}
                className="w-full bg-[#121725] border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {INITIAL_PROFILES.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name} ({p.slug})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 block mb-1 font-semibold uppercase">
                Payload Template:
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPlaygroundPayloadText(JSON.stringify(activeEndpoint.defaultPayload, null, 2));
                    setPlaygroundResponse(null);
                  }}
                  className="flex-1 py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs border border-zinc-700 transition-colors"
                >
                  Reset Default Body
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const p = JSON.parse(playgroundPayloadText);
                      setPlaygroundPayloadText(JSON.stringify(p, null, 2));
                    } catch {}
                  }}
                  className="py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-indigo-400 text-xs border border-zinc-700"
                >
                  Format
                </button>
              </div>
            </div>
          </div>

          {/* Playground Split Body: JSON Input & Live Output */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Request Editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                <span className="flex items-center gap-1.5 font-semibold text-zinc-300">
                  <Code2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>JSON Request Body</span>
                </span>
                <span className="text-[10px] text-zinc-500">application/json</span>
              </div>
              <div className="rounded-xl border border-zinc-700/80 bg-[#07090f] overflow-hidden focus-within:border-indigo-500">
                <textarea
                  value={playgroundPayloadText}
                  onChange={(e) => setPlaygroundPayloadText(e.target.value)}
                  rows={13}
                  spellCheck={false}
                  className="w-full p-3.5 font-mono text-xs text-emerald-300 bg-transparent resize-y focus:outline-none leading-relaxed"
                />
              </div>

              <button
                type="button"
                disabled={isExecuting}
                onClick={handleExecutePlayground}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-indigo-600 to-purple-600 hover:from-emerald-500 hover:to-purple-500 text-white font-bold text-xs font-mono transition-all shadow-lg shadow-indigo-950 disabled:opacity-50"
              >
                {isExecuting ? (
                  <>
                    <RotateCcw className="w-4 h-4 animate-spin text-white" />
                    <span>Executing Request...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 text-emerald-300" />
                    <span>Send Request to {activeEndpoint.path}</span>
                  </>
                )}
              </button>
            </div>

            {/* Right: Live Response Output */}
            <div className="space-y-2 flex flex-col">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="flex items-center gap-1.5 font-semibold text-zinc-300">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Real-Time Response Payload</span>
                </span>

                {playgroundResponse && (
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        playgroundResponse.status >= 200 && playgroundResponse.status < 300
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          : 'bg-rose-950 text-rose-300 border border-rose-700'
                      }`}
                    >
                      HTTP {playgroundResponse.status} {playgroundResponse.statusText}
                    </span>
                    <span className="text-zinc-500 text-[10px]">
                      {playgroundResponse.durationMs}ms
                    </span>
                  </div>
                )}
              </div>

              <div className="flex-1 min-h-[300px] rounded-xl border border-zinc-800 bg-[#06080e] p-3.5 font-mono text-xs overflow-y-auto">
                {isExecuting ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-2 py-12">
                    <RotateCcw className="w-6 h-6 animate-spin text-indigo-400" />
                    <p className="text-xs">Dispatching request to server...</p>
                  </div>
                ) : playgroundResponse ? (
                  <div className="space-y-2">
                    {playgroundResponse.error && (
                      <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{playgroundResponse.error}</span>
                      </div>
                    )}
                    <pre className="text-emerald-400 text-xs overflow-x-auto select-text leading-relaxed">
                      {typeof playgroundResponse.data === 'object'
                        ? JSON.stringify(playgroundResponse.data, null, 2)
                        : String(playgroundResponse.data)}
                    </pre>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-2 text-center py-12">
                    <Zap className="w-7 h-7 text-zinc-600" />
                    <p className="text-zinc-400 text-xs font-semibold">Ready for Execution</p>
                    <p className="text-zinc-600 text-[11px] max-w-xs leading-relaxed">
                      Click &quot;Send Request&quot; to execute live against your local Next.js backend and inspect the real JSON response.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ENDPOINT DOCUMENTATION CARDS (FULL ARCHITECTURE) */}
      {/* ==================================================================== */}
      <div className="space-y-6">
        {ENDPOINTS_CATALOG.map((endpoint) => {
          const isSelected = activeEndpointId === endpoint.id;

          return (
            <div
              key={endpoint.id}
              className={`p-6 rounded-2xl bg-[#11151e] border transition-all space-y-5 ${
                isSelected
                  ? 'border-indigo-500/80 shadow-lg shadow-indigo-950/40'
                  : 'border-zinc-800 hover:border-zinc-700'
              }`}
            >
              {/* Card Top: Method, Path, Title, and Action Buttons */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      className={`px-2.5 py-1 rounded font-mono font-bold text-xs border ${
                        endpoint.method === 'POST'
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                          : 'bg-sky-950 text-sky-400 border-sky-800'
                      }`}
                    >
                      {endpoint.method}
                    </span>
                    <span className="font-mono text-white text-base font-bold">
                      {endpoint.path}
                    </span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${endpoint.badgeColor}`}>
                      {endpoint.badge}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-zinc-200">
                    {endpoint.title}
                  </h3>
                </div>

                {/* Right Quick Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopy(endpoint.id, endpoint.sampleCurl)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-mono transition-colors"
                    title="Copy cURL snippet"
                  >
                    {copiedKey === endpoint.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Copy cURL</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenPlayground(endpoint)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-950 hover:bg-indigo-900 border border-indigo-700 text-indigo-200 text-xs font-mono font-semibold transition-colors shadow-sm"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>⚡ Test in Playground</span>
                  </button>
                </div>
              </div>

              {/* Description & Zod Schema Notes */}
              <p className="text-xs text-zinc-300 leading-relaxed max-w-4xl font-sans">
                {endpoint.description}
              </p>

              {/* Zod Schema callout box */}
              <div className="p-3 rounded-lg bg-[#0a0d14] border border-zinc-800/90 text-xs font-mono text-zinc-400 flex items-start gap-2.5">
                <Shield className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="text-white font-semibold">Schema & Contract Enforcement:</span>{' '}
                  <span className="text-zinc-300">{endpoint.zodSchemaNotes}</span>
                </div>
              </div>

              {/* Code Snippet Box */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                  <span className="text-zinc-500">cURL Integration Snippet:</span>
                  <span className="text-zinc-600 text-[11px]">Header: Authorization: Bearer &lt;key&gt;</span>
                </div>
                <pre className="p-4 rounded-xl bg-[#080a10] border border-zinc-800/80 font-mono text-xs text-zinc-300 overflow-x-auto leading-relaxed">
                  {endpoint.sampleCurl}
                </pre>
              </div>

              {/* ============================================================ */}
              {/* REAL-TIME TELEMETRY: MICRO-LOGS METRIC BAR */}
              {/* ============================================================ */}
              <div className="pt-3 border-t border-zinc-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                {/* Latency metric */}
                <div className="p-2.5 rounded-lg bg-[#0a0d14] border border-zinc-800/70 space-y-1">
                  <span className="text-zinc-500 text-[10px] block uppercase">Average Latency</span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-bold text-emerald-400 text-xs">
                      {endpoint.latencyMs}ms
                    </span>
                    <span className="text-[10px] text-zinc-500">(p95)</span>
                  </div>
                </div>

                {/* Success Rate metric */}
                <div className="p-2.5 rounded-lg bg-[#0a0d14] border border-zinc-800/70 space-y-1">
                  <span className="text-zinc-500 text-[10px] block uppercase">Success Rate</span>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-bold text-white text-xs">
                      {endpoint.successRate}
                    </span>
                  </div>
                </div>

                {/* Budget Consumption metric */}
                <div className="p-2.5 rounded-lg bg-[#0a0d14] border border-zinc-800/70 space-y-1">
                  <span className="text-zinc-500 text-[10px] block uppercase">Budget Footprint</span>
                  <div className="flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="font-bold text-zinc-200 text-xs truncate">
                      {endpoint.tokenConsumption}
                    </span>
                  </div>
                </div>

                {/* Rate Limit Ceiling */}
                <div className="p-2.5 rounded-lg bg-[#0a0d14] border border-zinc-800/70 space-y-1">
                  <span className="text-zinc-500 text-[10px] block uppercase">Rate Ceiling</span>
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-bold text-amber-300 text-xs">
                      {endpoint.rateLimit}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
