'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KanbanSquare,
  Plus,
  RefreshCw,
  X,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  Tag,
  Ban,
  RotateCcw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types (mirror /api/v1/board)
// ---------------------------------------------------------------------------

type Priority = 'low' | 'normal' | 'high' | 'urgent';
type Status = 'open' | 'claimed' | 'done' | 'failed' | 'cancelled';

interface BoardTask {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  labels: string[];
  status: Status;
  assigned_team_id: string | null;
  posted_by: string;
  claimed_by: string | null;
  claimed_at: string | null;
  lease_expires_at: string | null;
  attempts: number;
  result: string | null;
  failure_reason: string | null;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  claimable: boolean;
  lease_expired: boolean;
}

interface BoardEvent {
  event: string;
  actor: string;
  note: string | null;
  created_at: string;
}

interface Team {
  id: string;
  name: string;
}

const PRIORITIES: Priority[] = ['urgent', 'high', 'normal', 'low'];
const PRIORITY_STYLE: Record<Priority, string> = {
  urgent: 'bg-rose-950/60 text-rose-300 border-rose-800',
  high: 'bg-amber-950/60 text-amber-300 border-amber-800',
  normal: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  low: 'bg-zinc-900 text-zinc-500 border-zinc-800',
};
const COLUMNS: Array<{ id: string; title: string; match: (t: BoardTask) => boolean }> = [
  { id: 'open', title: 'Open', match: (t) => t.status === 'open' },
  { id: 'claimed', title: 'Claimed', match: (t) => t.status === 'claimed' },
  { id: 'done', title: 'Done', match: (t) => t.status === 'done' },
  { id: 'closed', title: 'Failed & cancelled', match: (t) => t.status === 'failed' || t.status === 'cancelled' },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, cache: 'no-store' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issues = Array.isArray(body?.issues) ? ` (${body.issues.map((i: any) => `${i.path}: ${i.message}`).join('; ')})` : '';
    throw new Error((body?.error || `Request failed (${res.status})`) + issues);
  }
  return body as T;
}

