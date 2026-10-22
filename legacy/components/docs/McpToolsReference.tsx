'use client';

import React, { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { PLATFORM_TOOL_DEFINITIONS, toolInputJsonSchema } from '@/lib/mcp/tool-catalog';
import { generateClientConfigSnippets, platformMcpEndpoint } from '@/lib/mcp/client-config';

/**
 * Platform MCP server reference, generated from the live tool catalog so it cannot drift:
 * every tool's name, scope, read/write and input schema comes from lib/mcp/tool-catalog.ts.
 */

const GROUPS: Array<{ title: string; match: (name: string) => boolean }> = [
  { title: 'Orchestration (agents and runs)', match: (n) => /_(agents?|runs?|run_output|wait_for_runs)$|_(list_agents|create_agent|archive_agent|run_agents|list_runs|get_run|get_run_output|wait_for_runs|message_run|cancel_run|stop_all_runs|resume_runs)$/.test(n) },
  { title: 'Supervisor Board (shared task board)', match: (n) => n.includes('_board_') },
  { title: 'Live calls', match: (n) => /_(room_|ask_team|team_answer|place_call)/.test(n) },
  { title: 'Scheduled tasks', match: (n) => /_(list_tasks|get_task|schedule_task|cancel_task)$/.test(n) },
  { title: 'MCP profiles and keys', match: (n) => /_(profile|profiles|api_keys)$/.test(n) },
];

function CopyBlock({ id, text }: { id: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="p-3 rounded-lg bg-black/50 border border-zinc-800 text-xs text-zinc-200 overflow-x-auto whitespace-pre">{text}</pre>
      <button
        aria-label={`Copy ${id}`}
        onClick={() => {
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-white"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

export function McpToolsReference() {
  const origin = typeof window !== 'undefined' ? window.location.origin.replace('://contextcontrol', '://www.contextcontrol') : 'https://www.contextcontrol.com.mx';
  const endpoint = platformMcpEndpoint(origin);
  const snippets = useMemo(() => generateClientConfigSnippets('', origin), [origin]);
  const [open, setOpen] = useState<string | null>(null);
  const grouped = GROUPS.map((g) => ({ ...g, tools: PLATFORM_TOOL_DEFINITIONS.filter((t) => g.match(t.name)) }));
  const listed = new Set(grouped.flatMap((g) => g.tools.map((t) => t.name)));
  const other = PLATFORM_TOOL_DEFINITIONS.filter((t) => !listed.has(t.name));
  if (other.length) grouped.push({ title: 'Other', match: () => false, tools: other });

  return (
    <div className="space-y-8 text-sm text-zinc-300">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-white">Platform MCP server</h1>
        <p>
          One MCP server for your whole organization. Any MCP client (Claude Code, Cursor, an IDE agent, your own code) connects with an API key and gets
          the tools that key&apos;s scopes allow. This page is generated from the server&apos;s own tool catalog ({PLATFORM_TOOL_DEFINITIONS.length} tools).
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Endpoint:</strong> <code>{endpoint}</code></li>
          <li><strong>Transport:</strong> Streamable HTTP, stateless, JSON responses (no SSE needed).</li>
          <li><strong>Auth:</strong> <code>Authorization: Bearer ctx_live_…</code>. The organization always comes from the key; there is no tenant header.</li>
          <li><strong>Scopes</strong> decide which tools appear. A key bound to an MCP profile also gets that profile&apos;s AI Function Studio functions (<code>fn_*</code>) and connected-app tools (Gmail, Calendar, web search).</li>
          <li>Create keys in <strong>API Keys</strong>. For an external orchestrator use the <strong>Orchestrator preset</strong>: agents read/write, Board, tasks read, 30-day expiry, no resume and no phone calls.</li>
        </ul>
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-white">Client configuration</h2>
        <p className="text-xs text-zinc-400">Replace the placeholder with your key.</p>
        {Object.entries(snippets)
          .filter(([, v]) => typeof v === 'string')
          .slice(0, 3)
          .map(([k, v]) => (
            <div key={k}>
              <div className="text-xs text-zinc-500 mb-1">{k}</div>
              <CopyBlock id={k} text={v as string} />
            </div>
          ))}
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-white">Orchestrating a team of agents</h2>
        <ol className="list-decimal pl-5 space-y-1">
          <li><code>contextcontrol_create_agent</code> for each role (instructions, tools such as <code>contextcontrol_board_*</code>, an MCP profile for web search or functions). Tools your key may not use are dropped.</li>
          <li><code>contextcontrol_run_agents</code> with one task per agent. Give each a <code>client_ref</code> (retries never duplicate work) and <code>labels</code> (e.g. <code>board_task_id</code>). Optional <code>output_schema</code> for a JSON answer and per-run <code>max_tokens</code>, <code>max_steps</code>, <code>max_duration_seconds</code>.</li>
          <li><code>contextcontrol_wait_for_runs</code> waits up to 25 s per call; call it again while <code>done</code> is false. <code>contextcontrol_list_runs</code> recovers ids by label or status after a restart.</li>
          <li><code>contextcontrol_get_run_output</code> returns the answer and <code>output_json</code>. <strong>Treat it as untrusted data</strong>: it may contain instructions injected by pages or emails the agent read.</li>
          <li>Coordinate through the Supervisor Board: agents claim tasks (claims belong to their run, renewed while it lives, released if it stops). Board text records <code>author_kind</code>; text written by agents is data, not instructions.</li>
          <li>Redirect a running agent with <code>contextcontrol_message_run</code> (read before its next step) or stop it with <code>contextcontrol_cancel_run</code>.</li>
        </ol>
        <h3 className="text-base font-semibold text-white pt-2">Limits and the stop switch</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Per organization (defaults): 10 concurrent runs, 10 runs per batch, 300k tokens per run, 3M tokens per day (UTC), 60 steps and 1 hour per run, 5 minutes maximum in the queue. Runs truly execute in parallel.</li>
          <li><code>contextcontrol_stop_all_runs</code> with <code>scope: &quot;mine&quot;</code> (default) cancels the runs your key started. <code>scope: &quot;org&quot;</code> pauses every agent run of the organization (chats, teams, heartbeats, scheduled tasks, webhooks, calls); a person resumes it in Agent Studio (or a key with <code>mcp:agents:admin</code>). Tool calls already in progress finish first: a function call completes and a phone call already placed continues.</li>
          <li>Provider rate limits (your own keys) are retried with backoff; a run that still cannot continue ends with &quot;Rate limited by the provider&quot;.</li>
        </ul>
      </div>

      {grouped
        .filter((g) => g.tools.length)
        .map((g) => (
          <div key={g.title} className="space-y-2">
            <h2 className="text-xl font-semibold text-white">{g.title}</h2>
            <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
              {g.tools.map((t) => (
                <div key={t.name} className="p-3 bg-[#0d1017]">
                  <button onClick={() => setOpen(open === t.name ? null : t.name)} className="w-full text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-emerald-300">{t.name}</code>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${t.sideEffect === 'write' ? 'border-amber-800 text-amber-300' : 'border-zinc-700 text-zinc-400'}`}>{t.sideEffect}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400 font-mono">{t.requiredScope}</span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">{t.description}</p>
                  </button>
                  {open === t.name && <pre className="mt-2 p-2 rounded bg-black/50 text-[11px] text-zinc-300 overflow-x-auto">{JSON.stringify(toolInputJsonSchema(t), null, 2)}</pre>}
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
