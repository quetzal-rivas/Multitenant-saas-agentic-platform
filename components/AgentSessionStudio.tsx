'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Send,
  Database,
  ChevronDown,
  Code2,
  CheckCircle2,
  Plus,
  Trash2,
  Pencil,
  GitBranch,
  AlertTriangle,
  Check,
  Copy,
  Wrench,
  Settings2,
  X,
  Loader2,
  Info,
} from 'lucide-react';
import { PLATFORM_TOOL_DEFINITIONS } from '@/lib/mcp/tool-catalog';

// ---------------------------------------------------------------------------
// Types mirroring /api/v1/agent-sessions responses
// ---------------------------------------------------------------------------

type Provider = 'anthropic' | 'openai' | 'gemini';

interface AgentSession {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  mcp_profile_id: string | null;
  context_profile_id: string | null;
  allowed_tools: string[];
  forked_from_checkpoint: string | null;
  created_at: string;
  last_active_at: string;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

interface TranscriptItem {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  isError?: boolean;
  toolCalls?: ToolCall[];
}

interface CheckpointSummary {
  id: string;
  step_index: number;
  parent_id: string | null;
  user_message: string;
  assistant_message: string | null;
  tools_executed: Array<{ toolName: string; isError: boolean; latencyMs: number }>;
  usage: { totalTokens?: number; steps?: number };
  metadata: Record<string, any>;
  created_at: string;
}

interface ProviderInfo {
  id: Provider;
  configured: boolean;
  defaultModel: string;
}

interface NamedOption {
  id: string;
  name: string;
  selectedToolNames?: string[];
}

interface AgentSessionStudioProps {
  /** Opens this instance on load when it exists (e.g. from another screen). */
  initialThreadId?: string;
  initialProfileId?: string;
}

const PROVIDER_LABELS: Record<Provider, string> = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Google Gemini' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_TOOLS = PLATFORM_TOOL_DEFINITIONS.filter((t) => t.sideEffect === 'read').map((t) => t.name);

const SAMPLE_PROMPTS: Record<string, string> = {
  contextcontrol_list_profiles: 'Which MCP profiles do we have, and what are their token budgets?',
  contextcontrol_list_tasks: 'What tasks are scheduled right now?',
  contextcontrol_schedule_task: 'Schedule a task for tomorrow at 9am to review new leads.',
  contextcontrol_list_api_keys: 'List our API keys and when each was last used.',
  contextcontrol_create_profile: 'Create an MCP profile called "Support triage" with a 16k token budget.',
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (body?.code === 'NO_ORGANIZATION') throw new Error('Finish onboarding to create an organization first.');
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body as T;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Instance create / edit form
// ---------------------------------------------------------------------------

interface InstanceFormValues {
  name: string;
  provider: Provider;
  model: string;
  mcp_profile_id: string;
  context_profile_id: string;
  allowed_tools: string[];
}

const InstanceModal: React.FC<{
  mode: 'create' | 'edit';
  initial: InstanceFormValues;
  providers: ProviderInfo[];
  mcpProfiles: NamedOption[];
  contextProfiles: NamedOption[];
  onCancel: () => void;
  onSubmit: (values: InstanceFormValues) => Promise<void>;
}> = ({ mode, initial, providers, mcpProfiles, contextProfiles, onCancel, onSubmit }) => {
  const [values, setValues] = useState<InstanceFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = providers.filter((p) => p.configured);
  const set = <K extends keyof InstanceFormValues>(key: K, value: InstanceFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err: any) {
      setError(err?.message || 'Could not save instance');
    } finally {
      setSaving(false);
    }
  };

  const noProviders = mode === 'create' && configured.length === 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#0e131e] border border-zinc-700 rounded-2xl p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-white">{mode === 'create' ? 'New agent instance' : 'Edit instance'}</h3>
            <p className="text-xs text-zinc-400 mt-1">
              An instance is a saved conversation with fixed settings. Every turn is stored as a checkpoint.
            </p>
          </div>
          <button onClick={onCancel} className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {noProviders ? (
          <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-900/60 text-xs text-amber-200 space-y-1">
            <p className="font-semibold">No LLM key stored for this organization.</p>
            <p>Instances run on your own Anthropic, OpenAI, or Gemini key. Add one under Account &amp; Billing → Secrets, then come back.</p>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            <label className="block space-y-1">
              <span className="font-mono text-zinc-300">Name</span>
              <input
                value={values.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Ops assistant"
                autoFocus
                className="w-full bg-[#090b0f] border border-zinc-700 rounded-lg px-3 py-2 font-mono text-white focus:outline-none focus:border-emerald-500"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="font-mono text-zinc-300">LLM provider</span>
                <select
                  value={values.provider}
                  disabled={mode === 'edit'}
                  onChange={(e) => {
                    const p = providers.find((x) => x.id === e.target.value)!;
                    setValues((v) => ({ ...v, provider: p.id, model: p.defaultModel }));
                  }}
                  className="w-full bg-[#090b0f] border border-zinc-700 rounded-lg px-3 py-2 font-mono text-white disabled:opacity-60"
                >
                  {(mode === 'edit' ? providers : configured).map((p) => (
                    <option key={p.id} value={p.id}>
                      {PROVIDER_LABELS[p.id]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="font-mono text-zinc-300">Model</span>
                <input
                  value={values.model}
                  disabled={mode === 'edit'}
                  onChange={(e) => set('model', e.target.value)}
                  className="w-full bg-[#090b0f] border border-zinc-700 rounded-lg px-3 py-2 font-mono text-white disabled:opacity-60"
                />
              </label>
            </div>
            {mode === 'edit' && (
              <p className="text-[11px] text-zinc-500 -mt-2">Provider and model are fixed once an instance exists. Fork it to change them.</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="font-mono text-zinc-300">Context profile</span>
                <select
                  value={values.context_profile_id}
                  onChange={(e) => set('context_profile_id', e.target.value)}
                  className="w-full bg-[#090b0f] border border-zinc-700 rounded-lg px-3 py-2 font-mono text-white"
                >
                  <option value="">None</option>
                  {contextProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="font-mono text-zinc-300">MCP profile</span>
                <select
                  value={values.mcp_profile_id}
                  onChange={(e) => set('mcp_profile_id', e.target.value)}
                  className="w-full bg-[#090b0f] border border-zinc-700 rounded-lg px-3 py-2 font-mono text-white"
                >
                  <option value="">None</option>
                  {mcpProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-[11px] text-zinc-500 -mt-2">
              The context profile&apos;s instruction and policy steps become the agent&apos;s system prompt.
            </p>

            <div className="space-y-1.5">
              <span className="font-mono text-zinc-300">Tools this instance may use</span>
              <div className="space-y-1 p-2 rounded-lg bg-[#07090f] border border-zinc-800 max-h-52 overflow-y-auto">
                {PLATFORM_TOOL_DEFINITIONS.map((t) => (
                  <label key={t.name} className="flex items-start gap-2 font-mono text-zinc-300 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={values.allowed_tools.includes(t.name)}
                      onChange={() =>
                        set(
                          'allowed_tools',
                          values.allowed_tools.includes(t.name)
                            ? values.allowed_tools.filter((n) => n !== t.name)
                            : [...values.allowed_tools, t.name]
                        )
                      }
                      className="mt-0.5 rounded bg-zinc-900 border-zinc-700 text-emerald-500"
                    />
                    <span className="flex-1">
                      {t.name}
                      {t.sideEffect === 'write' && <span className="ml-1.5 text-[10px] text-amber-400">writes data</span>}
                    </span>
                  </label>
                ))}
              </div>
              {values.allowed_tools.some((n) => PLATFORM_TOOL_DEFINITIONS.find((t) => t.name === n)?.sideEffect === 'write') && (
                <p className="text-[11px] text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> The agent can change real data with the selected write tools.
                </p>
              )}
            </div>

            {error && <p className="text-rose-400 font-mono">{error}</p>}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
          <button onClick={onCancel} className="px-3.5 py-2 rounded-lg text-xs text-zinc-400 hover:text-white">
            Cancel
          </button>
          {!noProviders && (
            <button
              onClick={submit}
              disabled={saving || !values.name.trim() || !values.model.trim()}
              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs disabled:opacity-50"
            >
              {saving ? 'Saving…' : mode === 'create' ? 'Create instance' : 'Save changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Studio
// ---------------------------------------------------------------------------

export const AgentSessionStudio: React.FC<AgentSessionStudioProps> = ({ initialThreadId }) => {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointSummary[]>([]);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [mcpProfiles, setMcpProfiles] = useState<NamedOption[]>([]);
  const [contextProfiles, setContextProfiles] = useState<NamedOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [tab, setTab] = useState<'config' | 'checkpoints' | 'api'>('config');
  const [checkpointDetail, setCheckpointDetail] = useState<any | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const active = sessions.find((s) => s.id === activeId) || null;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const loadSessions = useCallback(async (preferId?: string | null) => {
    const { sessions: list } = await api<{ sessions: AgentSession[] }>('/api/v1/agent-sessions');
    setSessions(list);
    setActiveId((current) => {
      const want = preferId || current;
      return want && list.some((s) => s.id === want) ? want : list[0]?.id || null;
    });
    return list;
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const detail = await api<{ checkpoints: CheckpointSummary[]; transcript: TranscriptItem[] }>(
      `/api/v1/agent-sessions/${id}`
    );
    setCheckpoints(detail.checkpoints);
    setTranscript(detail.transcript);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [prov, mcp, ctx] = await Promise.all([
          api<{ providers: ProviderInfo[] }>('/api/v1/llm-providers'),
          api<{ profiles: NamedOption[] }>('/api/mcp/profiles').catch(() => ({ profiles: [] })),
          api<{ profiles: NamedOption[] }>('/api/v1/context-profiles').catch(() => ({ profiles: [] })),
        ]);
        setProviders(prov.providers);
        setMcpProfiles(mcp.profiles);
        setContextProfiles(ctx.profiles);
        await loadSessions(initialThreadId && UUID_RE.test(initialThreadId) ? initialThreadId : null);
      } catch (err: any) {
        setLoadError(err?.message || 'Could not load Agent Studio');
      } finally {
        setLoading(false);
      }
    })();
  }, [initialThreadId, loadSessions]);

  useEffect(() => {
    setTurnError(null);
    if (!activeId) {
      setCheckpoints([]);
      setTranscript([]);
      return;
    }
    loadDetail(activeId).catch((err) => setTurnError(err?.message || 'Could not load conversation'));
  }, [activeId, loadDetail]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, sending]);

  const toolResults = useMemo(() => {
    const map = new Map<string, TranscriptItem>();
    transcript.forEach((t) => t.role === 'tool' && t.toolCallId && map.set(t.toolCallId, t));
    return map;
  }, [transcript]);

  const samplePrompts = useMemo(
    () => (active?.allowed_tools || []).map((t) => SAMPLE_PROMPTS[t]).filter(Boolean).slice(0, 3),
    [active]
  );

  const copy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSend = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || !active || sending) return;
    setInput('');
    setTurnError(null);
    setSending(true);
    setTranscript((t) => [...t, { role: 'user', content: message }]);
    try {
      const result = await api<{ transcript: TranscriptItem[] }>('/api/v1/chat/generate', {
        method: 'POST',
        body: JSON.stringify({ session_id: active.id, message }),
      });
      setTranscript(result.transcript);
      await Promise.all([loadDetail(active.id), loadSessions(active.id)]);
    } catch (err: any) {
      setTurnError(err?.message || 'The turn failed');
      setTranscript((t) => t.slice(0, -1));
      setInput(message);
    } finally {
      setSending(false);
    }
  };

  const formFromSession = (s: AgentSession | null): InstanceFormValues => {
    const firstConfigured = providers.find((p) => p.configured) || providers[0];
    return s
      ? {
          name: s.name,
          provider: s.provider,
          model: s.model,
          mcp_profile_id: s.mcp_profile_id || '',
          context_profile_id: s.context_profile_id || '',
          allowed_tools: s.allowed_tools,
        }
      : {
          name: '',
          provider: firstConfigured?.id || 'anthropic',
          model: firstConfigured?.defaultModel || '',
          mcp_profile_id: '',
          context_profile_id: '',
          allowed_tools: DEFAULT_TOOLS,
        };
  };

  const submitInstance = async (values: InstanceFormValues) => {
    const attachments = {
      mcp_profile_id: values.mcp_profile_id || null,
      context_profile_id: values.context_profile_id || null,
      allowed_tools: values.allowed_tools,
    };
    if (modal === 'create') {
      const { session } = await api<{ session: AgentSession }>('/api/v1/agent-sessions', {
        method: 'POST',
        body: JSON.stringify({ name: values.name.trim(), provider: values.provider, model: values.model.trim(), ...attachments }),
      });
      await loadSessions(session.id);
    } else if (active) {
      await api(`/api/v1/agent-sessions/${active.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: values.name.trim(), ...attachments }),
      });
      await loadSessions(active.id);
    }
    setModal(null);
  };

  const archiveActive = async () => {
    if (!active || !confirm(`Archive "${active.name}"? Its checkpoints are kept but it leaves this list.`)) return;
    try {
      await api(`/api/v1/agent-sessions/${active.id}`, { method: 'DELETE' });
      await loadSessions(null);
    } catch (err: any) {
      setTurnError(err?.message || 'Could not archive instance');
    }
  };

  const openCheckpoint = async (id: string) => {
    try {
      const { checkpoint } = await api<{ checkpoint: any }>(`/api/v1/checkpoints/${id}`);
      setCheckpointDetail(checkpoint);
    } catch (err: any) {
      setTurnError(err?.message || 'Could not load checkpoint');
    }
  };

  const forkFrom = async (checkpointId: string) => {
    try {
      const { session } = await api<{ session: AgentSession }>('/api/v1/agent-sessions/fork', {
        method: 'POST',
        body: JSON.stringify({ checkpoint_id: checkpointId }),
      });
      setCheckpointDetail(null);
      await loadSessions(session.id);
    } catch (err: any) {
      setTurnError(err?.message || 'Could not fork');
    }
  };

  const chatCurl = `curl -X POST ${origin}/api/v1/chat/generate \\
  -H "Authorization: Bearer $CONTEXT_CONTROL_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "session_id": "${active?.id || '<SESSION_ID>'}",
    "message": "What tasks are scheduled right now?"
  }'`;

  const createCurl = `curl -X POST ${origin}/api/v1/agent-sessions \\
  -H "Authorization: Bearer $CONTEXT_CONTROL_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Ops assistant",
    "provider": "${active?.provider || 'anthropic'}",
    "allowed_tools": ${JSON.stringify(active?.allowed_tools || DEFAULT_TOOLS)}
  }'`;

  const mcpProfile = mcpProfiles.find((p) => p.id === active?.mcp_profile_id);
  const contextProfile = contextProfiles.find((p) => p.id === active?.context_profile_id);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center bg-[#090b10] text-zinc-400 text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading Agent Studio…
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-[#090b10] text-zinc-100 overflow-hidden">
      {/* CHAT */}
      <div className="flex-1 flex flex-col border-r border-zinc-800/80 min-w-0">
        <header className="px-5 py-3 border-b border-zinc-800 bg-[#0d1017] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">Agent instance</div>
              <div className="relative mt-0.5">
                <select
                  value={activeId || ''}
                  onChange={(e) => setActiveId(e.target.value || null)}
                  disabled={sessions.length === 0}
                  className="bg-zinc-900 border border-zinc-700/80 text-white font-medium text-xs rounded-md px-2.5 py-1.5 pr-8 focus:outline-none focus:border-emerald-500 appearance-none max-w-xs truncate disabled:opacity-60"
                >
                  {sessions.length === 0 && <option value="">No instances yet</option>}
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {relativeTime(s.last_active_at)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-2 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {active && (
              <>
                <button
                  onClick={() => setModal('edit')}
                  className="p-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
                  title="Rename or change attachments"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={archiveActive}
                  className="p-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400"
                  title="Archive instance"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              onClick={() => setModal('create')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              New instance
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loadError && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300">{loadError}</div>
          )}

          {!loadError && !active && (
            <div className="max-w-md mx-auto text-center pt-16 space-y-3">
              <Bot className="w-8 h-8 text-emerald-400 mx-auto" />
              <h2 className="text-lg font-bold text-white">Create your first agent instance</h2>
              <p className="text-sm text-zinc-400">
                Give it a name, pick your LLM key, attach a context profile and an MCP profile, and choose the tools it may use.
              </p>
              <button
                onClick={() => setModal('create')}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
              >
                New instance
              </button>
            </div>
          )}

          {active && transcript.length === 0 && !sending && (
            <div className="max-w-xl mx-auto text-center pt-10 space-y-4">
              <h2 className="text-lg font-bold text-white">{active.name}</h2>
              <p className="text-sm text-zinc-400">
                Runs on {PROVIDER_LABELS[active.provider]} <code className="text-zinc-300">{active.model}</code> with{' '}
                {active.allowed_tools.length} tool(s). Each turn is saved as a checkpoint you can inspect or fork.
              </p>
              {samplePrompts.length > 0 && (
                <div className="space-y-2 text-left">
                  {samplePrompts.map((p) => (
                    <button
                      key={p}
                      onClick={() => handleSend(p)}
                      className="w-full p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 hover:border-emerald-700 text-sm text-zinc-200 text-left"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {transcript.map((item, i) => {
            if (item.role === 'tool') return null; // shown under the call that produced it
            if (item.role === 'user') {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-sm bg-emerald-700/30 border border-emerald-800/60 text-sm whitespace-pre-wrap">
                    {item.content}
                  </div>
                </div>
              );
            }
            return (
              <div key={i} className="flex gap-3">
                <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="max-w-[80%] space-y-2 min-w-0">
                  {item.content && <div className="text-sm text-zinc-100 whitespace-pre-wrap leading-relaxed">{item.content}</div>}
                  {item.toolCalls?.map((call) => {
                    const result = toolResults.get(call.id);
                    return (
                      <details key={call.id} className="rounded-lg border border-zinc-800 bg-[#0d1017] text-xs font-mono">
                        <summary className="px-3 py-2 cursor-pointer flex items-center gap-2 text-zinc-300">
                          <Wrench className="w-3.5 h-3.5 text-cyan-400" />
                          {call.name}
                          {result?.isError ? (
                            <span className="text-rose-400">failed</span>
                          ) : result ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : null}
                        </summary>
                        <div className="px-3 pb-3 space-y-2">
                          <div>
                            <div className="text-zinc-500 mb-1">input</div>
                            <pre className="p-2 rounded bg-black/40 overflow-x-auto">{JSON.stringify(call.arguments, null, 2)}</pre>
                          </div>
                          {result && (
                            <div>
                              <div className="text-zinc-500 mb-1">output</div>
                              <pre className={`p-2 rounded bg-black/40 overflow-x-auto max-h-64 ${result.isError ? 'text-rose-300' : ''}`}>
                                {result.content}
                              </pre>
                            </div>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running agent…
            </div>
          )}
          {turnError && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{turnError}</span>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="p-4 border-t border-zinc-800 bg-[#0d1017]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!active || sending}
              placeholder={active ? `Message ${active.name}…` : 'Create an instance to start'}
              className="flex-1 bg-[#090b0f] border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!active || sending || !input.trim()}
              className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> Send
            </button>
          </form>
        </div>
      </div>

      {/* INSPECTOR */}
      <div className="w-96 flex flex-col bg-[#0b0d13] shrink-0">
        <div className="flex border-b border-zinc-800 text-xs font-mono bg-[#0e1118]">
          {(
            [
              ['config', 'Configuration', Settings2],
              ['checkpoints', `Checkpoints (${checkpoints.length})`, Database],
              ['api', 'API', Code2],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 py-3 px-2 font-medium border-b-2 flex items-center justify-center gap-1.5 ${
                tab === id ? 'border-emerald-500 text-emerald-400 bg-zinc-900/50' : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {!active && <p className="text-zinc-500">Select or create an instance.</p>}

          {active && tab === 'config' && (
            <>
              <section className="space-y-1.5">
                <h4 className="font-mono uppercase text-zinc-500 text-[10px] tracking-wider">LLM</h4>
                <p className="text-zinc-200">
                  {PROVIDER_LABELS[active.provider]} · <code>{active.model}</code>
                </p>
                <p className="text-zinc-500">Runs on your organization&apos;s stored {PROVIDER_LABELS[active.provider]} key.</p>
              </section>
              <section className="space-y-1.5">
                <h4 className="font-mono uppercase text-zinc-500 text-[10px] tracking-wider">Context profile</h4>
                <p className="text-zinc-200">{contextProfile?.name || 'None'}</p>
              </section>
              <section className="space-y-1.5">
                <h4 className="font-mono uppercase text-zinc-500 text-[10px] tracking-wider">MCP profile</h4>
                <p className="text-zinc-200">{mcpProfile?.name || 'None'}</p>
                {(mcpProfile?.selectedToolNames || []).length > 0 && (
                  <div className="space-y-1">
                    {mcpProfile!.selectedToolNames!.map((t) => (
                      <div key={t} className="flex items-center justify-between font-mono text-zinc-500">
                        <span>{t}</span>
                        <span className="text-[10px] text-amber-500/80">not connected</span>
                      </div>
                    ))}
                    <p className="text-[11px] text-zinc-500 flex gap-1">
                      <Info className="w-3 h-3 shrink-0 mt-0.5" /> External account tools run once OAuth connections ship.
                    </p>
                  </div>
                )}
              </section>
              <section className="space-y-1.5">
                <h4 className="font-mono uppercase text-zinc-500 text-[10px] tracking-wider">Enabled tools</h4>
                {active.allowed_tools.length === 0 && <p className="text-zinc-500">No tools: chat only.</p>}
                {active.allowed_tools.map((name) => {
                  const t = PLATFORM_TOOL_DEFINITIONS.find((x) => x.name === name);
                  return (
                    <div key={name} className="flex items-center justify-between font-mono">
                      <span className="text-zinc-200">{name}</span>
                      <span className={`text-[10px] ${t?.sideEffect === 'write' ? 'text-amber-400' : 'text-zinc-500'}`}>{t?.sideEffect}</span>
                    </div>
                  );
                })}
              </section>
              {active.forked_from_checkpoint && (
                <p className="text-zinc-500 flex items-center gap-1">
                  <GitBranch className="w-3 h-3" /> Forked from another instance&apos;s checkpoint.
                </p>
              )}
            </>
          )}

          {active && tab === 'checkpoints' && (
            <>
              <p className="text-zinc-400 leading-relaxed">
                A checkpoint is the saved state after one turn: messages, tool calls and token usage. The next turn resumes from
                the latest one, and you can fork a new instance from any of them.
              </p>
              {checkpoints.length === 0 && <p className="text-zinc-500">No turns yet.</p>}
              {[...checkpoints].reverse().map((c) => (
                <button
                  key={c.id}
                  onClick={() => openCheckpoint(c.id)}
                  className="w-full text-left p-3 rounded-lg bg-[#0d1017] border border-zinc-800 hover:border-zinc-700 space-y-1"
                >
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="text-emerald-400">step {c.step_index}</span>
                    <span className="text-zinc-500">{relativeTime(c.created_at)}</span>
                  </div>
                  <p className="text-zinc-200 truncate">{c.user_message}</p>
                  <p className="text-zinc-500 font-mono text-[10px]">
                    {c.tools_executed?.length || 0} tool call(s) · {c.usage?.totalTokens ?? 0} tokens
                    {c.metadata?.forked_from ? ' · forked' : ''}
                  </p>
                </button>
              ))}
            </>
          )}

          {active && tab === 'api' && (
            <>
              <p className="text-zinc-400 leading-relaxed">
                Call this instance from your backend with a workspace API key that has the <code className="text-emerald-400">agent:run</code> scope.
                Your organization comes from the key, so there is no tenant id in the body.
              </p>
              {[
                ['chat', 'Send a message', chatCurl],
                ['create', 'Create an instance (needs agent:sessions:write)', createCurl],
              ].map(([id, title, text]) => (
                <section key={id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-mono uppercase text-zinc-500 text-[10px] tracking-wider">{title}</h4>
                    <button onClick={() => copy(id, text)} className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300">
                      {copied === id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied === id ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="p-3 rounded-lg bg-black/50 border border-zinc-800 overflow-x-auto text-[11px] text-zinc-300">{text}</pre>
                </section>
              ))}
              <p className="text-zinc-500">
                The response includes <code>message</code>, <code>tool_executions</code>, <code>checkpoint_id</code> and the full{' '}
                <code>transcript</code>.
              </p>
            </>
          )}
        </div>
      </div>

      {modal && (
        <InstanceModal
          mode={modal}
          initial={formFromSession(modal === 'edit' ? active : null)}
          providers={providers}
          mcpProfiles={mcpProfiles}
          contextProfiles={contextProfiles}
          onCancel={() => setModal(null)}
          onSubmit={submitInstance}
        />
      )}

      {checkpointDetail && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#0e131e] border border-zinc-700 rounded-2xl p-6 space-y-4 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Checkpoint · step {checkpointDetail.step_index}</h3>
                <p className="text-[11px] font-mono text-zinc-500 mt-1">
                  {new Date(checkpointDetail.created_at).toLocaleString()} · served by {checkpointDetail.metadata?.served_by || '—'} ·{' '}
                  {checkpointDetail.usage?.totalTokens ?? 0} tokens · {checkpointDetail.usage?.steps ?? 0} model step(s)
                </p>
              </div>
              <button onClick={() => setCheckpointDetail(null)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 text-xs">
              <div>
                <div className="text-zinc-500 font-mono mb-1">Tool calls</div>
                {(checkpointDetail.tools_executed || []).length === 0 && <p className="text-zinc-500">None</p>}
                {(checkpointDetail.tools_executed || []).map((t: any, i: number) => (
                  <pre key={i} className="p-2 rounded bg-black/40 overflow-x-auto mb-2">
                    {JSON.stringify(t, null, 2)}
                  </pre>
                ))}
              </div>
              <div>
                <div className="text-zinc-500 font-mono mb-1">State after this turn ({checkpointDetail.transcript?.length || 0} messages)</div>
                <pre className="p-2 rounded bg-black/40 overflow-x-auto max-h-80">
                  {JSON.stringify(checkpointDetail.transcript, null, 2)}
                </pre>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => forkFrom(checkpointDetail.id)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs"
              >
                <GitBranch className="w-3.5 h-3.5" /> Fork new instance from here
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