function remaining(iso: string | null, now: number): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return 'expired';
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m}m ${String(s).padStart(2, '0')}s left`;
}

const inputCls = 'w-full bg-[#090b0f] border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500';

// ---------------------------------------------------------------------------

export const SupervisorBoardView: React.FC = () => {
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [filterPriority, setFilterPriority] = useState<string>('');
  const [filterTeam, setFilterTeam] = useState<string>('');
  const [filterLabel, setFilterLabel] = useState<string>('');

  const [creating, setCreating] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const teamName = useCallback((id: string | null) => teams.find((t) => t.id === id)?.name ?? 'a team', [teams]);
  const actorName = useCallback(
    (actor: string | null) => {
      if (!actor) return '—';
      const [kind, id] = actor.split(':');
      if (kind === 'team') return teamName(id);
      if (kind === 'user') return 'a person';
      if (kind === 'api_key') return 'an API key';
      return 'the system';
    },
    [teamName]
  );

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    try {
      const [board, teamList] = await Promise.all([
        api<{ tasks: BoardTask[] }>('/api/v1/board?limit=100'),
        api<{ teams: Team[] }>('/api/v1/agent-teams').catch(() => ({ teams: [] as Team[] })),
      ]);
      setTasks(board.tasks);
      setTeams(teamList.teams);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Could not load the board');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(() => load(true), 15_000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  const visible = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (!filterPriority || t.priority === filterPriority) &&
          (!filterTeam || t.assigned_team_id === filterTeam || t.claimed_by === `team:${filterTeam}`) &&
          (!filterLabel || t.labels.some((l) => l.toLowerCase().includes(filterLabel.toLowerCase())))
      ),
    [tasks, filterPriority, filterTeam, filterLabel]
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-zinc-400 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading board…
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#090b10] text-zinc-100 overflow-hidden">
      <header className="px-6 py-4 border-b border-zinc-800 bg-[#0d1017] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center text-emerald-400">
            <KanbanSquare className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">Supervisor Board</h1>
            <p className="text-xs text-zinc-400">Teams post work here, claim it for a limited time, and record the result.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5">
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5">
            <option value="">Any team</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input value={filterLabel} onChange={(e) => setFilterLabel(e.target.value)} placeholder="Label…" className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 w-28" />
          <button onClick={() => load(true)} className="p-1.5 rounded-md border border-zinc-700 text-zinc-400 hover:text-white" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">
            <Plus className="w-3.5 h-3.5" /> New task
          </button>
        </div>
      </header>

      {error && (
        <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      {tasks.length === 0 && !error ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-3">
            <KanbanSquare className="w-8 h-8 text-emerald-400 mx-auto" />
            <h2 className="text-lg font-semibold text-white">The board is empty</h2>
            <p className="text-sm text-zinc-400">
              Post a task, then give a team the board tools in Team Builder. With a heartbeat goal like
              <span className="text-zinc-200"> “check the board for claimable tasks, claim one, complete it and record the result”</span>,
              the team picks up work on its own.
            </p>
            <button onClick={() => setCreating(true)} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">
              Post the first task
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto p-6">
          <div className="grid grid-cols-4 gap-4 min-w-[960px] h-full">
            {COLUMNS.map((col) => {
              const items = visible.filter(col.match);
              return (
                <section key={col.id} className="flex flex-col bg-[#0d1017] border border-zinc-800 rounded-xl min-h-0">
                  <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between text-sm">
                    <span className="font-semibold text-zinc-200">{col.title}</span>
                    <span className="text-xs text-zinc-500">{items.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {items.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setOpenTaskId(t.id)}
                        className="w-full text-left p-3 rounded-lg bg-[#090b10] border border-zinc-800 hover:border-zinc-600 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-medium text-white leading-snug">{t.title}</span>
                          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${PRIORITY_STYLE[t.priority]}`}>{t.priority}</span>
                        </div>
                        {t.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {t.labels.map((l) => <span key={l} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{l}</span>)}
                          </div>
                        )}
                        <div className="text-[11px] text-zinc-500 space-y-0.5">
                          {t.assigned_team_id && <div className="flex items-center gap-1"><Users className="w-3 h-3" /> for {teamName(t.assigned_team_id)}</div>}
                          {t.status === 'claimed' && (
                            <div className={`flex items-center gap-1 ${t.lease_expired || remaining(t.lease_expires_at, now) === 'expired' ? 'text-amber-400' : 'text-emerald-400'}`}>
                              <Clock className="w-3 h-3" />
                              {actorName(t.claimed_by)} ·{' '}
                              {t.lease_expired || remaining(t.lease_expires_at, now) === 'expired' ? 'lease expired, claimable' : remaining(t.lease_expires_at, now)}
                            </div>
                          )}
                          {t.status === 'done' && t.completed_at && <div>done {new Date(t.completed_at).toLocaleString()}</div>}
                          {t.status === 'failed' && <div className="text-rose-400 truncate">failed: {t.failure_reason}</div>}
                          {t.status === 'open' && t.attempts > 0 && <div>{t.attempts} previous attempt{t.attempts === 1 ? '' : 's'}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {creating && <NewTaskModal teams={teams} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(true); }} />}
      {openTaskId && (
        <TaskDrawer
          taskId={openTaskId}
          teams={teams}
          now={now}
          actorName={actorName}
          onClose={() => setOpenTaskId(null)}
          onChanged={() => load(true)}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const NewTaskModal: React.FC<{ teams: Team[]; onClose: () => void; onCreated: () => void }> = ({ teams, onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [labels, setLabels] = useState('');
  const [team, setTeam] = useState('');
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await api('/api/v1/board', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          priority,
          labels: labels.split(',').map((l) => l.trim()).filter(Boolean),
          ...(team ? { assigned_team_id: team } : {}),
          ...(due ? { due_at: new Date(due).toISOString() } : {}),
        }),
      });
      onCreated();
    } catch (err: any) {
      setError(err?.message || 'Could not post the task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#0e131e] border border-zinc-700 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Post a task</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" autoFocus />
        <textarea className={`${inputCls} min-h-[100px]`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Details, links, acceptance criteria (optional)" />
        <div className="grid grid-cols-2 gap-3">
          <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p} priority</option>)}
          </select>
          <select className={inputCls} value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">Any team can claim</option>
            {teams.map((t) => <option key={t.id} value={t.id}>Only {t.name}</option>)}
          </select>
          <input className={inputCls} value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="Labels, comma separated" />
          <input className={inputCls} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} title="Due (optional)" />
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-xs text-zinc-400 hover:text-white">Cancel</button>
          <button onClick={submit} disabled={saving || !title.trim()} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50">
            {saving ? 'Posting…' : 'Post task'}
          </button>
        </div>
      </div>
    </div>
  );
};

