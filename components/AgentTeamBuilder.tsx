'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users,
  Bot,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Save,
  Play,
  Copy,
  Check,
  Code2,
  Wrench,
  HeartPulse,
  ArrowRight,
  Download,
  Upload,
} from 'lucide-react';
import { PLATFORM_TOOL_DEFINITIONS } from '@/lib/mcp/tool-catalog';
import { ScheduleEditor, formatWhen } from '@/components/ScheduleEditor';
import { MAX_TEAM_WORKERS, TEAM_LLM_PROVIDERS, teamSpecSchema, workerSlug, type TeamSpec } from '@/lib/agent/team-spec';
import {
  DEFAULT_HEARTBEAT_SCHEDULE,
  describeSchedule,
  type HeartbeatSchedule,
} from '@/lib/agent/heartbeat-schedule';

// ---------------------------------------------------------------------------
// Types and helpers
// ---------------------------------------------------------------------------

type Provider = (typeof TEAM_LLM_PROVIDERS)[number];
type Worker = TeamSpec['workers'][number];

interface TeamSummary {
  id: string;
  name: string;
  description: string | null;
  provider: Provider;
  worker_count: number;
  heartbeat_enabled: boolean;
  heartbeat_last_status: 'ok' | 'error' | 'skipped' | 'idle' | null;
}

interface TeamRecord {
  id: string;
  heartbeat_session_id: string | null;
  heartbeat_next_run_at: string | null;
  heartbeat_last_run_at: string | null;
  heartbeat_last_status: 'ok' | 'error' | 'skipped' | 'idle' | null;
  heartbeat_last_error: string | null;
  heartbeat_runs_day: string | null;
  heartbeat_runs_today: number;
}

interface NamedOption {
  id: string;
  name: string;
}

interface ProviderInfo {
  id: Provider;
  configured: boolean;
  defaultModel: string;
}

interface AgentTeamBuilderProps {
  /** Opens an Agent Studio instance (team id, session id). */
  onLaunchThread?: (teamId: string, sessionId: string) => void;
}

const PROVIDER_LABELS: Record<Provider, string> = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Google Gemini' };
const STEPS = [
  { num: 1, label: 'Team & supervisor' },
  { num: 2, label: 'Workers' },
  { num: 3, label: 'Tools' },
  { num: 4, label: 'Heartbeat' },
  { num: 5, label: 'Review & JSON' },
] as const;

const GOAL_SUGGESTIONS = [
  'Check the board for claimable tasks assigned to us, claim one, complete it and record the result.',
  'Check scheduled tasks, cancel any that are overdue, and report what changed.',
  'Review MCP profiles and flag any with a token budget above 100k.',
  'Summarize what happened in the workspace since the last heartbeat.',
];


function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_HEARTBEAT_SCHEDULE.timezone;
  } catch {
    return DEFAULT_HEARTBEAT_SCHEDULE.timezone;
  }
}

function emptySpec(provider: Provider): TeamSpec {
  return {
    name: '',
    description: '',
    llm: { provider },
    routing_strategy: 'supervisor_router',
    supervisor: { instructions: '', context_profile_id: null, mcp_profile_id: null, tools: [] },
    workers: [],
    heartbeat: { enabled: false, goal: '', schedule: null, max_runs_per_day: 48, wake_when: 'always' },
  };
}


async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, cache: 'no-store' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issues = Array.isArray(body?.issues) ? ` (${body.issues.map((i: any) => `${i.path}: ${i.message}`).join('; ')})` : '';
    throw new Error((body?.error || `Request failed (${res.status})`) + issues);
  }
  return body as T;
}

const inputCls =
  'w-full bg-[#090b0f] border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500';
