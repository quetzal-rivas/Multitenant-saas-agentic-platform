'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Server,
  Plug,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Mail,
  CalendarDays,
  Layers,
  Plus,
  Trash2,
  Code2,
  ExternalLink,
  X,
} from 'lucide-react';
import { generateClientConfigSnippets, platformMcpEndpoint } from '@/lib/mcp/client-config';

// ---------------------------------------------------------------------------
// Types (mirror /api/v1/connections and /api/mcp/profiles)
// ---------------------------------------------------------------------------

interface ConnectorTool {
  name: string;
  description: string;
  read_only: boolean;
}
interface ConnectorView {
  id: string;
  name: string;
  description: string;
  mode: 'official' | 'direct' | 'unavailable' | null;
  detail: string | null;
  refreshed_at: string | null;
  tools: ConnectorTool[];
}
interface Connections {
  platform: { tool_count: number; url: string };
  google: {
    configured: boolean;
    connected: boolean;
    account_email: string | null;
    account_domain: string | null;
    scopes: string[];
    status: 'active' | 'error' | null;
    last_error: string | null;
    connected_at: string | null;
    connectors: ConnectorView[];
  };
  web_search: { available: boolean; provider: string | null; tool: string };
}
interface Profile {
  id: string;
  name: string;
  description: string | null;
  functionIds: string[];
  connectorTools: string[];
}
interface Fn {
  id: string;
  name: string;
  function_slug: string;
  description: string | null;
  status: string;
}

interface McpHubViewProps {
  onOpenPlatformMcp?: () => void;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, cache: 'no-store' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

const card = 'rounded-xl border border-zinc-800 bg-[#0d1017] p-5';
const inputCls = 'w-full bg-[#090b0f] border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500';
const MODE_LABEL: Record<string, { text: string; cls: string }> = {
  official: { text: 'Official Google MCP', cls: 'text-emerald-300 border-emerald-800 bg-emerald-950/40' },
  direct: { text: 'Direct Google API', cls: 'text-sky-300 border-sky-800 bg-sky-950/40' },
  unavailable: { text: 'Unavailable', cls: 'text-zinc-400 border-zinc-700 bg-zinc-900' },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="p-1.5 rounded-md border border-zinc-700 text-zinc-400 hover:text-white"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ---------------------------------------------------------------------------

export const McpHubView: React.FC<McpHubViewProps> = ({ onOpenPlatformMcp }) => {
  const [tab, setTab] = useState<'connections' | 'profiles' | 'clients'>('connections');
  const [connections, setConnections] = useState<Connections | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setConnections(await api<Connections>('/api/v1/connections'));
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Could not load connections');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toolCount = useMemo(() => {
    if (!connections) return 0;
    return (
      connections.platform.tool_count +
      connections.google.connectors.reduce((n, c) => n + c.tools.length, 0) +
      (connections.web_search.available ? 1 : 0)
    );
  }, [connections]);

