'use client';

import React, { useMemo, useState } from 'react';
import {
  Server,
  Play,
  Copy,
  Check,
  KeyRound,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Code2,
  Eye,
  EyeOff,
  Plug,
} from 'lucide-react';
import { PLATFORM_TOOL_DEFINITIONS, toolInputJsonSchema } from '@/lib/mcp/tool-catalog';
import { API_KEY_PLACEHOLDER, generateClientConfigSnippets, platformMcpEndpoint } from '@/lib/mcp/client-config';

interface PlatformMcpServerViewProps {
  onOpenTeamBuilder?: () => void;
  onOpenCalendar?: () => void;
}

type ClientType = 'cursor' | 'claudeDesktop' | 'claudeCode' | 'windsurf';

const CLIENT_LABELS: Record<ClientType, { label: string; file: string }> = {
  cursor: { label: 'Cursor', file: '.cursor/mcp.json' },
  claudeDesktop: { label: 'Claude Desktop', file: 'claude_desktop_config.json (bridged via mcp-remote)' },
  claudeCode: { label: 'Claude Code', file: 'terminal' },
  windsurf: { label: 'Windsurf', file: '~/.codeium/windsurf/mcp_config.json' },
};

function inOneHour(): string {
  return new Date(Date.now() + 3_600_000).toISOString();
}

const EXAMPLE_ARGS: Record<string, () => Record<string, unknown>> = {
  list_mcp_profiles: () => ({ limit: 20 }),
  get_mcp_profile: () => ({ profile_id: '00000000-0000-0000-0000-000000000000' }),
  create_mcp_profile: () => ({ name: 'Support triage', description: 'Inbound ticket routing', token_budget: 16000 }),
  update_mcp_profile: () => ({ profile_id: '00000000-0000-0000-0000-000000000000', token_budget: 24000 }),
  archive_mcp_profile: () => ({ profile_id: '00000000-0000-0000-0000-000000000000' }),
  list_scheduled_tasks: () => ({ status: 'scheduled', limit: 20 }),
  get_scheduled_task: () => ({ task_id: '00000000-0000-0000-0000-000000000000' }),
  schedule_deferred_task: () => ({
    title: 'Weekly pipeline review',
    instructions: 'Summarize new leads and flag stalled deals.',
    target_time: inOneHour(),
  }),
  cancel_scheduled_task: () => ({ task_id: '00000000-0000-0000-0000-000000000000' }),
  list_api_keys: () => ({}),
};

let rpcId = 1;

async function callPlatformMcp(apiKey: string, method: string, params?: unknown) {
  const res = await fetch('/api/mcp/platform', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }),
  });
  const body = res.status === 202 ? null : await res.json();
  return { status: res.status, body };
}