const labelCls = 'block text-xs font-semibold text-zinc-400 mb-1';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AgentTeamBuilder: React.FC<AgentTeamBuilderProps> = ({ onLaunchThread }) => {
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [contextProfiles, setContextProfiles] = useState<NamedOption[]>([]);
  const [mcpProfiles, setMcpProfiles] = useState<NamedOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null); // null = new team
  const [record, setRecord] = useState<TeamRecord | null>(null);
  const [draft, setDraft] = useState<TeamSpec>(() => emptySpec('gemini'));
  const [step, setStep] = useState<number>(1);
  const [toolTarget, setToolTarget] = useState<string>('supervisor'); // 'supervisor' | worker index
  const [busy, setBusy] = useState<'save' | 'archive' | 'run' | 'launch' | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const configured = providers.filter((p) => p.configured);

  const loadTeams = useCallback(async () => {
    const { teams: list } = await api<{ teams: TeamSummary[] }>('/api/v1/agent-teams');
    setTeams(list);
    return list;
  }, []);

  const openTeam = useCallback(async (id: string) => {
    const { team, spec } = await api<{ team: TeamRecord; spec: TeamSpec }>(`/api/v1/agent-teams/${id}`);
    setSelectedId(id);
    setRecord(team);
    setDraft(spec);
    setToolTarget('supervisor');
    setNotice(null);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [prov, ctx, mcp] = await Promise.all([
          api<{ providers: ProviderInfo[] }>('/api/v1/llm-providers'),
          api<{ profiles: NamedOption[] }>('/api/v1/context-profiles').catch(() => ({ profiles: [] })),
          api<{ profiles: NamedOption[] }>('/api/mcp/profiles').catch(() => ({ profiles: [] })),
        ]);
        setProviders(prov.providers);
        setContextProfiles(ctx.profiles);
        setMcpProfiles(mcp.profiles);
        const firstConfigured = prov.providers.find((p) => p.configured)?.id ?? 'gemini';
        setDraft(emptySpec(firstConfigured));
        const list = await loadTeams();
        if (list[0]) await openTeam(list[0].id);
      } catch (err: any) {
        setNotice({ ok: false, text: err?.message || 'Could not load Team Builder' });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadTeams, openTeam]);

  // Keep the JSON view in sync with the form (the form is the source of truth).
  useEffect(() => {
    setJsonText(JSON.stringify(draft, null, 2));
    setJsonError(null);
  }, [draft]);

  const validation = useMemo(() => teamSpecSchema.safeParse(draft), [draft]);
  const issues = validation.success ? [] : validation.error.issues;
  const issueFor = (prefix: string) =>
    issues.find((i) => i.path.join('.').startsWith(prefix))?.message;

  const update = (patch: Partial<TeamSpec>) => setDraft((d) => ({ ...d, ...patch }));
  const updateSupervisor = (patch: Partial<TeamSpec['supervisor']>) => setDraft((d) => ({ ...d, supervisor: { ...d.supervisor, ...patch } }));
  const updateWorker = (index: number, patch: Partial<Worker>) =>
    setDraft((d) => ({ ...d, workers: d.workers.map((w, i) => (i === index ? { ...w, ...patch } : w)) }));
  const updateHeartbeat = (patch: Partial<TeamSpec['heartbeat']>) => setDraft((d) => ({ ...d, heartbeat: { ...d.heartbeat, ...patch } }));
  const schedule = draft.heartbeat.schedule;
  const updateSchedule = (next: HeartbeatSchedule) => updateHeartbeat({ schedule: next });

  const newTeam = () => {
    setSelectedId(null);
    setRecord(null);
    setDraft(emptySpec(configured[0]?.id ?? 'gemini'));
    setStep(1);
    setToolTarget('supervisor');
    setNotice(null);
  };

  const addWorker = () => {
    if (draft.workers.length >= MAX_TEAM_WORKERS) return;
    update({
      workers: [
        ...draft.workers,
        { name: `Worker ${draft.workers.length + 1}`, role: '', instructions: '', context_profile_id: null, mcp_profile_id: null, tools: [], model: null },
      ],
    });
  };

  const removeWorker = (index: number) => {
    update({ workers: draft.workers.filter((_, i) => i !== index) });
    if (toolTarget === String(index)) setToolTarget('supervisor');
  };

  const save = async () => {
    if (!validation.success) {
      setNotice({ ok: false, text: `Fix before saving: ${issues[0]?.path.join('.')}: ${issues[0]?.message}` });
      return;
    }
    setBusy('save');
    setNotice(null);
    try {
      const { team } = selectedId
        ? await api<{ team: TeamRecord & { id: string } }>(`/api/v1/agent-teams/${selectedId}`, { method: 'PUT', body: JSON.stringify(validation.data) })
        : await api<{ team: TeamRecord & { id: string } }>('/api/v1/agent-teams', { method: 'POST', body: JSON.stringify(validation.data) });
      await loadTeams();
      await openTeam(team.id);
      setNotice({ ok: true, text: 'Team saved.' });
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'Could not save team' });
    } finally {
      setBusy(null);
    }
  };

  const archive = async () => {
    if (!selectedId || !confirm(`Archive "${draft.name}"? Its heartbeat stops; instances keep their history.`)) return;
    setBusy('archive');
    try {
      await api(`/api/v1/agent-teams/${selectedId}`, { method: 'DELETE' });
      const list = await loadTeams();
      if (list[0]) await openTeam(list[0].id);
      else newTeam();
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'Could not archive team' });
    } finally {
      setBusy(null);
    }
  };

  const launch = async () => {
    if (!selectedId) return;
    setBusy('launch');
    try {
      const { session } = await api<{ session: { id: string } }>(`/api/v1/agent-teams/${selectedId}/sessions`, { method: 'POST', body: '{}' });
      onLaunchThread?.(selectedId, session.id);
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'Could not start an instance' });
    } finally {
      setBusy(null);
    }
  };

  const runNow = async () => {
    if (!selectedId) return;
    setBusy('run');
    setNotice(null);
    try {
      const { outcome, team } = await api<{ outcome: { status: string; detail?: string }; team: TeamRecord }>(
        `/api/v1/agent-teams/${selectedId}/heartbeat`,
        { method: 'POST', body: '{}' }
      );
      setRecord(team);
      setNotice({
        ok: outcome.status === 'ok',
        text: outcome.status === 'ok' ? 'Heartbeat ran. Open the heartbeat instance to read the result.' : `Heartbeat ${outcome.status}: ${outcome.detail}`,
      });
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'Heartbeat failed' });
    } finally {
      setBusy(null);
    }
  };

  const applyJson = () => {
    try {
      const parsed = teamSpecSchema.safeParse(JSON.parse(jsonText));
      if (!parsed.success) {
        setJsonError(parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('\n'));
        return;
      }
      setDraft(parsed.data);
      setNotice({ ok: true, text: 'JSON applied to the form. Save to store it.' });
    } catch (err: any) {
      setJsonError(`Not valid JSON: ${err?.message}`);
    }
  };

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(draft, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${workerSlug(draft.name || 'team') || 'team'}.team.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };


  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-zinc-400 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading Team Builder…
      </div>
    );
  }

  const memberTools = toolTarget === 'supervisor' ? draft.supervisor.tools : draft.workers[Number(toolTarget)]?.tools ?? [];
  const setMemberTools = (tools: string[]) =>
    toolTarget === 'supervisor' ? updateSupervisor({ tools }) : updateWorker(Number(toolTarget), { tools });

  return (
    <div className="h-full flex bg-[#090b10] text-zinc-100 overflow-hidden">
      {/* Team list */}
      <aside className="w-64 shrink-0 border-r border-zinc-800 bg-[#0d1017] flex flex-col">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" /> Teams
          </h2>
          <button onClick={newTeam} className="p-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white" title="New team">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {teams.length === 0 && <p className="text-xs text-zinc-500 p-2">No teams yet. Create your first one.</p>}
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => openTeam(t.id)}
              className={`w-full text-left p-2.5 rounded-lg border text-xs ${
                selectedId === t.id ? 'bg-emerald-950/30 border-emerald-800' : 'border-transparent hover:bg-zinc-900'
              }`}
            >
              <div className="font-semibold text-white truncate">{t.name}</div>
              <div className="text-zinc-500 mt-0.5 flex items-center gap-1.5">
                {t.worker_count === 0 ? 'Single agent' : `${t.worker_count} worker${t.worker_count === 1 ? '' : 's'}`}
                {t.heartbeat_enabled && (
                  <span className={`flex items-center gap-0.5 ${t.heartbeat_last_status === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}>
                    · <HeartPulse className="w-3 h-3" />
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Editor */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="px-6 py-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-white">{selectedId ? draft.name || 'Untitled team' : 'New team'}</h1>
            <p className="text-xs text-zinc-400">
              A supervisor that can delegate to workers. With no workers it is a single agent.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedId && (
              <>
                <button onClick={launch} disabled={busy !== null} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
                  {busy === 'launch' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />} Open in Agent Studio
                </button>
                <button onClick={archive} disabled={busy !== null} className="p-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-rose-400 disabled:opacity-50" title="Archive team">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button onClick={save} disabled={busy !== null} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50">
              {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save team
            </button>
          </div>
        </header>

        {configured.length === 0 && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-amber-950/40 border border-amber-900/60 text-xs text-amber-200">
            No LLM key is stored yet. Add one in Account &amp; Billing → LLM keys; teams run on your own key.
          </div>
        )}
        {notice && (
          <div className={`mx-6 mt-4 p-3 rounded-lg text-xs flex items-start gap-2 border ${notice.ok ? 'bg-emerald-950/30 border-emerald-900 text-emerald-200' : 'bg-rose-950/40 border-rose-900/60 text-rose-300'}`}>
            {notice.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />}
            <span className="break-words">{notice.text}</span>
          </div>
        )}

        {/* Steps */}
        <nav className="px-6 pt-4 flex flex-wrap gap-2">
          {STEPS.map((s) => (
            <button
              key={s.num}
              onClick={() => setStep(s.num)}
              className={`px-3 py-1.5 rounded-full text-xs border ${step === s.num ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}
            >
              {s.num}. {s.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl space-y-5">
            {/* STEP 1 */}
            {step === 1 && (
              <section className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Team name</label>
                    <input className={inputCls} value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. Ops Team" />
                    {issueFor('name') && <p className="text-xs text-rose-400 mt-1">{issueFor('name')}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>LLM provider</label>
                      <select
                        className={inputCls}
                        value={draft.llm.provider}
                        onChange={(e) => update({ llm: { provider: e.target.value as Provider } })}
                      >
                        {providers.map((p) => (
                          <option key={p.id} value={p.id} disabled={!p.configured}>
                            {PROVIDER_LABELS[p.id]}{p.configured ? '' : ' (no key)'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Model</label>
                      <input
                        className={inputCls}
                        value={draft.llm.model ?? ''}
                        onChange={(e) => update({ llm: { ...draft.llm, model: e.target.value || undefined } })}
                        placeholder={providers.find((p) => p.id === draft.llm.provider)?.defaultModel}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Purpose (optional)</label>
                  <input className={inputCls} value={draft.description ?? ''} onChange={(e) => update({ description: e.target.value })} placeholder="What this team is for" />
                </div>
                <div>
                  <label className={labelCls}>Supervisor instructions</label>
                  <textarea
                    className={`${inputCls} min-h-[110px]`}
                    value={draft.supervisor.instructions ?? ''}
                    onChange={(e) => updateSupervisor({ instructions: e.target.value })}
                    placeholder="How the supervisor should behave, decide and delegate."
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Supervisor context profile</label>
                    <select className={inputCls} value={draft.supervisor.context_profile_id ?? ''} onChange={(e) => updateSupervisor({ context_profile_id: e.target.value || null })}>
                      <option value="">None</option>
                      {contextProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Supervisor MCP profile</label>
                    <select className={inputCls} value={draft.supervisor.mcp_profile_id ?? ''} onChange={(e) => updateSupervisor({ mcp_profile_id: e.target.value || null })}>
                      <option value="">None</option>
                      {mcpProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
                {contextProfiles.length === 0 && mcpProfiles.length === 0 && (
                  <p className="text-xs text-zinc-500">You have no context or MCP profiles yet; that is fine. Create them in Profiles or MCP Hub and attach them later.</p>
                )}
              </section>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-zinc-400">
                    Each worker becomes a tool the supervisor can call (<code className="text-emerald-400">delegate_to_&lt;name&gt;</code>). Workers only see the task they are given.
                  </p>
                  <button onClick={addWorker} disabled={draft.workers.length >= MAX_TEAM_WORKERS} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs disabled:opacity-50">
                    <Plus className="w-3.5 h-3.5" /> Add worker
                  </button>
                </div>
                {draft.workers.length === 0 && (
                  <div className="p-6 rounded-xl border border-dashed border-zinc-700 text-center text-sm text-zinc-500">
                    No workers: this team runs as a single agent. Add workers to let the supervisor delegate.
                  </div>
                )}
                {draft.workers.map((w, i) => (
                  <div key={i} className="p-4 rounded-xl border border-zinc-800 bg-[#0d1017] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-zinc-500 flex items-center gap-1.5">
                        <Bot className="w-3.5 h-3.5 text-cyan-400" /> delegate_to_{workerSlug(w.name) || '…'}
                      </span>
                      <button onClick={() => removeWorker(i)} className="p-1 text-zinc-500 hover:text-rose-400" title="Remove worker">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Name</label>
                        <input className={inputCls} value={w.name} onChange={(e) => updateWorker(i, { name: e.target.value })} />
                        {issueFor(`workers.${i}.name`) && <p className="text-xs text-rose-400 mt-1">{issueFor(`workers.${i}.name`)}</p>}
                      </div>
                      <div>
                        <label className={labelCls}>Role (what the supervisor sees)</label>
                        <input className={inputCls} value={w.role} onChange={(e) => updateWorker(i, { role: e.target.value })} placeholder="e.g. Finds and summarizes scheduled tasks" />
                        {issueFor(`workers.${i}.role`) && <p className="text-xs text-rose-400 mt-1">Role is required</p>}
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Instructions (optional)</label>
                      <textarea className={`${inputCls} min-h-[70px]`} value={w.instructions ?? ''} onChange={(e) => updateWorker(i, { instructions: e.target.value })} />
                    </div>
                    <div className="grid sm:grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>Context profile</label>
                        <select className={inputCls} value={w.context_profile_id ?? ''} onChange={(e) => updateWorker(i, { context_profile_id: e.target.value || null })}>
                          <option value="">None</option>
                          {contextProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>MCP profile</label>
                        <select className={inputCls} value={w.mcp_profile_id ?? ''} onChange={(e) => updateWorker(i, { mcp_profile_id: e.target.value || null })}>
                          <option value="">None</option>
                          {mcpProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Model override</label>
                        <input className={inputCls} value={w.model ?? ''} onChange={(e) => updateWorker(i, { model: e.target.value || null })} placeholder="Team default" />
                      </div>
                    </div>
                    <button onClick={() => { setToolTarget(String(i)); setStep(3); }} className="text-xs text-emerald-400 hover:text-emerald-300">
                      {w.tools.length} tool{w.tools.length === 1 ? '' : 's'} assigned · edit tools →
                    </button>
                  </div>
                ))}
              </section>
            )}

            {/* STEP 3 */}
            {step === 3 && (
              <section className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {[{ id: 'supervisor', label: 'Supervisor' }, ...draft.workers.map((w, i) => ({ id: String(i), label: w.name || `Worker ${i + 1}` }))].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setToolTarget(m.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs border ${toolTarget === m.id ? 'bg-zinc-800 border-zinc-600 text-white' : 'border-zinc-800 text-zinc-400'}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <button onClick={() => setMemberTools(PLATFORM_TOOL_DEFINITIONS.filter((t) => t.sideEffect === 'read').map((t) => t.name))} className="text-zinc-400 hover:text-white">Read-only set</button>
                  <button onClick={() => setMemberTools(Array.from(new Set([...memberTools, ...PLATFORM_TOOL_DEFINITIONS.filter((t) => t.name.startsWith('contextcontrol_board_')).map((t) => t.name)])))} className="text-zinc-400 hover:text-white">Board worker set</button>
                  <button onClick={() => setMemberTools(PLATFORM_TOOL_DEFINITIONS.map((t) => t.name))} className="text-zinc-400 hover:text-white">All</button>
                  <button onClick={() => setMemberTools([])} className="text-zinc-400 hover:text-white">None</button>
                </div>
                <div className="space-y-2">
                  {PLATFORM_TOOL_DEFINITIONS.map((t) => {
                    const on = memberTools.includes(t.name);
                    return (
                      <label key={t.name} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${on ? 'bg-emerald-950/20 border-emerald-900' : 'border-zinc-800 hover:border-zinc-700'}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => setMemberTools(on ? memberTools.filter((n) => n !== t.name) : [...memberTools, t.name])}
                          className="mt-0.5 rounded bg-zinc-900 border-zinc-700 text-emerald-500"
                        />
                        <span className="flex-1">
                          <span className="font-mono text-xs text-white">{t.name}</span>
                          <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded border ${t.sideEffect === 'write' ? 'text-amber-300 border-amber-800' : 'text-zinc-400 border-zinc-700'}`}>{t.sideEffect}</span>
                          <span className="block text-xs text-zinc-400 mt-0.5">{t.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {toolTarget === 'supervisor' && draft.workers.length > 0 && (
                  <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" /> The supervisor also gets one delegate tool per worker automatically.
                  </p>
                )}
                <p className="text-xs text-zinc-500">
                  External tools (Gmail, CRM, Slack…) appear here once account connections ship; the platform tools above are what exists today.
                </p>
              </section>
            )}

            {/* STEP 4 */}
            {step === 4 && (
              <section className="space-y-5">
                <div className="p-4 rounded-xl border border-zinc-800 bg-[#0d1017] flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white flex items-center gap-2"><HeartPulse className="w-4 h-4 text-emerald-400" /> Proactive heartbeat</div>
                    <p className="text-xs text-zinc-400 mt-0.5">On a schedule, the team wakes up and works on the goal by itself. Each run is saved in a dedicated heartbeat instance.</p>
                  </div>
                  <button
                    onClick={() => updateHeartbeat({ enabled: !draft.heartbeat.enabled, schedule: draft.heartbeat.schedule ?? { ...DEFAULT_HEARTBEAT_SCHEDULE, timezone: browserTimeZone() } })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${draft.heartbeat.enabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                    aria-label="Toggle heartbeat"
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${draft.heartbeat.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {draft.heartbeat.enabled && schedule && (
                  <>
                    <div>
                      <label className={labelCls}>Goal (the prompt each run starts with)</label>
                      <textarea className={`${inputCls} min-h-[80px]`} value={draft.heartbeat.goal ?? ''} onChange={(e) => updateHeartbeat({ goal: e.target.value })} />
                      <div className="flex flex-wrap gap-2 mt-2">
                        {GOAL_SUGGESTIONS.map((g) => (
                          <button key={g} onClick={() => updateHeartbeat(g.includes('board') ? { goal: g, wake_when: 'board_has_work' } : { goal: g })} className="text-[11px] px-2 py-1 rounded-md border border-zinc-800 text-zinc-400 hover:text-white">{g}</button>
                        ))}
                      </div>
                      {issueFor('heartbeat.goal') && <p className="text-xs text-rose-400 mt-1">{issueFor('heartbeat.goal')}</p>}
                    </div>

                    <div>
                      <label className={labelCls}>When it wakes up</label>
                      <select className={inputCls} value={draft.heartbeat.wake_when} onChange={(e) => updateHeartbeat({ wake_when: e.target.value as 'always' | 'board_has_work' })}>
                        <option value="always">Always run the goal</option>
                        <option value="board_has_work">Only when the board has work for this team (free check, no tokens when idle)</option>
                      </select>
                      {draft.heartbeat.wake_when === 'board_has_work' && (
                        <p className="text-xs text-zinc-500 mt-1">Idle wake-ups are recorded as “idle”, cost nothing and don’t count toward the daily cap.</p>
                      )}
                    </div>

                    <ScheduleEditor
                      value={schedule}
                      onChange={updateSchedule}
                      extra={
                        <div>
                          <label className={labelCls}>Max runs per day (budget guard)</label>
                          <input type="number" min={1} max={288} className={inputCls} value={draft.heartbeat.max_runs_per_day} onChange={(e) => updateHeartbeat({ max_runs_per_day: Math.min(288, Math.max(1, Number(e.target.value) || 1)) })} />
                        </div>
                      }
                    />

                    {record && selectedId && (
                      <div className="p-4 rounded-xl border border-zinc-800 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-zinc-300">Status</span>
                          <button onClick={runNow} disabled={busy !== null} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50">
                            {busy === 'run' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run now
                          </button>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-2 text-zinc-400">
                          <div>Next run: <span className="text-zinc-200">{formatWhen(record.heartbeat_next_run_at, schedule.timezone)}</span></div>
                          <div>Last run: <span className="text-zinc-200">{formatWhen(record.heartbeat_last_run_at, schedule.timezone)}</span>
                            {record.heartbeat_last_status && (
                              <span className={`ml-1.5 ${record.heartbeat_last_status === 'ok' ? 'text-emerald-400' : record.heartbeat_last_status === 'error' ? 'text-rose-400' : record.heartbeat_last_status === 'idle' ? 'text-zinc-400' : 'text-amber-400'}`}>({record.heartbeat_last_status})</span>
                            )}
                          </div>
                          <div>Runs today: <span className="text-zinc-200">{record.heartbeat_runs_today}/{draft.heartbeat.max_runs_per_day}</span></div>
                          {record.heartbeat_session_id && onLaunchThread && (
                            <button onClick={() => onLaunchThread(selectedId, record.heartbeat_session_id!)} className="text-left text-emerald-400 hover:text-emerald-300">Open heartbeat instance →</button>
                          )}
                        </div>
                        {record.heartbeat_last_error && <p className="text-rose-400 break-words">{record.heartbeat_last_error}</p>}
                        <p className="text-[11px] text-zinc-500">Save after changing the schedule; the next run is re-planned on save.</p>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {/* STEP 5 */}
            {step === 5 && (
              <section className="space-y-4">
                <div className="p-4 rounded-xl border border-zinc-800 bg-[#0d1017] text-sm space-y-1">
                  <div className="text-white font-semibold">{draft.name || 'Untitled team'}</div>
                  <div className="text-zinc-400 text-xs">
                    {PROVIDER_LABELS[draft.llm.provider]} · {draft.llm.model || providers.find((p) => p.id === draft.llm.provider)?.defaultModel} ·{' '}
                    {draft.workers.length ? `supervisor + ${draft.workers.length} worker${draft.workers.length === 1 ? '' : 's'}` : 'single agent'} ·{' '}
                    {draft.heartbeat.enabled && draft.heartbeat.schedule ? `heartbeat ${describeSchedule(draft.heartbeat.schedule)}` : 'no heartbeat'}
                  </div>
                  {issues.length > 0 ? (
                    <ul className="text-xs text-rose-400 mt-2 space-y-0.5">
                      {issues.map((i, n) => <li key={n}>• {i.path.join('.') || 'team'}: {i.message}</li>)}
                    </ul>
                  ) : (
                    <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Ready to save</p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5"><Code2 className="w-3.5 h-3.5 text-emerald-400" /> Team as code</span>
                    <div className="flex items-center gap-2 text-xs">
                      <button onClick={copyJson} className="flex items-center gap-1 text-zinc-400 hover:text-white">{copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} Copy</button>
                      <button onClick={downloadJson} className="flex items-center gap-1 text-zinc-400 hover:text-white"><Download className="w-3.5 h-3.5" /> Download</button>
                      <button onClick={applyJson} className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-white"><Upload className="w-3.5 h-3.5" /> Apply JSON to form</button>
                    </div>
                  </div>
                  <textarea
                    className={`${inputCls} font-mono text-xs min-h-[360px]`}
                    value={jsonText}
                    onChange={(e) => { setJsonText(e.target.value); setJsonError(null); }}
                    spellCheck={false}
                  />
                  {jsonError && <pre className="text-xs text-rose-400 whitespace-pre-wrap">{jsonError}</pre>}
                  <p className="text-[11px] text-zinc-500">
                    Paste or edit a team here, apply it, then Save. The same JSON works with <code>POST /api/v1/agent-teams</code>. Profile ids must belong to this organization.
                  </p>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