const TaskDrawer: React.FC<{
  taskId: string;
  teams: Team[];
  now: number;
  actorName: (actor: string | null) => string;
  onClose: () => void;
  onChanged: () => void;
}> = ({ taskId, teams, now, actorName, onClose, onChanged }) => {
  const [task, setTask] = useState<BoardTask | null>(null);
  const [events, setEvents] = useState<BoardEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ task: BoardTask; events: BoardEvent[] }>(`/api/v1/board/${taskId}`);
      setTask(data.task);
      setEvents(data.events);
    } catch (err: any) {
      setError(err?.message || 'Could not load the task');
    }
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/board/${taskId}`, { method: 'PATCH', body: JSON.stringify(body) });
      await load();
      onChanged();
    } catch (err: any) {
      setError(err?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={onClose}>
      <aside className="w-full max-w-md h-full bg-[#0e131e] border-l border-zinc-700 p-6 overflow-y-auto space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-white">{task?.title ?? 'Loading…'}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        {task && (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">{task.status}</span>
              <span className={`px-2 py-0.5 rounded border ${PRIORITY_STYLE[task.priority]}`}>{task.priority}</span>
              {task.labels.map((l) => <span key={l} className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 flex items-center gap-1"><Tag className="w-3 h-3" />{l}</span>)}
            </div>
            {task.description && <p className="text-sm text-zinc-300 whitespace-pre-wrap">{task.description}</p>}
            <dl className="text-xs grid grid-cols-[110px_1fr] gap-y-1.5 text-zinc-400">
              <dt>Posted by</dt><dd className="text-zinc-200">{actorName(task.posted_by)}</dd>
              <dt>Reserved for</dt><dd className="text-zinc-200">{task.assigned_team_id ? teams.find((t) => t.id === task.assigned_team_id)?.name ?? 'a team' : 'any team'}</dd>
              {task.status === 'claimed' && (<><dt>Held by</dt><dd className="text-zinc-200">{actorName(task.claimed_by)} · {task.lease_expired ? 'lease expired' : remaining(task.lease_expires_at, now)}</dd></>)}
              <dt>Attempts</dt><dd className="text-zinc-200">{task.attempts}</dd>
              {task.due_at && (<><dt>Due</dt><dd className="text-zinc-200">{new Date(task.due_at).toLocaleString()}</dd></>)}
            </dl>
            {task.result && (
              <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-900 text-sm text-zinc-200 whitespace-pre-wrap">
                <div className="text-xs text-emerald-400 mb-1 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Result</div>
                {task.result}
              </div>
            )}
            {task.failure_reason && (
              <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-900 text-sm text-rose-200 whitespace-pre-wrap">
                <div className="text-xs text-rose-400 mb-1">Last failure</div>
                {task.failure_reason}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs text-zinc-400">Reserve for</label>
              <select
                className={inputCls}
                value={task.assigned_team_id ?? ''}
                disabled={busy}
                onChange={(e) => act({ action: 'assign', assigned_team_id: e.target.value || null })}
              >
                <option value="">Any team</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <label className="block text-xs text-zinc-400">Priority</label>
              <select className={inputCls} value={task.priority} disabled={busy} onChange={(e) => act({ action: 'edit', priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              {task.status !== 'done' && task.status !== 'cancelled' && (
                <button onClick={() => act({ action: 'cancel' })} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:text-rose-400 disabled:opacity-50">
                  <Ban className="w-3.5 h-3.5" /> Cancel task
                </button>
              )}
              {task.status !== 'open' && (
                <button onClick={() => act({ action: 'reopen' })} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:text-white disabled:opacity-50">
                  <RotateCcw className="w-3.5 h-3.5" /> Reopen
                </button>
              )}
            </div>

            <div>
              <h4 className="text-xs font-semibold text-zinc-300 mb-2">History</h4>
              <ol className="space-y-2 text-xs">
                {events.map((e, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-zinc-500 shrink-0 w-28">{new Date(e.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-zinc-300">
                      <span className="font-semibold">{e.event.replace('_', ' ')}</span> by {actorName(e.actor)}
                      {e.note && <span className="text-zinc-500"> · {e.note}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </aside>
    </div>
  );
};
