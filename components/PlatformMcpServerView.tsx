'use client';

import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Server,
  Play,
  Copy,
  Check,
  RefreshCw,
  Layers,
  Database,
  ShieldCheck,
  Clock,
  Sparkles,
  Bot,
  Zap,
  ChevronRight,
  ExternalLink,
  Code2,
  CheckCircle2,
  AlertTriangle,
  Send,
  SlidersHorizontal,
} from 'lucide-react';
import { PLATFORM_CONTROL_MCP_TOOLS } from '@/Backend/platform-mcp-tools';

interface PlatformMcpServerViewProps {
  onOpenTeamBuilder?: () => void;
  onOpenCalendar?: () => void;
}

export const PlatformMcpServerView: React.FC<PlatformMcpServerViewProps> = ({
  onOpenTeamBuilder,
  onOpenCalendar,
}) => {
  const [tenantId, setTenantId] = useState('tenant_enterprise_corp');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'blueprints' | 'bullmq' | 'database' | 'security'>('all');
  const [selectedTool, setSelectedTool] = useState<string>('schedule_deferred_task');
  const [isCopied, setIsCopied] = useState<string | null>(null);

  // Live Playground invocation state
  const [clientType, setClientType] = useState<'cursor' | 'claudeDesktop' | 'windsurf' | 'stdio'>('cursor');
  const [playgroundArgs, setPlaygroundArgs] = useState<string>(
    JSON.stringify(
      {
        title: 'Q3 Enterprise Lead Pipeline Sweep',
        instructions: 'Scan newly enriched HubSpot leads, evaluate close probability, and enqueue follow-up notifications.',
        targetTime: '2026-09-25T18:00:00.000Z',
        toolsWhitelist: ['crm.search_contact', 'crm.update_deal_stage', 'slack_post_message'],
        edgeCasePolicies: {
          on_failure: 'escalate',
          fallback_tool: 'elevenlabs_trigger_call',
          escalation_instructions: 'Trigger emergency voice call to lead account director if pipeline sync fails.',
          contact_overrides: { boss: '+1 (555) 438-9021' },
          max_retries: 2,
        },
      },
      null,
      2
    )
  );

  const [isLoading, setIsLoading] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  // Active Origin
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://ais-dev-preview.run.app';
  const mcpEndpointUrl = `${origin}/api/mcp/platform?tenant_id=${tenantId}`;

  // Filter tools by category
  const filteredTools = PLATFORM_CONTROL_MCP_TOOLS.filter((tool) => {
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'blueprints') {
      return ['create_agent_profile', 'attach_worker_to_profile', 'list_team_blueprints'].includes(tool.name);
    }
    if (selectedCategory === 'bullmq') {
      return ['schedule_deferred_task', 'cancel_deferred_task', 'list_scheduled_tasks', 'trigger_task_now'].includes(tool.name);
    }
    if (selectedCategory === 'database') {
      return ['inspect_database_schema', 'query_database_table'].includes(tool.name);
    }
    if (selectedCategory === 'security') {
      return ['view_tenant_vault_status', 'update_tenant_spoke_auth'].includes(tool.name);
    }
    return true;
  });

  // Switch default payload based on selected tool
  const handleSelectTool = (toolName: string) => {
    setSelectedTool(toolName);
    switch (toolName) {
      case 'create_agent_profile':
        setPlaygroundArgs(
          JSON.stringify(
            {
              name: 'Enterprise VIP Retention Squad',
              supervisor_prompt: 'Orchestrate churn risk prevention: analyze usage dips, query billing history, and route to executive outreach.',
              routing_strategy: 'supervisor_router',
              tenant_id: tenantId,
            },
            null,
            2
          )
        );
        break;
      case 'attach_worker_to_profile':
        setPlaygroundArgs(
          JSON.stringify(
            {
              profile_id: 'team_front_desk_vip',
              worker_name: 'Lead Enrichment Specialist',
              role: 'HubSpot and Stripe CRM Analysis',
              system_prompt: 'Parse company domains, calculate ARR potential, and assign deal tags.',
              mcp_tools: ['crm.add_lead', 'crm.tag_contact', 'stripe_fetch_customer'],
              avatar_icon: 'bot',
            },
            null,
            2
          )
        );
        break;
      case 'list_team_blueprints':
        setPlaygroundArgs(JSON.stringify({ tenant_id: tenantId }, null, 2));
        break;
      case 'schedule_deferred_task':
        setPlaygroundArgs(
          JSON.stringify(
            {
              title: 'Q3 Enterprise Lead Pipeline Sweep',
              instructions: 'Scan newly enriched HubSpot leads, evaluate close probability, and enqueue follow-up notifications.',
              targetTime: '2026-09-25T18:00:00.000Z',
              toolsWhitelist: ['crm.search_contact', 'crm.update_deal_stage', 'slack_post_message'],
              edgeCasePolicies: {
                on_failure: 'escalate',
                fallback_tool: 'elevenlabs_trigger_call',
                escalation_instructions: 'Trigger emergency voice call to lead account director if pipeline sync fails.',
                contact_overrides: { boss: '+1 (555) 438-9021' },
                max_retries: 2,
              },
              tenant_id: tenantId,
            },
            null,
            2
          )
        );
        break;
      case 'cancel_deferred_task':
        setPlaygroundArgs(JSON.stringify({ task_id: 'task_exec_weekly_summary' }, null, 2));
        break;
      case 'list_scheduled_tasks':
        setPlaygroundArgs(JSON.stringify({ tenant_id: tenantId, status: 'ALL' }, null, 2));
        break;
      case 'trigger_task_now':
        setPlaygroundArgs(JSON.stringify({ task_id: 'task_exec_weekly_summary' }, null, 2));
        break;
      case 'inspect_database_schema':
        setPlaygroundArgs(JSON.stringify({ schema_name: 'public' }, null, 2));
        break;
      case 'query_database_table':
        setPlaygroundArgs(JSON.stringify({ table: 'profiles', tenant_id: tenantId, limit: 5 }, null, 2));
        break;
      case 'view_tenant_vault_status':
        setPlaygroundArgs(JSON.stringify({ tenant_id: tenantId }, null, 2));
        break;
      case 'update_tenant_spoke_auth':
        setPlaygroundArgs(
          JSON.stringify(
            {
              tenant_id: tenantId,
              provider: 'hubspot',
              account_label: 'sales-ops-director@acmecorp.com',
              scopes: ['crm.objects.contacts.read', 'crm.objects.deals.write', 'crm.schemas.custom.read'],
            },
            null,
            2
          )
        );
        break;
      default:
        setPlaygroundArgs(JSON.stringify({}, null, 2));
    }
  };

  const handleExecuteTool = async () => {
    setIsLoading(true);
    setExecutionResult(null);
    const start = performance.now();

    try {
      let parsed = {};
      try {
        parsed = JSON.parse(playgroundArgs);
      } catch (e) {
        throw new Error('Payload contains invalid JSON. Please correct syntax before invoking.');
      }

      const rpcPayload = {
        jsonrpc: '2.0',
        id: `call_${Date.now()}`,
        method: 'tools/call',
        params: {
          name: selectedTool,
          arguments: parsed,
          tenant_id: tenantId,
        },
      };

      const res = await fetch(`/api/mcp/platform?tenant_id=${tenantId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
          'x-caller-agent': 'localized-ide-admin',
        },
        body: JSON.stringify(rpcPayload),
      });

      const data = await res.json();
      setDurationMs(Math.round(performance.now() - start));
      setExecutionResult(data);
    } catch (err: any) {
      setDurationMs(Math.round(performance.now() - start));
      setExecutionResult({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: err?.message || 'Execution failed',
        },
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(id);
    setTimeout(() => setIsCopied(null), 2000);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn">
      {/* Header Banner */}
      <div className="border border-zinc-800 bg-[#0c0f16] rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-emerald-500/10 via-indigo-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 text-[11px] font-mono font-medium rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                OFFICIAL MCP SPEC 2024-11-05
              </span>
              <span className="px-2.5 py-0.5 text-[11px] font-mono font-medium rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                DIRECT IN-MEMORY CONTROLLERS (&lt;5ms)
              </span>
              <span className="px-2.5 py-0.5 text-[11px] font-mono text-zinc-400">
                Stdio & SSE Transports
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <Terminal className="w-7 h-7 text-emerald-400" />
              Platform Control MCP Server
            </h1>

            <p className="text-sm text-zinc-400 max-w-3xl leading-relaxed">
              Enables localized LLMs (Claude Desktop, Cursor, IDE sub-agents) to govern your architecture natively through standard tool interfaces. Decoupled from public HTTP loops: directly wraps local <strong className="text-zinc-200">TeamBlueprintManager</strong>, <strong className="text-zinc-200">BullMQ taskQueue</strong>, <strong className="text-zinc-200">TenantVault</strong>, and <strong className="text-zinc-200">Postgres schemas</strong>.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            {onOpenTeamBuilder && (
              <button
                onClick={onOpenTeamBuilder}
                className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-purple-900/40 hover:bg-purple-900/60 text-purple-300 border border-purple-800/60 text-xs font-semibold transition-all"
              >
                <Bot className="w-4 h-4" />
                <span>Open Team Builder</span>
              </button>
            )}
            {onOpenCalendar && (
              <button
                onClick={onOpenCalendar}
                className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-900/40 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-800/60 text-xs font-semibold transition-all"
              >
                <Clock className="w-4 h-4" />
                <span>BullMQ Task Calendar</span>
              </button>
            )}
          </div>
        </div>

        {/* Multi-Tenant Context Ribbon */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-zinc-800/80 text-xs">
          <div>
            <span className="text-zinc-500 uppercase font-mono text-[10px] block">Active Tenant Isolation</span>
            <div className="flex items-center gap-2 mt-1">
              <select
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 font-mono"
              >
                <option value="tenant_enterprise_corp">tenant_enterprise_corp (Enterprise)</option>
                <option value="tenant_growth_saas">tenant_growth_saas (Growth)</option>
              </select>
            </div>
          </div>

          <div>
            <span className="text-zinc-500 uppercase font-mono text-[10px] block">Transport Mechanism</span>
            <div className="text-zinc-200 font-mono font-medium mt-1.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              In-Memory Stdio / JSON-RPC 2.0
            </div>
          </div>

          <div>
            <span className="text-zinc-500 uppercase font-mono text-[10px] block">Controller Overhead</span>
            <div className="text-emerald-400 font-mono font-bold mt-1.5">
              &lt; 5ms (Zero HTTP Hop)
            </div>
          </div>

          <div>
            <span className="text-zinc-500 uppercase font-mono text-[10px] block">Database Guardrail</span>
            <div className="text-zinc-300 font-mono mt-1.5 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
              Supavisor RLS (:5432)
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Tools Explorer & Interactive Live Invoker */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Tool Categories & Matrix (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="border border-zinc-800 bg-[#0d1017] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Tool Matrix (4 Categories)
                </h2>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                {filteredTools.length} Tools
              </span>
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                { id: 'all', label: 'All Tools' },
                { id: 'blueprints', label: 'A: Blueprints' },
                { id: 'bullmq', label: 'B: BullMQ Tasks' },
                { id: 'database', label: 'C: Database' },
                { id: 'security', label: 'D: Security Vault' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id as any)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    selectedCategory === cat.id
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-zinc-800/40 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Tool List */}
            <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
              {filteredTools.map((tool) => {
                const isSelected = selectedTool === tool.name;
                const isBullMQ = tool.name.includes('task');
                const isBlueprint = tool.name.includes('profile') || tool.name.includes('worker');
                const isDB = tool.name.includes('database');
                const isVault = tool.name.includes('vault') || tool.name.includes('auth');

                return (
                  <button
                    key={tool.name}
                    onClick={() => handleSelectTool(tool.name)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex flex-col gap-1.5 ${
                      isSelected
                        ? 'border-emerald-500/80 bg-emerald-950/20 shadow-md shadow-emerald-950/40'
                        : 'border-zinc-800/80 bg-zinc-900/40 hover:bg-zinc-800/40 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-white flex items-center gap-2">
                        {isBlueprint && <Bot className="w-3.5 h-3.5 text-purple-400" />}
                        {isBullMQ && <Clock className="w-3.5 h-3.5 text-cyan-400" />}
                        {isDB && <Database className="w-3.5 h-3.5 text-amber-400" />}
                        {isVault && <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
                        {tool.name}
                      </span>
                      <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isSelected ? 'rotate-90 text-emerald-400' : 'text-zinc-600'}`} />
                    </div>
                    <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                      {tool.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* IDE Client Setup Configurations */}
          <div className="border border-zinc-800 bg-[#0d1017] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2">
                <Code2 className="w-4 h-4 text-emerald-400" />
                IDE Agent Integration Config
              </h3>
              <div className="flex gap-1">
                {(['cursor', 'claudeDesktop', 'windsurf', 'stdio'] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setClientType(c)}
                    className={`px-2 py-0.5 text-[10px] font-mono rounded ${
                      clientType === c
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <button
                onClick={() => {
                  let snippet = '';
                  if (clientType === 'cursor') {
                    snippet = JSON.stringify(
                      {
                        mcp: {
                          servers: {
                            'platform-control': {
                              url: mcpEndpointUrl,
                              headers: { 'x-tenant-id': tenantId },
                            },
                          },
                        },
                      },
                      null,
                      2
                    );
                  } else if (clientType === 'claudeDesktop') {
                    snippet = JSON.stringify(
                      {
                        mcpServers: {
                          'platform-control': {
                            command: 'npx',
                            args: ['-y', '@modelcontextprotocol/server-sse', mcpEndpointUrl],
                            env: { PLATFORM_TENANT_ID: tenantId },
                          },
                        },
                      },
                      null,
                      2
                    );
                  } else if (clientType === 'stdio') {
                    snippet = `# Run localized Python stdio MCP server directly:\npython3 -m Backend.platform_control_mcp`;
                  } else {
                    snippet = JSON.stringify(
                      {
                        mcpServers: {
                          'platform-control': {
                            url: mcpEndpointUrl,
                            headers: { 'x-tenant-id': tenantId },
                          },
                        },
                      },
                      null,
                      2
                    );
                  }
                  handleCopy(snippet, 'ide-config');
                }}
                className="absolute top-2.5 right-2.5 p-1.5 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-xs flex items-center gap-1 z-10"
              >
                {isCopied === 'ide-config' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{isCopied === 'ide-config' ? 'Copied' : 'Copy'}</span>
              </button>

              <pre className="p-3.5 rounded-xl bg-zinc-950 font-mono text-[11px] text-emerald-300 overflow-x-auto border border-zinc-800/90 leading-relaxed">
                {clientType === 'cursor' &&
                  `// .cursor/mcp.json\n{\n  "mcp": {\n    "servers": {\n      "platform-control": {\n        "url": "${mcpEndpointUrl}",\n        "headers": {\n          "x-tenant-id": "${tenantId}"\n        }\n      }\n    }\n  }\n}`}
                {clientType === 'claudeDesktop' &&
                  `// ~/Library/Application Support/Claude/claude_desktop_config.json\n{\n  "mcpServers": {\n    "platform-control": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-sse", "${mcpEndpointUrl}"],\n      "env": {\n        "PLATFORM_TENANT_ID": "${tenantId}"\n      }\n    }\n  }\n}`}
                {clientType === 'windsurf' &&
                  `// ~/.codeium/windsurf/mcp_config.json\n{\n  "mcpServers": {\n    "platform-control": {\n      "url": "${mcpEndpointUrl}",\n      "headers": {\n        "x-tenant-id": "${tenantId}"\n      }\n    }\n  }\n}`}
                {clientType === 'stdio' &&
                  `# Direct Local In-Memory Stdio Execution (Cursor / Claude CLI):\npython3 -m Backend.platform_control_mcp\n\n# Node.js Stdio Bridge:\nnode --loader ts-node/esm Backend/platform-mcp-server.ts`}
              </pre>
            </div>
          </div>
        </div>

        {/* Right Column: Live Testing Workspace & JSON-RPC Output (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="border border-zinc-800 bg-[#0d1017] rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Play className="w-4 h-4 text-emerald-400" />
                  Live Invocation Playground
                </h3>
                <p className="text-xs text-zinc-400">
                  Target Tool: <code className="text-emerald-300 font-mono font-semibold">{selectedTool}</code>
                </p>
              </div>

              <button
                onClick={handleExecuteTool}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-xs shadow-lg shadow-emerald-950 transition-all font-mono"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Executing Controller...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Call MCP Tool</span>
                  </>
                )}
              </button>
            </div>

            {/* Parameter Editor */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Arguments (JSON-RPC 2.0 params):</span>
                <span className="font-mono text-[10px] text-zinc-500">Ctrl/Cmd + Return to send</span>
              </div>
              <textarea
                value={playgroundArgs}
                onChange={(e) => setPlaygroundArgs(e.target.value)}
                rows={9}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-xl p-3 font-mono text-xs text-zinc-200 focus:outline-none transition-colors"
                spellCheck={false}
              />
            </div>

            {/* Execution Result / Response Inspector */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-300 flex items-center gap-2">
                  <span>Standard MCP Response</span>
                  {durationMs !== null && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                      ⚡ {durationMs} ms
                    </span>
                  )}
                </span>
                {executionResult && (
                  <button
                    onClick={() => handleCopy(JSON.stringify(executionResult, null, 2), 'mcp-resp')}
                    className="text-zinc-400 hover:text-white flex items-center gap-1 font-mono text-[11px]"
                  >
                    {isCopied === 'mcp-resp' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{isCopied === 'mcp-resp' ? 'Copied' : 'Copy Response'}</span>
                  </button>
                )}
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs overflow-x-auto min-h-[220px] max-h-[420px]">
                {executionResult ? (
                  <pre className="text-zinc-300 leading-relaxed">
                    {JSON.stringify(executionResult, null, 2)}
                  </pre>
                ) : (
                  <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-zinc-500 gap-2">
                    <Terminal className="w-8 h-8 text-zinc-700" />
                    <span>Click &quot;Call MCP Tool&quot; to execute local native controller</span>
                    <span className="text-[10px] text-zinc-600 font-sans">
                      Operates natively without calling public internet HTTP endpoints
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Architecture Insights Card */}
          <div className="border border-zinc-800/80 bg-[#0d1017] rounded-xl p-5 space-y-3">
            <h4 className="text-xs font-bold text-zinc-200 uppercase font-mono tracking-wider">
              Native Controller Architecture Guarantees
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-zinc-400">
              <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-1">
                <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Durable Task Queue (<span className="text-cyan-300 font-mono">taskQueue</span>)
                </div>
                <p className="text-[11px] text-zinc-400">
                  Calls <code className="text-cyan-300">taskQueue.scheduleTask()</code> directly in memory, writing to the durable journal file &amp; Redis without network hop.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-1">
                <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Team Blueprint Manager (<span className="text-purple-300 font-mono">manager</span>)
                </div>
                <p className="text-[11px] text-zinc-400">
                  Manipulates relational <code className="text-purple-300">profiles</code> and <code className="text-purple-300">profile_workers</code> tables with tenant isolation.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-1">
                <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Encrypted Vault (<span className="text-teal-300 font-mono">TenantVault</span>)
                </div>
                <p className="text-[11px] text-zinc-400">
                  Keeps AES-256 tokens isolated in the vault; LLM only sees credential fingerprints, scopes, and health statuses.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-1">
                <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  PostgreSQL Supavisor RLS
                </div>
                <p className="text-[11px] text-zinc-400">
                  Schema inspection queries <code className="text-amber-300">schema.sql</code> definitions with multi-tenant enforcement.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