  return (
    <div className="h-full overflow-y-auto bg-[#090b10] text-zinc-100">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <header className="space-y-2">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Server className="w-5 h-5 text-emerald-400" /> MCP Hub &amp; Tools</h1>
          <p className="text-sm text-zinc-400 max-w-3xl">
            Connect apps once for your organization. Their tools, your platform tools and your functions are all served from one MCP URL and
            can be given to agents through profiles.
          </p>
          {connections && (
            <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
              <span>{toolCount} tools available</span>
              <span>·</span>
              <span>Google {connections.google.connected ? `connected (${connections.google.account_email})` : 'not connected'}</span>
              <span>·</span>
              <span>Web search {connections.web_search.available ? `via ${connections.web_search.provider}` : 'needs an LLM key'}</span>
            </div>
          )}
        </header>

        <div className="flex gap-1 border-b border-zinc-800">
          {([
            ['connections', 'Connections'],
            ['profiles', 'Profiles'],
            ['clients', 'Connect clients'],
          ] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 text-sm border-b-2 -mb-px ${tab === id ? 'border-emerald-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}>
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </div>
        )}

        {!connections && !error && (
          <div className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        )}

        {connections && tab === 'connections' && <ConnectionsTab data={connections} onChanged={load} onOpenPlatformMcp={onOpenPlatformMcp} />}
        {connections && tab === 'profiles' && <ProfilesTab connections={connections} />}
        {connections && tab === 'clients' && <ClientsTab url={connections.platform.url} />}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

const ConnectionsTab: React.FC<{ data: Connections; onChanged: () => void; onOpenPlatformMcp?: () => void }> = ({ data, onChanged, onOpenPlatformMcp }) => {
  const [busy, setBusy] = useState<null | 'connect' | 'refresh' | 'disconnect'>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const g = data.google;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'CONNECTION_SUCCESS') {
        setMessage({ ok: true, text: event.data.message || 'Google connected.' });
        setBusy(null);
        onChanged();
      } else if (event.data?.type === 'CONNECTION_ERROR') {
        setMessage({ ok: false, text: event.data.message || 'Connection failed.' });
        setBusy(null);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onChanged]);

  const connect = async () => {
    setBusy('connect');
    setMessage(null);
    try {
      const { url } = await api<{ url: string }>('/api/v1/connections/google/connect', { method: 'POST', body: '{}' });
      const w = 520;
      const h = 680;
      const popup = window.open(url, 'connect_google', `width=${w},height=${h},left=${window.screenX + (window.outerWidth - w) / 2},top=${window.screenY + 60}`);
      if (!popup) {
        setMessage({ ok: false, text: 'Your browser blocked the popup. Allow popups for this site and try again.' });
        setBusy(null);
        return;
      }
      // If the window is closed without finishing, stop waiting.
      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          setBusy((b) => (b === 'connect' ? null : b));
          onChanged();
        }
      }, 800);
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || 'Could not start the connection.' });
      setBusy(null);
    }
  };

  const act = async (kind: 'refresh' | 'disconnect') => {
    if (kind === 'disconnect' && !window.confirm('Disconnect Google? Agents lose the Google tools until you connect again.')) return;
    setBusy(kind);
    setMessage(null);
    try {
      if (kind === 'refresh') await api('/api/v1/connections/google/refresh', { method: 'POST', body: '{}' });
      else await api('/api/v1/connections/google', { method: 'DELETE' });
      setMessage({ ok: true, text: kind === 'refresh' ? 'Tools reloaded from Google.' : 'Google disconnected.' });
      onChanged();
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || 'Failed.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {message && (
        <div className={`p-3 rounded-lg text-xs flex items-center gap-2 border ${message.ok ? 'bg-emerald-950/30 border-emerald-900 text-emerald-300' : 'bg-rose-950/30 border-rose-900 text-rose-300'}`}>
          {message.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />} {message.text}
        </div>
      )}

      {/* Platform */}
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2"><Server className="w-4 h-4 text-emerald-400" /> Context Control Platform</h2>
            <p className="text-xs text-zinc-400 mt-1">Built in. {data.platform.tool_count} platform tools (profiles, scheduled tasks, Supervisor Board, API keys) plus your functions and connected apps, all at one URL.</p>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded border text-emerald-300 border-emerald-800 bg-emerald-950/40">Always on</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <code className="flex-1 text-xs font-mono bg-[#06080b] border border-zinc-800 rounded-lg px-3 py-2 text-emerald-300 truncate">{data.platform.url}</code>
          <CopyButton text={data.platform.url} />
          {onOpenPlatformMcp && (
            <button onClick={onOpenPlatformMcp} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:text-white">
              Playground <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      </section>

      {/* Google */}
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2"><Plug className="w-4 h-4 text-sky-400" /> Google</h2>
            <p className="text-xs text-zinc-400 mt-1">
              {g.connected
                ? <>Connected as <span className="text-zinc-200">{g.account_email}</span>{g.account_domain ? <> (Workspace: {g.account_domain})</> : ' (personal account)'}. Every agent in this organization with these tools in its profile acts as this account.</>
                : 'One Google account for the whole organization. You approve exactly what Context Control may do on Google’s own consent screen.'}
            </p>
            {g.status === 'error' && <p className="text-xs text-rose-400 mt-1">{g.last_error}</p>}
          </div>
          <div className="flex items-center gap-2">
            {g.connected ? (
              <>
                <button onClick={() => act('refresh')} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:text-white disabled:opacity-50">
                  <RefreshCw className={`w-3.5 h-3.5 ${busy === 'refresh' ? 'animate-spin' : ''}`} /> Refresh tools
                </button>
                {g.status === 'error' && (
                  <button onClick={connect} disabled={!!busy} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold">Reconnect</button>
                )}
                <button onClick={() => act('disconnect')} disabled={!!busy} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-400 hover:text-rose-400 disabled:opacity-50">Disconnect</button>
              </>
            ) : (
              <button
                onClick={connect}
                disabled={!!busy || !g.configured}
                title={g.configured ? '' : 'Google is not configured on this server yet'}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50"
              >
                {busy === 'connect' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />} Connect Google
              </button>
            )}
          </div>
        </div>
        {!g.configured && <p className="mt-3 text-xs text-amber-400">The server administrator still needs to add a Google OAuth client (GOOGLE_OAUTH_CLIENT_ID / SECRET).</p>}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {g.connectors.map((c) => {
            const mode = c.mode ? MODE_LABEL[c.mode] : null;
            const Icon = c.id === 'gmail' ? Mail : CalendarDays;
            return (
              <div key={c.id} className="rounded-lg border border-zinc-800 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-white flex items-center gap-1.5"><Icon className="w-4 h-4 text-zinc-400" /> {c.name}</span>
                  {mode && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${mode.cls}`}>{mode.text}</span>}
                </div>
                <p className="text-xs text-zinc-500">{c.description}</p>
                {g.connected ? (
                  c.tools.length ? (
                    <ul className="space-y-1">
                      {c.tools.map((t) => (
                        <li key={t.name} className="text-[11px]">
                          <span className="font-mono text-zinc-200">{t.name}</span>
                          {t.read_only && <span className="ml-1 text-zinc-600">read</span>}
                          <span className="block text-zinc-500 truncate">{t.description}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-zinc-500">No tools available. {c.detail}</p>
                  )
                ) : (
                  <p className="text-[11px] text-zinc-600">Connect Google to load these tools.</p>
                )}
                {c.mode === 'direct' && c.detail && <p className="text-[10px] text-zinc-600" title={c.detail}>Using the direct API because Google&apos;s official MCP server is not available to this account.</p>}
              </div>
            );
          })}
        </div>
      </section>

      {/* Web search */}
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2"><Search className="w-4 h-4 text-amber-400" /> Web search</h2>
            <p className="text-xs text-zinc-400 mt-1">
              Tool <span className="font-mono text-zinc-200">web_search</span>: searches the web with your organization&apos;s own LLM key and returns an answer with source links.
              Gemini uses Google Search; Claude and OpenAI use their own web search.
            </p>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded border ${data.web_search.available ? 'text-emerald-300 border-emerald-800 bg-emerald-950/40' : 'text-zinc-400 border-zinc-700'}`}>
            {data.web_search.available ? `Uses your ${data.web_search.provider} key` : 'Add an LLM key to enable'}
          </span>
        </div>
      </section>

      <p className="text-xs text-zinc-600">More connectors (GitHub, Notion, Linear, …) will appear here as they are added.</p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

const ProfilesTab: React.FC<{ connections: Connections }> = ({ connections }) => {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [functions, setFunctions] = useState<Fn[]>([]);
  const [usage, setUsage] = useState<Record<string, string[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, f, s, t] = await Promise.all([
        api<{ profiles: Profile[] }>('/api/mcp/profiles'),
        api<{ functions: Fn[] }>('/api/v1/functions').catch(() => ({ functions: [] as Fn[] })),
        api<{ sessions: Array<{ name: string; mcp_profile_id: string | null; team_id: string | null }> }>('/api/v1/agent-sessions').catch(() => ({ sessions: [] })),
        api<{ teams: Array<{ name: string; supervisor_mcp_profile_id: string | null }> }>('/api/v1/agent-teams').catch(() => ({ teams: [] })),
      ]);
      setProfiles(p.profiles);
      setFunctions(f.functions);
      const used: Record<string, string[]> = {};
      for (const x of s.sessions) if (x.mcp_profile_id && !x.team_id) (used[x.mcp_profile_id] ||= []).push(`Instance “${x.name}”`);
      for (const x of t.teams) if (x.supervisor_mcp_profile_id) (used[x.supervisor_mcp_profile_id] ||= []).push(`Team “${x.name}”`);
      setUsage(used);
      setSelectedId((cur) => (cur && p.profiles.some((x) => x.id === cur) ? cur : p.profiles[0]?.id ?? null));
    } catch (err: any) {
      setError(err?.message || 'Could not load profiles');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const profile = profiles?.find((p) => p.id === selectedId) ?? null;
  const connectorGroups = useMemo(() => {
    const groups: Array<{ id: string; name: string; tools: ConnectorTool[]; reason: string | null }> = connections.google.connectors.map((c) => ({
      id: c.id,
      name: c.name,
      tools: c.tools,
      reason: !connections.google.connected ? 'Connect Google first' : c.tools.length ? null : 'No tools available',
    }));
    groups.push({
      id: 'web_search',
      name: 'Web search',
      tools: [{ name: 'web_search', description: 'Search the web with your LLM key', read_only: true }],
      reason: connections.web_search.available ? null : 'Add an LLM key first',
    });
    return groups;
  }, [connections]);

  const save = async (data: Record<string, unknown>) => {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      const { profile: updated } = await api<{ profile: Profile }>('/api/mcp/profiles', { method: 'POST', body: JSON.stringify({ action: 'update', id: profile.id, data }) });
      setProfiles((list) => (list || []).map((p) => (p.id === updated.id ? updated : p)));
    } catch (err: any) {
      setError(err?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: 'function_ids' | 'connector_tools', current: string[], value: string) =>
    save({ [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] });

  const archive = async () => {
    if (!profile || !window.confirm(`Archive profile "${profile.name}"? Instances and teams using it lose its tools.`)) return;
    try {
      await api('/api/mcp/profiles', { method: 'POST', body: JSON.stringify({ action: 'delete', id: profile.id }) });
      setSelectedId(null);
      load();
    } catch (err: any) {
      setError(err?.message || 'Could not archive');
    }
  };

  if (!profiles) return <div className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading profiles…</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
      <aside className="space-y-2">
        <button onClick={() => setCreating(true)} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold">
          <Plus className="w-3.5 h-3.5" /> New profile
        </button>
        {profiles.map((p) => (
          <button key={p.id} onClick={() => setSelectedId(p.id)} className={`w-full text-left px-3 py-2.5 rounded-lg border ${p.id === selectedId ? 'bg-zinc-800/70 border-zinc-600' : 'border-zinc-800 hover:border-zinc-700'}`}>
            <div className="text-sm text-white truncate">{p.name}</div>
            <div className="text-[11px] text-zinc-500">{p.functionIds.length} functions · {p.connectorTools.length} app tools</div>
          </button>
        ))}
        {profiles.length === 0 && <p className="text-xs text-zinc-500 p-2">No profiles yet.</p>}
      </aside>

      <div className="space-y-4">
        {error && <p className="text-xs text-rose-400">{error}</p>}
        {!profile ? (
          <div className={`${card} text-center space-y-2`}>
            <Layers className="w-6 h-6 text-emerald-400 mx-auto" />
            <h3 className="text-sm font-semibold text-white">Profiles group tools for agents</h3>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              A profile is the set of functions and connected-app tools an agent gets on top of its platform tools. Attach it to an Agent Studio instance, a team
              supervisor or a worker, or bind an API key to it.
            </p>
          </div>
        ) : (
          <>
            <section className={card}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-white">{profile.name}</h2>
                  {profile.description && <p className="text-xs text-zinc-400 mt-1">{profile.description}</p>}
                  <p className="text-[11px] text-zinc-500 mt-2">Used by: {usage[profile.id]?.join(', ') || 'nothing yet. Attach it in Agent Studio or Team Builder.'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />}
                  <button onClick={archive} className="p-2 rounded-lg border border-zinc-800 text-zinc-500 hover:text-rose-400" title="Archive"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </section>

            <section className={card}>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Plug className="w-4 h-4 text-sky-400" /> Connected-app tools</h3>
              <div className="mt-3 space-y-4">
                {connectorGroups.map((group) => (
                  <div key={group.id}>
                    <div className="text-xs text-zinc-300 mb-1.5">{group.name} {group.reason && <span className="text-zinc-600">· {group.reason}</span>}</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {group.tools.map((t) => {
                        const on = profile.connectorTools.includes(t.name);
                        return (
                          <label key={t.name} className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${group.reason ? 'opacity-50 cursor-not-allowed border-zinc-800' : on ? 'bg-emerald-950/20 border-emerald-900 cursor-pointer' : 'border-zinc-800 hover:border-zinc-700 cursor-pointer'}`}>
                            <input type="checkbox" checked={on} disabled={!!group.reason || saving} onChange={() => toggle('connector_tools', profile.connectorTools, t.name)} className="mt-0.5" />
                            <span className="min-w-0">
                              <span className="block text-xs font-mono text-white">{t.name}</span>
                              <span className="block text-[11px] text-zinc-500 truncate">{t.description}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className={card}>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Code2 className="w-4 h-4 text-emerald-400" /> Functions</h3>
              <p className="text-[11px] text-zinc-500 mt-1">From AI Function Studio. Only deployed functions are given to agents.</p>
              {functions.length === 0 && <p className="text-xs text-zinc-500 mt-2">No functions yet.</p>}
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                {functions.map((fn) => {
                  const on = profile.functionIds.includes(fn.id);
                  return (
                    <label key={fn.id} className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer ${on ? 'bg-emerald-950/20 border-emerald-900' : 'border-zinc-800 hover:border-zinc-700'}`}>
                      <input type="checkbox" checked={on} disabled={saving} onChange={() => toggle('function_ids', profile.functionIds, fn.id)} className="mt-0.5" />
                      <span className="min-w-0">
                        <span className="block text-xs font-mono text-white">fn_{fn.function_slug}</span>
                        <span className="block text-[11px] text-zinc-500 truncate">{fn.description || fn.name}</span>
                        {fn.status !== 'deployed' && <span className="block text-[10px] text-amber-400">Not deployed</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>

      {creating && (
        <NewProfileModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setSelectedId(id);
            load();
          }}
        />
      )}
    </div>
  );
};

const NewProfileModal: React.FC<{ onClose: () => void; onCreated: (id: string) => void }> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { profile } = await api<{ profile: Profile }>('/api/mcp/profiles', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, issueApiKey: false }),
      });
      onCreated(profile.id);
    } catch (err: any) {
      setError(err?.message || 'Could not create the profile');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0e131e] border border-zinc-700 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">New profile</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Assistant" autoFocus />
        <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it's for (optional)" />
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-xs text-zinc-400 hover:text-white">Cancel</button>
          <button onClick={create} disabled={busy || !name.trim()} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50">
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Connect clients
// ---------------------------------------------------------------------------

const ClientsTab: React.FC<{ url: string }> = ({ url }) => {
  const origin = url.replace(/\/api\/mcp\/platform$/, '');
  const snippets = generateClientConfigSnippets('', origin);
  const blocks: Array<{ title: string; text: string }> = [
    { title: 'Claude Code', text: snippets.claudeCode },
    { title: 'Cursor (.cursor/mcp.json)', text: JSON.stringify(snippets.cursor, null, 2) },
    { title: 'Windsurf', text: JSON.stringify(snippets.windsurf, null, 2) },
    { title: 'Claude Desktop (via mcp-remote)', text: JSON.stringify(snippets.claudeDesktop, null, 2) },
  ];
  return (
    <div className="space-y-4">
      <section className={card}>
        <h2 className="text-sm font-semibold text-white">One URL for every client</h2>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 text-xs font-mono bg-[#06080b] border border-zinc-800 rounded-lg px-3 py-2 text-emerald-300 truncate">{platformMcpEndpoint(origin)}</code>
          <CopyButton text={platformMcpEndpoint(origin)} />
        </div>
        <ol className="mt-3 text-xs text-zinc-400 space-y-1 list-decimal list-inside">
          <li>Create an API key in <span className="text-zinc-200">API Keys &amp; Tokens</span>. Tick the scopes it needs, including <span className="font-mono">mcp:connectors:invoke</span> for connected-app tools and <span className="font-mono">mcp:functions:invoke</span> for functions.</li>
          <li>Optionally bind the key to a profile: then it only sees that profile&apos;s app tools and functions.</li>
          <li>Paste the key in place of the placeholder below.</li>
        </ol>
      </section>
      {blocks.map((b) => (
        <section key={b.title} className={card}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-zinc-200">{b.title}</h3>
            <CopyButton text={b.text} />
          </div>
          <pre className="text-[11px] font-mono text-zinc-300 bg-[#06080b] border border-zinc-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">{b.text}</pre>
        </section>
      ))}
    </div>
  );
};
