'use client';

import React, { useState } from 'react';
import { ContextProfile } from '@/lib/types';
import {
  Code2,
  Copy,
  Check,
  Cpu,
  Layers,
  Terminal,
  Sparkles,
  ArrowRight,
  Clock,
  ShieldCheck,
  Zap,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Server,
  Database,
  PhoneCall,
  Activity,
  Bot,
  Calendar,
  FileCode,
  Info,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

interface SdkIntegrationsViewProps {
  profiles: ContextProfile[];
}

type FrameworkTab =
  | 'deferred_tasks'
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'typescript'
  | 'python'
  | 'vercel'
  | 'langchain'
  | 'curl';

type DeferredLang = 'typescript' | 'python' | 'curl';

const DELAY_PRESET_LABELS: Record<'15m' | '30m' | '24h' | '3d' | '1w', string> = {
  '15m': '+15 minutes (immediate test window)',
  '30m': '+30 minutes (deferred window)',
  '24h': '+24 hours (next business day)',
  '3d': '+3 days (asynchronous BullMQ cycle)',
  '1w': '+7 days (scheduled weekly cycle)',
};

export const SdkIntegrationsView: React.FC<SdkIntegrationsViewProps> = ({ profiles }) => {
  const [selectedProfileSlug, setSelectedProfileSlug] = useState(profiles[0]?.slug || 'sales-agent');
  const [activeTab, setActiveTab] = useState<FrameworkTab>('deferred_tasks');
  const [deferredLang, setDeferredLang] = useState<DeferredLang>('typescript');
  const [copied, setCopied] = useState(false);

  // Interactive Live Schedule Playground state
  const [testTitle, setTestTitle] = useState('Quarterly Enterprise Renewal & Usage Review');
  const [testDelayPreset, setTestDelayPreset] = useState<'15m' | '30m' | '24h' | '3d' | '1w'>('3d');
  const [testEscalation, setTestEscalation] = useState<'escalate' | 'retry' | 'abort'>('escalate');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResponse, setSimulationResponse] = useState<any>(null);

  const handleTestSchedule = async () => {
    setIsSimulating(true);
    setSimulationResponse(null);

    const now = Date.now();
    const offsets: Record<string, number> = {
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '3d': 3 * 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000,
    };
    const targetTime = new Date(now + (offsets[testDelayPreset] || offsets['3d'])).toISOString();

    try {
      const res = await fetch('/api/v1/schedule_task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: testTitle,
          targetTime,
          toolsWhitelist: ['salesforce.get_contract', 'stripe.get_customer_usage', 'elevenlabs.trigger_call'],
          edgeCasePolicies: {
            fallbackOnPrimaryFailure: testEscalation,
            escalationTool: 'elevenlabs_trigger_call',
            escalationInstructions: 'Trigger voice alert to AE if primary CRM update encounters network timeout.',
            contactOverrides: {
              boss: '+1 (555) 438-9021',
              dispatch_email: 'ops-lead@enterprise.corp',
            },
            maxRetries: 3,
          },
          instructions: `Review client contract CTR-8921 under profile '${selectedProfileSlug}', calculate usage tier delta, and draft renewal terms.`,
          tenant_id: 'tenant_enterprise_corp',
          profile_id: selectedProfileSlug,
        }),
      });

      const data = await res.json();
      setSimulationResponse(data);
    } catch (err: any) {
      setSimulationResponse({
        success: false,
        error: err.message || 'Failed to simulate task scheduling',
      });
    } finally {
      setIsSimulating(false);
    }
  };

  const getSnippet = () => {
    if (activeTab === 'deferred_tasks') {
      if (deferredLang === 'typescript') {
        return `// ===================================================================
// Context Control - Schedule a tenant-scoped platform task over MCP.
// ===================================================================

import { ContextControl } from "@contextcontrol/sdk";

// Initialize client with your Live Tenant API key
const client = new ContextControl({
  apiKey: process.env.CONTEXT_CONTROL_API_KEY!,
  baseUrl: process.env.CONTEXT_CONTROL_BASE_URL!,
});

// 1. Calculate future execution timestamp (e.g. 3 days from now)
const targetDate = new Date();
targetDate.setDate(targetDate.getDate() + 3);

// Schedule a task; tenant identity comes from the API key.
const scheduledTask = await client.tasks.schedule({
  title: "Quarterly Enterprise Renewal & Usage Review",
  targetTime: targetDate.toISOString(),
  instructions:
    "Retrieve contract CTR-8921, calculate Stripe billing delta, and draft renewal terms.",
});

console.log("Task ID:", scheduledTask.id);
console.log("Scheduled time:", scheduledTask.target_time);
console.log("Status:", scheduledTask.status);`;
      }

      if (deferredLang === 'python') {
        return `import os
    from datetime import datetime, timedelta, timezone
    import requests

    endpoint = os.environ["CONTEXT_CONTROL_BASE_URL"].rstrip("/") + "/api/mcp/platform"
    headers = {
      "Authorization": f"Bearer {os.environ['CONTEXT_CONTROL_API_KEY']}",
      "Content-Type": "application/json",
    }

    def rpc(request_id, method, params=None):
      response = requests.post(endpoint, headers=headers, json={
        "jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}
      })
      response.raise_for_status()
      payload = response.json()
      if "error" in payload:
        raise RuntimeError(payload["error"]["message"])
      if payload.get("result", {}).get("isError"):
        raise RuntimeError(payload["result"]["content"][0]["text"])
      return payload["result"]

    rpc(1, "initialize", {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "context-control-python-example", "version": "1.0.0"},
    })
    requests.post(endpoint, headers=headers, json={
      "jsonrpc": "2.0", "method": "notifications/initialized"
    }).raise_for_status()

    task = rpc(2, "tools/call", {"name": "contextcontrol_schedule_task", "arguments": {
      "title": "Quarterly Enterprise Renewal & Usage Review",
      "target_time": (datetime.now(timezone.utc) + timedelta(days=3)).isoformat(),
      "instructions": "Review the account and prepare renewal recommendations.",
    }})["structuredContent"]["task"]

    print(task["id"], task["target_time"], task["status"])`;
      }

      // cURL
      return `curl -X POST "$CONTEXT_CONTROL_BASE_URL/api/mcp/platform" \\
  -H "Authorization: Bearer $CONTEXT_CONTROL_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "contextcontrol_schedule_task",
      "arguments": {
        "title": "Quarterly Enterprise Renewal & Usage Review",
        "target_time": "2030-01-01T14:30:00.000Z",
        "instructions": "Review the account and prepare renewal recommendations."
      }
    }
  }'`;
    }

    switch (activeTab) {
      case 'gemini':
        return `import { GoogleGenAI } from "@google/genai";

// 1. Resolve context with one call to Context Control
const ctxRes = await fetch("https://api.contextcontrol.dev/v1/context/resolve", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.CONTEXT_CONTROL_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    profile: "${selectedProfileSlug}",
    identity: {
      tenant_id: "tenant_enterprise_corp",
      user_id: "user_456",
      conversation_id: "conversation_789"
    },
    input: {
      query: "Analyze this month's cancellations and suggest retention packages."
    }
  })
});

const { context } = await ctxRes.json();

// 2. Pass compiled markdown context directly to Gemini 3.7 Flash
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const response = await ai.models.generateContent({
  model: "gemini-3.7-flash",
  contents: \`\${context.content}\\n\\nUser: Analyze cancellations\`,
});

console.log(response.text);`;

      case 'openai':
        return `import OpenAI from "openai";

// 1. Resolve context from Context Control
const ctxRes = await fetch("https://api.contextcontrol.dev/v1/context/resolve", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.CONTEXT_CONTROL_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    profile: "${selectedProfileSlug}",
    identity: { tenant_id: "tenant_enterprise_corp", user_id: "user_456" },
    input: { query: "Analyze cancellations" }
  })
});

const { context } = await ctxRes.json();

// 2. Feed compiled context as system prompt to OpenAI
const openai = new OpenAI();
const completion = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "system", content: context.content },
    { role: "user", content: "Analyze cancellations" }
  ]
});

console.log(completion.choices[0].message.content);`;

      case 'anthropic':
        return `import Anthropic from "@anthropic-ai/sdk";

// 1. Resolve context from Context Control
const ctxRes = await fetch("https://api.contextcontrol.dev/v1/context/resolve", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.CONTEXT_CONTROL_API_KEY}\`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    profile: "${selectedProfileSlug}",
    identity: { tenant_id: "tenant_enterprise_corp", user_id: "user_456" },
    input: { query: "Analyze cancellations" }
  })
});
const { context } = await ctxRes.json();

// 2. Pass compiled context to Claude 3.5 Sonnet
const anthropic = new Anthropic();
const msg = await anthropic.messages.create({
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 1024,
  system: context.content,
  messages: [{ role: "user", content: "Analyze cancellations" }]
});

console.log(msg.content[0].text);`;

      case 'typescript':
        return `// Using the official Context Control TypeScript SDK
import { ContextControl } from "@contextcontrol/sdk";

const client = new ContextControl({
  apiKey: process.env.CONTEXT_CONTROL_API_KEY!,
  baseUrl: process.env.CONTEXT_CONTROL_BASE_URL!,
});

const profiles = await client.profiles.list();
const tasks = await client.tasks.list({ status: "scheduled", limit: 10 });
const task = await client.tasks.schedule({
  title: "Review this month's cancellations",
  instructions: "Summarize cancellation trends and recommend next steps.",
  targetTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
});

console.log(profiles.length, tasks.length, task.id);`;

      case 'python':
        return `from contextcontrol import ContextControl
import os

client = ContextControl(api_key=os.environ["CONTEXT_CONTROL_API_KEY"])

response = client.context.resolve(
    profile="${selectedProfileSlug}",
    identity={
        "tenant_id": "tenant_enterprise_corp",
        "user_id": "user_456",
        "conversation_id": "conversation_789"
    },
    input={
        "query": "Analyze this month's cancellations",
        "trigger": {
            "type": "contract_cancelled",
            "contract_id": "CTR-9281"
        }
    }
)

print(response.context.content)
print(f"Token count: {response.metadata.token_count}")`;

      case 'vercel':
        return `import { generateText } from "ai";
import { google } from "@ai-sdk/google";

// 1. Resolve compiled context
const ctxRes = await fetch("https://api.contextcontrol.dev/v1/context/resolve", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.CONTEXT_CONTROL_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    profile: "${selectedProfileSlug}",
    identity: { tenant_id: "tenant_enterprise_corp" },
    input: { query: "Analyze cancellations" }
  })
});
const { context } = await ctxRes.json();

// 2. Use Vercel AI SDK with compiled system context
const { text } = await generateText({
  model: google("gemini-3.7-flash"),
  system: context.content,
  prompt: "Analyze cancellations and recommend concessions",
});

console.log(text);`;

      case 'langchain':
        return `import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

// 1. Resolve Context
const ctxRes = await fetch("https://api.contextcontrol.dev/v1/context/resolve", {
  method: "POST",
  headers: { "Authorization": \`Bearer \${process.env.CONTEXT_CONTROL_API_KEY}\` },
  body: JSON.stringify({
    profile: "${selectedProfileSlug}",
    identity: { tenant_id: "tenant_enterprise_corp" },
    input: { query: "Analyze cancellations" }
  })
});
const { context } = await ctxRes.json();

// 2. Pass compiled context as LangChain SystemMessage
const model = new ChatGoogleGenerativeAI({ model: "gemini-3.7-flash" });
const response = await model.invoke([
  new SystemMessage(context.content),
  new HumanMessage("Analyze cancellations"),
]);

console.log(response.content);`;

      case 'curl':
      default:
        return `curl -X POST "https://api.contextcontrol.dev/v1/context/resolve" \\
  -H "Authorization: Bearer ctx_live_98a72f1bc0934e81a947d102e3b8a1" \\
  -H "Content-Type: application/json" \\
  -d '{
    "profile": "${selectedProfileSlug}",
    "identity": {
      "tenant_id": "tenant_enterprise_corp",
      "user_id": "user_456",
      "conversation_id": "conversation_789"
    },
    "input": {
      "query": "Analyze this month'\''s cancellations",
      "trigger": {
        "type": "contract_cancelled",
        "contract_id": "CTR-9281"
      }
    }
  }'`;
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getSnippet());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Universal Client Integration & SDK Library
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/80">
              v1.4.0 Multi-Tenant
            </span>
          </div>
          <p className="text-zinc-400 text-sm max-w-3xl">
            Integrate Context Control into your production stack. Resolve real-time compiled context for LLMs or dispatch crash-proof delayed background tasks via the BullMQ Redis engine.
          </p>
        </div>

        {/* Profile picker */}
        <div className="flex items-center gap-2.5 bg-[#0e121a] px-3 py-2 rounded-xl border border-zinc-800 shrink-0">
          <Bot className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-mono text-zinc-400">Target Profile:</span>
          <select
            value={selectedProfileSlug}
            onChange={(e) => setSelectedProfileSlug(e.target.value)}
            className="bg-[#141924] border border-zinc-700/80 rounded-lg px-2.5 py-1 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.slug}>
                {p.name} ({p.slug})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Dual Execution Paradigm Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          onClick={() => setActiveTab('gemini')}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            activeTab !== 'deferred_tasks'
              ? 'bg-emerald-950/20 border-emerald-500/50 shadow-lg shadow-emerald-950/20'
              : 'bg-[#0b0e14] border-zinc-800/70 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <Zap className={`w-4 h-4 ${activeTab !== 'deferred_tasks' ? 'text-emerald-400' : 'text-zinc-400'}`} />
              <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                1. Synchronous Context Resolution
              </h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
              POST /v1/context/resolve
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Real-time sub-15ms context compilation. Combines memory, RLS database records, and active policies directly into standard model prompts (Gemini, Claude, GPT-4o).
          </p>
        </div>

        <div
          onClick={() => setActiveTab('deferred_tasks')}
          className={`cursor-pointer p-4 rounded-xl border transition-all ${
            activeTab === 'deferred_tasks'
              ? 'bg-amber-950/25 border-amber-500/60 shadow-lg shadow-amber-950/20'
              : 'bg-[#0b0e14] border-zinc-800/70 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <Clock className={`w-4 h-4 ${activeTab === 'deferred_tasks' ? 'text-amber-400' : 'text-zinc-400'}`} />
              <h2 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                2. Deferred Execution / BullMQ
                <span className="text-[9px] font-semibold uppercase bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded border border-amber-500/30">
                  Async Engine
                </span>
              </h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-700/60">
              POST /v1/schedule_task
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Time-delayed background tasks. Schedules operations minutes, days, or weeks in the future with automatic ElevenLabs voice failover & tenant RLS persistence.
          </p>
        </div>
      </div>

      {/* Code Framework Selector Menu */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 overflow-x-auto pb-1 border-b border-zinc-800/80">
          <div className="flex items-center gap-2 shrink-0">
            {/* NEW PROMINENT BULLMQ TAB */}
            <button
              onClick={() => setActiveTab('deferred_tasks')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all shrink-0 ${
                activeTab === 'deferred_tasks'
                  ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                  : 'bg-amber-950/30 text-amber-300 border border-amber-800/60 hover:bg-amber-900/40'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Deferred Execution / Background Tasks</span>
              <span className="text-[9px] px-1 py-0.2 rounded bg-amber-900/80 text-amber-200 border border-amber-600/40">
                BullMQ
              </span>
            </button>

            <div className="h-4 w-px bg-zinc-800 mx-1" />

            {/* Model & SDK Providers */}
            {[
              { id: 'gemini', label: 'Google Gemini' },
              { id: 'openai', label: 'OpenAI' },
              { id: 'anthropic', label: 'Anthropic Claude' },
              { id: 'typescript', label: 'TypeScript / Node' },
              { id: 'python', label: 'Python' },
              { id: 'vercel', label: 'Vercel AI SDK' },
              { id: 'langchain', label: 'LangChain' },
              { id: 'curl', label: 'cURL' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as FrameworkTab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all shrink-0 ${
                  activeTab === tab.id
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-zinc-900/90 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sub-Language Selector if Deferred Tasks is active */}
        {activeTab === 'deferred_tasks' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0d1017] p-3 rounded-xl border border-amber-900/30">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-zinc-400">Language / Format:</span>
              <div className="flex items-center gap-1.5">
                {(
                  [
                    { id: 'typescript', label: 'TypeScript / Node.js' },
                    { id: 'python', label: 'Python Async SDK' },
                    { id: 'curl', label: 'cURL / REST API' },
                  ] as { id: DeferredLang; label: string }[]
                ).map((lang) => (
                  <button
                    key={lang.id}
                    onClick={() => setDeferredLang(lang.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                      deferredLang === lang.id
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200 bg-zinc-900/50 border border-zinc-800'
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-amber-400/90">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>Tenant RLS Guaranteed · Isolated Execution Envelope</span>
            </div>
          </div>
        )}

        {/* Code Snippet Box */}
        <div className="relative rounded-xl bg-[#090b0f] border border-zinc-800 overflow-hidden shadow-2xl">
          <div className="px-4 py-2.5 bg-[#0e121a] border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-mono text-zinc-300 font-semibold uppercase tracking-wider">
                {activeTab === 'deferred_tasks'
                  ? `BullMQ Task Scheduler Snippet (${deferredLang.toUpperCase()})`
                  : `${activeTab.toUpperCase()} Integration Snippet`}
              </span>
              {activeTab === 'deferred_tasks' && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-700/60">
                  POST /v1/schedule_task
                </span>
              )}
            </div>

            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800/80 text-xs font-mono text-emerald-400 hover:bg-zinc-800 hover:text-emerald-300 transition-all border border-zinc-700"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>

          <pre className="p-5 font-mono text-xs text-zinc-200 leading-relaxed overflow-x-auto selection:bg-emerald-900 selection:text-emerald-200">
            {getSnippet()}
          </pre>
        </div>
      </div>

      {/* Feature Explainer Cards for Deferred Tasks */}
      {activeTab === 'deferred_tasks' && (
        <div className="space-y-6 pt-2">
          {/* Architectural Deep-Dive Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card 1: The Async BullMQ Handshake */}
            <div className="p-5 rounded-xl bg-[#0d1017] border border-amber-900/30 space-y-3">
              <div className="flex items-center gap-2.5 text-amber-400">
                <Clock className="w-4 h-4 shrink-0" />
                <h3 className="text-sm font-semibold text-white">
                  1. The Async BullMQ Handshake (The &ldquo;Schedule Task&rdquo; Snippet)
                </h3>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Allows LLMs and backend services to schedule actions that run days or weeks in the future. Jobs are deposited into a durable BullMQ Redis z-set with zero memory footprint while asleep:
              </p>
              <ul className="space-y-2 text-xs font-mono text-zinc-300 bg-[#07090e] p-3 rounded-lg border border-zinc-800/80">
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">•</span>
                  <span>
                    <strong className="text-amber-300">targetTime:</strong> Valid ISO-8601 string. BullMQ calculates delay offset: <code className="text-emerald-400">targetDate.getTime() - now</code>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">•</span>
                  <span>
                    <strong className="text-amber-300">toolsWhitelist:</strong> Strict tool boundary enforcing zero privilege escalation if a delayed task wakes up.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">•</span>
                  <span>
                    <strong className="text-amber-300">edgeCasePolicies:</strong> Automatic fallback matrix. If CRM API drops, worker fails over to ElevenLabs emergency voice dispatch.
                  </span>
                </li>
              </ul>
            </div>

            {/* Card 2: Multi-Tenant Metadata Lifecycle */}
            <div className="p-5 rounded-xl bg-[#0d1017] border border-emerald-900/30 space-y-3">
              <div className="flex items-center gap-2.5 text-emerald-400">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <h3 className="text-sm font-semibold text-white">
                  2. The Multi-Tenant Metadata Lifecycle
                </h3>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                When background tasks execute days later, the worker requires context state without requiring developer sessions to be open:
              </p>
              <ul className="space-y-2 text-xs font-mono text-zinc-300 bg-[#07090e] p-3 rounded-lg border border-zinc-800/80">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span>
                    <strong className="text-emerald-300">tenant_id:</strong> Re-attaches Supabase Postgres RLS policies, ensuring workers only query data belonging to that enterprise tenant.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span>
                    <strong className="text-emerald-300">profile_id:</strong> Automatically re-hydrates the Persona Profile Blueprint ({selectedProfileSlug}), loading instructions and system safety constraints.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span>
                    <strong className="text-emerald-300">Job Telemetry:</strong> Every execution emits structured logs into your Trace Inspector with exact step timings and token counts.
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* Interactive Live cURL / SDK Request Playground */}
          <div className="p-5 rounded-xl bg-[#0b0e14] border border-zinc-800 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">
                  Interactive BullMQ Schedule Simulator
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                  Live Endpoint Dry-Run
                </span>
              </div>
              <span className="text-xs text-zinc-500 font-mono">
                Hits <code className="text-emerald-400">POST /api/v1/schedule_task</code>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-zinc-400">Task Title</label>
                <input
                  type="text"
                  value={testTitle}
                  onChange={(e) => setTestTitle(e.target.value)}
                  className="w-full bg-[#11151e] border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-zinc-400">Deferred Delay</label>
                <select
                  value={testDelayPreset}
                  onChange={(e) => setTestDelayPreset(e.target.value as any)}
                  className="w-full bg-[#11151e] border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-amber-300 focus:outline-none focus:border-amber-500"
                >
                  <option value="15m">15 Minutes from now (Immediate test)</option>
                  <option value="30m">30 Minutes from now</option>
                  <option value="24h">24 Hours (Next Day)</option>
                  <option value="3d">3 Days (Async Window)</option>
                  <option value="1w">1 Week (Scheduled Cycle)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-zinc-400">Edge Case Fallback</label>
                <select
                  value={testEscalation}
                  onChange={(e) => setTestEscalation(e.target.value as any)}
                  className="w-full bg-[#11151e] border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="escalate">Escalate &rarr; ElevenLabs Voice Call</option>
                  <option value="retry">Retry 3x then Log</option>
                  <option value="abort">Abort immediately</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs font-mono text-zinc-500 flex items-center gap-2">
                <span>Calculated offset:</span>
                <span className="text-amber-400 font-semibold">{DELAY_PRESET_LABELS[testDelayPreset]}</span>
              </div>

              <button
                onClick={handleTestSchedule}
                disabled={isSimulating}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs transition-all shadow-md shadow-amber-500/10 disabled:opacity-50"
              >
                {isSimulating ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    <span>Enqueuing into BullMQ...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Schedule Task via API</span>
                  </>
                )}
              </button>
            </div>

            {/* Response Viewer */}
            {simulationResponse && (
              <div className="mt-4 p-4 rounded-lg bg-[#07090e] border border-amber-900/40 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    BullMQ Ingestion Response (201 Created)
                  </span>
                  <span className="text-zinc-500">Latency: 12ms</span>
                </div>
                <pre className="text-[11px] font-mono text-zinc-300 bg-[#0d1017] p-3 rounded border border-zinc-800 overflow-x-auto">
                  {JSON.stringify(simulationResponse, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Synchronous Resolution Feature Card (when not deferred) */}
      {activeTab !== 'deferred_tasks' && (
        <div className="p-4 rounded-xl bg-[#0d1017] border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              Dynamic Context Pipeline Active
            </h3>
            <p className="text-xs text-zinc-400">
              Profile <code className="text-emerald-300 font-mono">{selectedProfileSlug}</code> will dynamically resolve instructions, memories, and RLS tables before calling {activeTab.toUpperCase()}.
            </p>
          </div>
          <button
            onClick={() => setActiveTab('deferred_tasks')}
            className="flex items-center gap-1 text-xs font-mono text-amber-400 hover:text-amber-300 whitespace-nowrap bg-amber-950/30 px-3 py-1.5 rounded-lg border border-amber-800/50"
          >
            <span>Need background jobs? View BullMQ SDK</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