export const PlatformMcpServerView: React.FC<PlatformMcpServerViewProps> = ({ onOpenCalendar }) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [clientType, setClientType] = useState<ClientType>('cursor');
  const [selectedTool, setSelectedTool] = useState<string>('list_mcp_profiles');
  const [playgroundArgs, setPlaygroundArgs] = useState(JSON.stringify(EXAMPLE_ARGS.list_mcp_profiles(), null, 2));
  const [isCopied, setIsCopied] = useState<string | null>(null);

  const [connection, setConnection] = useState<
    { state: 'idle' } | { state: 'testing' } | { state: 'ok'; tools: string[]; protocol: string } | { state: 'error'; message: string }
  >({ state: 'idle' });

  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<unknown>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const endpoint = platformMcpEndpoint(origin);
  const trimmedKey = apiKey.trim();
  // Keys only live in this component's memory; the snippet shows a placeholder unless one is pasted.
  const snippets = useMemo(() => generateClientConfigSnippets(trimmedKey, origin), [trimmedKey, origin]);
  const maskedSnippets = useMemo(
    () => generateClientConfigSnippets(trimmedKey && !showKey ? `${trimmedKey.slice(0, 16)}…` : trimmedKey, origin),
    [trimmedKey, showKey, origin]
  );

  const snippetText = (source: typeof snippets) =>
    clientType === 'claudeCode' ? source.claudeCode : JSON.stringify(source[clientType], null, 2);

  const tool = PLATFORM_TOOL_DEFINITIONS.find((t) => t.name === selectedTool) ?? PLATFORM_TOOL_DEFINITIONS[0];
  const toolSchema = useMemo(() => toolInputJsonSchema(tool), [tool]);
  const toolAllowed = connection.state !== 'ok' || connection.tools.includes(tool.name);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(id);
    setTimeout(() => setIsCopied(null), 2000);
  };

  const handleSelectTool = (name: string) => {
    setSelectedTool(name);
    setPlaygroundArgs(JSON.stringify(EXAMPLE_ARGS[name]?.() ?? {}, null, 2));
    setExecutionResult(null);
    setDurationMs(null);
  };

  const handleTestConnection = async () => {
    if (!trimmedKey) return;
    setConnection({ state: 'testing' });
    try {
      const init = await callPlatformMcp(trimmedKey, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'context-control-dashboard', version: '1.0.0' },
      });
      if (init.status !== 200 || init.body?.error) {
        throw new Error(init.body?.error?.message || `initialize failed (HTTP ${init.status})`);
      }
      const list = await callPlatformMcp(trimmedKey, 'tools/list');
      if (list.status !== 200 || list.body?.error) {
        throw new Error(list.body?.error?.message || `tools/list failed (HTTP ${list.status})`);
      }
      setConnection({
        state: 'ok',
        protocol: init.body.result.protocolVersion,
        tools: (list.body.result.tools || []).map((t: { name: string }) => t.name),
      });
    } catch (err: any) {
      setConnection({ state: 'error', message: err?.message || 'Connection failed' });
    }
  };

  const handleExecute = async () => {
    if (!trimmedKey) return;
    let args: unknown;
    try {
      args = JSON.parse(playgroundArgs || '{}');
    } catch {
      setExecutionResult({ error: 'Arguments are not valid JSON.' });
      return;
    }
    setIsRunning(true);
    const started = performance.now();
    try {
      const { status, body } = await callPlatformMcp(trimmedKey, 'tools/call', { name: tool.name, arguments: args });
      setExecutionResult(status === 200 ? body?.result ?? body : { httpStatus: status, ...body });
    } catch (err: any) {
      setExecutionResult({ error: err?.message || 'Request failed' });
    } finally {
      setDurationMs(Math.round(performance.now() - started));
      setIsRunning(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="pb-6 border-b border-zinc-800 space-y-2">
        <div className="flex items-center gap-2.5">
          <Server className="w-5 h-5 text-emerald-400" />
          <h1 className="text-2xl font-bold tracking-tight text-white">Platform MCP Server</h1>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 font-semibold tracking-wider uppercase">
            Streamable HTTP
          </span>
        </div>
        <p className="text-zinc-400 text-sm max-w-3xl">
          Connect Cursor, Claude, Windsurf or any MCP client to manage this organization&apos;s profiles and scheduled
          tasks. Every request is authenticated with a workspace API key, and the key&apos;s scopes decide which tools
          the client sees. Your organization is derived from the key, so there is no tenant id to configure.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className="text-zinc-500">Endpoint:</span>
          <code className="text-emerald-300 bg-black/40 px-2 py-1 rounded border border-zinc-800">{endpoint}</code>
          <button
            onClick={() => handleCopy('endpoint', endpoint)}
            className="p-1 rounded text-zinc-400 hover:text-white"
            title="Copy endpoint"
          >
            {isCopied === 'endpoint' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Step 1: key */}
      <section className="p-6 rounded-xl bg-[#11151e] border border-zinc-800 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-white uppercase font-mono tracking-wider">1. Workspace API key</h2>
        </div>
        <p className="text-xs text-zinc-400">
          Create a key under <strong className="text-zinc-200">API Keys</strong> (owners and admins only) and paste it
          here to test it and fill in the snippets. It stays in this browser tab and is never saved.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setConnection({ state: 'idle' });
              }}
              placeholder="ctx_live_…"
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-[#090b0f] border border-zinc-700 rounded-lg pl-3 pr-9 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
              title={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <button
            onClick={handleTestConnection}
            disabled={!trimmedKey || connection.state === 'testing'}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs disabled:opacity-50"
          >
            <Plug className="w-3.5 h-3.5" />
            {connection.state === 'testing' ? 'Testing…' : 'Test connection'}
          </button>
        </div>
        {connection.state === 'ok' && (
          <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-900/60 text-xs font-mono text-emerald-200 space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Connected (protocol {connection.protocol}). This key can use {connection.tools.length} tool(s).
            </div>
            {connection.tools.length > 0 && <div className="text-emerald-300/80">{connection.tools.join(', ')}</div>}
          </div>
        )}
        {connection.state === 'error' && (
          <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-xs font-mono text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {connection.message}
          </div>
        )}
      </section>

      {/* Step 2: client config */}
      <section className="p-6 rounded-xl bg-[#11151e] border border-zinc-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-white uppercase font-mono tracking-wider">2. Client configuration</h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(CLIENT_LABELS) as ClientType[]).map((c) => (
              <button
                key={c}
                onClick={() => setClientType(c)}
                className={`px-2.5 py-1 rounded-md text-xs font-mono border ${
                  clientType === c
                    ? 'bg-indigo-950 text-indigo-200 border-indigo-700'
                    : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                }`}
              >
                {CLIENT_LABELS[c].label}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 mb-1">
            <span>{CLIENT_LABELS[clientType].file}</span>
            <button
              onClick={() => handleCopy('snippet', snippetText(snippets))}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
            >
              {isCopied === 'snippet' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{isCopied === 'snippet' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre className="text-[11px] text-zinc-300 bg-black/50 p-3 rounded-lg border border-zinc-800 overflow-x-auto whitespace-pre-wrap break-all">
            {snippetText(maskedSnippets)}
          </pre>
          {!trimmedKey && (
            <p className="text-[11px] font-mono text-amber-400/90 mt-2">
              Replace <code>{API_KEY_PLACEHOLDER}</code> with your key, or paste it above so Copy includes it.
            </p>
          )}
        </div>
      </section>

      {/* Step 3: playground */}
      <section className="p-6 rounded-xl bg-[#11151e] border border-zinc-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white uppercase font-mono tracking-wider">3. Tools & playground</h2>
          </div>
          {onOpenCalendar && (
            <button
              onClick={onOpenCalendar}
              className="flex items-center gap-1.5 text-xs font-mono text-cyan-400 hover:text-cyan-300"
            >
              <Clock className="w-3.5 h-3.5" /> Open task calendar
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 space-y-1.5">
            {PLATFORM_TOOL_DEFINITIONS.map((t) => {
              const allowed = connection.state !== 'ok' || connection.tools.includes(t.name);
              return (
                <button
                  key={t.name}
                  onClick={() => handleSelectTool(t.name)}
                  className={`w-full text-left p-2.5 rounded-lg border text-xs font-mono transition-colors ${
                    selectedTool === t.name
                      ? 'bg-cyan-950/40 border-cyan-800 text-cyan-100'
                      : 'bg-[#0b0e15] border-zinc-800 text-zinc-300 hover:border-zinc-700'
                  } ${allowed ? '' : 'opacity-50'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{t.name}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded border ${
                        t.sideEffect === 'write'
                          ? 'text-amber-300 border-amber-800/70 bg-amber-950/40'
                          : 'text-zinc-400 border-zinc-700 bg-zinc-900'
                      }`}
                    >
                      {t.sideEffect}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{t.requiredScope}</div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-8 space-y-3">
            <p className="text-xs text-zinc-400">{tool.description}</p>
            {!toolAllowed && (
              <p className="text-xs font-mono text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> This key lacks <code>{tool.requiredScope}</code> or its whitelist
                excludes this tool.
              </p>
            )}
            <details className="text-[11px] font-mono text-zinc-500">
              <summary className="cursor-pointer hover:text-zinc-300">Input schema</summary>
              <pre className="mt-1 p-2 rounded bg-black/40 border border-zinc-900 overflow-x-auto">
                {JSON.stringify(toolSchema, null, 2)}
              </pre>
            </details>
            <textarea
              value={playgroundArgs}
              onChange={(e) => setPlaygroundArgs(e.target.value)}
              rows={8}
              spellCheck={false}
              className="w-full bg-[#090b0f] border border-zinc-700 rounded-lg p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-500"
            />
            <div className="flex items-center justify-between">
              <button
                onClick={handleExecute}
                disabled={!trimmedKey || isRunning}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                {isRunning ? 'Calling…' : `Call ${tool.name}`}
              </button>
              {!trimmedKey && <span className="text-[11px] font-mono text-zinc-500">Paste a key in step 1 first.</span>}
              {durationMs !== null && <span className="text-[11px] font-mono text-zinc-500">{durationMs} ms</span>}
            </div>
            {tool.sideEffect === 'write' && (
              <p className="text-[11px] font-mono text-amber-400/80">
                This tool changes real data in your organization.
              </p>
            )}
            {executionResult !== null && (
              <pre className="text-[11px] text-zinc-300 bg-black/50 p-3 rounded-lg border border-zinc-800 overflow-x-auto max-h-96">
                {JSON.stringify(executionResult, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
