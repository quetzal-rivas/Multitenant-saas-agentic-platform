'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Play,
  Pause,
  Repeat,
  Users,
  HeartPulse,
  KanbanSquare,
  Ban,
  Pencil,
} from 'lucide-react';
import type { HeartbeatSchedule } from '@/lib/agent/heartbeat-schedule';
import { ScheduleEditor, formatWhen } from '@/components/ScheduleEditor';

// ---------------------------------------------------------------------------
// Types (mirror /api/v1/tasks and /api/v1/calendar)
// ---------------------------------------------------------------------------

interface Task {
  id: string;
  title: string;
  instructions: string | null;
  status: 'scheduled' | 'active' | 'completed' | 'failed' | 'escalated' | 'cancelled';
  team_id: string | null;
  session_id: string | null;
  schedule: HeartbeatSchedule | null;
  repeating: boolean;
  target_time: string | null;
  next_run_at: string | null;
  paused: boolean;
  max_retries: number;
  retry_delay_minutes: number;
  attempt: number;
  escalate_to_board: boolean;
  escalation_team_id: string | null;
  last_run_at: string | null;
  last_status: 'ok' | 'error' | 'skipped' | 'escalated' | null;
  last_error: string | null;
  last_result: string | null;
  run_count: number;
  upcoming?: string[];
}

interface TaskRun {
  run_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  steps: number;
  tools: string[];
  message: string | null;
  error: string | null;
}

interface CalendarItem {
  kind: 'task' | 'task_run' | 'heartbeat' | 'board_due';
  id: string;
  ref_id: string;
  title: string;
  at: string;
  status?: string;
  team_id?: string | null;
  count?: number;
}

interface Team {
  id: string;
  name: string;
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

const inputCls = 'w-full bg-[#090b0f] border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500';
const labelCls = 'block text-xs font-semibold text-zinc-400 mb-1';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_STYLE: Record<string, string> = {
  scheduled: 'text-sky-300 border-sky-800 bg-sky-950/40',
  active: 'text-amber-300 border-amber-800 bg-amber-950/40',
  completed: 'text-emerald-300 border-emerald-800 bg-emerald-950/40',
  failed: 'text-rose-300 border-rose-800 bg-rose-950/40',
  escalated: 'text-rose-300 border-rose-800 bg-rose-950/40',
  cancelled: 'text-zinc-500 border-zinc-700 bg-zinc-900',
};
const STATUS_LABEL: Record<string, string> = { active: 'running' };

function chipStyle(item: CalendarItem): string {
  if (item.kind === 'heartbeat') return 'bg-violet-950/50 text-violet-300 border-violet-900';
  if (item.kind === 'board_due') return 'bg-amber-950/40 text-amber-300 border-amber-900';
  if (item.kind === 'task_run') {
    if (item.status === 'done') return 'bg-emerald-950/40 text-emerald-300 border-emerald-900';
    if (item.status === 'error' || item.status === 'cancelled') return 'bg-rose-950/40 text-rose-300 border-rose-900';
    return 'bg-amber-950/40 text-amber-300 border-amber-900';
  }
  return 'bg-sky-950/40 text-sky-300 border-sky-900';
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** Collapse many heartbeat occurrences of one team on one day into a single chip. */
function groupDay(items: CalendarItem[]): Array<CalendarItem & { count?: number }> {
  const out: Array<CalendarItem & { count?: number }> = [];
  const beats = new Map<string, CalendarItem & { count: number }>();
  for (const it of items) {
    if (it.kind !== 'heartbeat') {
      out.push(it);
      continue;
    }
    const existing = beats.get(it.ref_id);
    if (existing) existing.count += it.count ?? 1;
    else {
      const g = { ...it, count: it.count ?? 1 };
      beats.set(it.ref_id, g);
      out.push(g);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

export const TaskCalendarView: React.FC<{ onNavigateToStudio?: () => void }> = ({ onNavigateToStudio }) => {
  const [view, setView] = useState<'month' | 'week'>('month');
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const range = useMemo(() => {
    if (view === 'week') {
      const start = addDays(cursor, -cursor.getDay());
      return { start, end: addDays(start, 7), days: Array.from({ length: 7 }, (_, i) => addDays(start, i)) };
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = addDays(first, -first.getDay());
    return { start, end: addDays(start, 42), days: Array.from({ length: 42 }, (_, i) => addDays(start, i)) };
  }, [view, cursor]);

  const teamName = useCallback((id: string | null | undefined) => teams.find((t) => t.id === id)?.name ?? 'a team', [teams]);

  const load = useCallback(async () => {
    try {
      const [cal, list, teamList] = await Promise.all([
        api<{ items: CalendarItem[]; truncated: boolean }>(`/api/v1/calendar?from=${range.start.toISOString()}&to=${range.end.toISOString()}`),
        api<{ tasks: Task[] }>('/api/v1/tasks'),
        api<{ teams: Team[] }>('/api/v1/agent-teams').catch(() => ({ teams: [] as Team[] })),
      ]);
      setItems(cal.items);
      setTruncated(cal.truncated);
      setTasks(list.tasks);
      setTeams(teamList.teams);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Could not load the calendar');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const it of items) {
      const k = dayKey(new Date(it.at));
      m.set(k, [...(m.get(k) || []), it]);
    }
    return m;
  }, [items]);

  const today = dayKey(new Date());
  const title =
    view === 'month'
      ? cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : `${range.days[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${range.days[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const move = (dir: number) => setCursor((c) => (view === 'month' ? new Date(c.getFullYear(), c.getMonth() + dir, 1) : addDays(c, 7 * dir)));

  const openItem = (it: CalendarItem) => {
    if (it.kind === 'task' || it.kind === 'task_run') setOpenTaskId(it.ref_id);
  };

  return (
    <div className="h-full flex flex-col bg-[#090b10] text-zinc-100 overflow-hidden">
      <header className="px-6 py-4 border-b border-zinc-800 bg-[#0d1017] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-950/80 border border-sky-800/80 flex items-center justify-center text-sky-400">
            <CalendarDays className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">Task Calendar</h1>
            <p className="text-xs text-zinc-400">Scheduled work that teams run on their own, plus heartbeats and board due dates.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="inline-flex rounded-md border border-zinc-700 overflow-hidden">
            {(['month', 'week'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 capitalize ${view === v ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:bg-zinc-800'}`}>{v}</button>
            ))}
          </div>
          <button onClick={() => move(-1)} className="p-1.5 rounded-md border border-zinc-700 text-zinc-400 hover:text-white"><ChevronLeft className="w-3.5 h-3.5" /></button>
          <button onClick={() => setCursor(startOfDay(new Date()))} className="px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-300 hover:text-white">Today</button>
          <button onClick={() => move(1)} className="p-1.5 rounded-md border border-zinc-700 text-zinc-400 hover:text-white"><ChevronRight className="w-3.5 h-3.5" /></button>
          <span className="text-sm text-white font-medium min-w-[160px] text-center">{title}</span>
          <button onClick={() => setEditing('new')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">
            <Plus className="w-3.5 h-3.5" /> New task
          </button>
        </div>
      </header>

      {error && (
        <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        <main className="flex-1 min-w-0 overflow-x-auto lg:overflow-auto p-4">
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-zinc-400 gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-3 mb-2 text-[11px] text-zinc-400">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-sky-700" /> Scheduled task</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-700" /> Ran</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-700" /> Failed</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-violet-700" /> Heartbeat</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-700" /> Board due / running</span>
                {truncated && <span className="text-amber-400">Very frequent schedules are shown partially.</span>}
              </div>
              <div className="grid grid-cols-7 gap-px bg-zinc-800 border border-zinc-800 rounded-lg overflow-hidden min-w-[700px]">
                {DAY_NAMES.map((d) => (
                  <div key={d} className="bg-[#0d1017] px-2 py-1.5 text-[11px] text-zinc-500 font-semibold">{d}</div>
                ))}
                {range.days.map((day) => {
                  const k = dayKey(day);
                  const dayItems = groupDay(byDay.get(k) || []);
                  const outside = view === 'month' && day.getMonth() !== cursor.getMonth();
                  const limit = view === 'month' ? 3 : 30;
                  return (
                    <div key={k} className={`bg-[#090b10] p-1.5 ${view === 'month' ? 'min-h-[104px]' : 'min-h-[420px]'} ${outside ? 'opacity-40' : ''}`}>
                      <div className={`text-[11px] mb-1 w-6 h-6 flex items-center justify-center rounded-full ${k === today ? 'bg-emerald-600 text-white font-bold' : 'text-zinc-400'}`}>{day.getDate()}</div>
                      <div className="space-y-1">
                        {dayItems.slice(0, limit).map((it) => (
                          <button
                            key={it.id}
                            onClick={() => openItem(it)}
                            title={`${it.title} · ${timeOf(it.at)}${it.kind === 'heartbeat' && it.count && it.count > 1 ? ` · ${it.count} runs` : ''}`}
                            className={`w-full text-left truncate text-[10px] px-1.5 py-0.5 rounded border ${chipStyle(it)}`}
                          >
                            {it.kind === 'heartbeat' ? <HeartPulse className="inline w-2.5 h-2.5 mr-0.5" /> : it.kind === 'board_due' ? <KanbanSquare className="inline w-2.5 h-2.5 mr-0.5" /> : null}
                            {it.kind === 'heartbeat' && it.count && it.count > 1 ? `${it.title} ×${it.count}` : `${timeOf(it.at)} ${it.title}`}
                          </button>
                        ))}
                        {dayItems.length > limit && <div className="text-[10px] text-zinc-500 px-1">+{dayItems.length - limit} more</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </main>

        <aside className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-zinc-800 bg-[#0d1017] lg:overflow-y-auto">
          <div className="px-4 py-3 border-b border-zinc-800 text-sm font-semibold text-zinc-200">Scheduled tasks</div>
          {tasks.length === 0 && !loading && (
            <div className="p-4 text-xs text-zinc-400 space-y-2">
              <p>No tasks yet. A task is work a team does at a time you choose, once or on a schedule. Agents can also schedule tasks with the <span className="font-mono text-zinc-300">contextcontrol_schedule_task</span> tool.</p>
              <button onClick={() => setEditing('new')} className="text-emerald-400 hover:text-emerald-300">Schedule the first task →</button>
            </div>
          )}
          <div className="p-2 space-y-1.5">
            {tasks.map((t) => (
              <button key={t.id} onClick={() => setOpenTaskId(t.id)} className="w-full text-left p-2.5 rounded-lg border border-zinc-800 hover:border-zinc-600 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm text-white leading-snug">{t.title}</span>
                  <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[t.status]}`}>{t.paused ? 'paused' : STATUS_LABEL[t.status] ?? t.status}</span>
                </div>
                <div className="text-[11px] text-zinc-500 flex flex-wrap items-center gap-x-2">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {teamName(t.team_id)}</span>
                  {t.repeating && <span className="flex items-center gap-1"><Repeat className="w-3 h-3" /> repeats</span>}
                  {t.next_run_at && !t.paused && <span>next {formatWhen(t.next_run_at)}</span>}
                </div>
                {t.last_status === 'error' && <div className="text-[11px] text-rose-400 truncate">last run failed: {t.last_error}</div>}
              </button>
            ))}
          </div>
        </aside>
      </div>

      {editing && (
        <TaskForm
          task={editing === 'new' ? null : editing}
          teams={teams}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            setOpenTaskId(id);
            load();
          }}
        />
      )}
      {openTaskId && (
        <TaskDrawer
          taskId={openTaskId}
          teamName={teamName}
          onClose={() => setOpenTaskId(null)}
          onEdit={(t) => {
            setOpenTaskId(null);
            setEditing(t);
          }}
          onChanged={load}
          onNavigateToStudio={onNavigateToStudio}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------

function localInput(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TaskForm: React.FC<{ task: Task | null; teams: Team[]; onClose: () => void; onSaved: (id: string) => void }> = ({ task, teams, onClose, onSaved }) => {
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [title, setTitle] = useState(task?.title ?? '');
  const [instructions, setInstructions] = useState(task?.instructions ?? '');
  const [teamId, setTeamId] = useState(task?.team_id ?? teams[0]?.id ?? '');
  const [repeating, setRepeating] = useState(task?.repeating ?? false);
  const [when, setWhen] = useState(localInput(task?.target_time ?? null));
  const [schedule, setSchedule] = useState<HeartbeatSchedule>(task?.schedule ?? { mode: 'weekly', days: [1, 2, 3, 4, 5], times: ['09:00'], timezone: browserTz });
  const [maxRetries, setMaxRetries] = useState(task?.max_retries ?? 2);
  const [retryDelay, setRetryDelay] = useState(task?.retry_delay_minutes ?? 5);
  const [escalate, setEscalate] = useState(task?.escalate_to_board ?? true);
  const [escalationTeam, setEscalationTeam] = useState(task?.escalation_team_id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        instructions: instructions.trim(),
        team_id: teamId,
        max_retries: maxRetries,
        retry_delay_minutes: retryDelay,
        escalate_to_board: escalate,
        escalation_team_id: escalationTeam || null,
        ...(repeating ? { schedule } : { target_time: new Date(when).toISOString() }),
      };
      if (task) {
        const res = await api<{ task: Task }>(`/api/v1/tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...body, ...(repeating ? { target_time: null } : { schedule: null }) }),
        });
        onSaved(res.task.id);
      } else {
        const res = await api<{ task: Task }>('/api/v1/tasks', { method: 'POST', body: JSON.stringify(body) });
        onSaved(res.task.id);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not save the task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-[#0e131e] border border-zinc-700 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">{task ? 'Edit task' : 'Schedule a task'}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        {teams.length === 0 && <p className="text-xs text-amber-400">Create a team in Team Builder first; a task is run by a team (a team without workers is a single agent).</p>}
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. Morning inbox summary" />
        <div>
          <label className={labelCls}>Instructions (what the team receives when the task runs)</label>
          <textarea className={`${inputCls} min-h-[100px]`} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Search my inbox for unread emails from the last 24 h and summarize them in 5 bullets." />
        </div>
        <div>
          <label className={labelCls}>Team</label>
          <select className={inputCls} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div className="inline-flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
          <button onClick={() => setRepeating(false)} className={`px-3 py-1.5 ${!repeating ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:bg-zinc-800'}`}>Once</button>
          <button onClick={() => setRepeating(true)} className={`px-3 py-1.5 ${repeating ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:bg-zinc-800'}`}>Repeats</button>
        </div>
        {repeating ? (
          <ScheduleEditor value={schedule} onChange={setSchedule} />
        ) : (
          <div>
            <label className={labelCls}>When (your local time)</label>
            <input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3 p-4 rounded-xl border border-zinc-800">
          <div>
            <label className={labelCls}>Retries after a failure</label>
            <input type="number" min={0} max={10} className={inputCls} value={maxRetries} onChange={(e) => setMaxRetries(Math.min(10, Math.max(0, Number(e.target.value) || 0)))} />
          </div>
          <div>
            <label className={labelCls}>Minutes between retries</label>
            <input type="number" min={1} max={1440} className={inputCls} value={retryDelay} onChange={(e) => setRetryDelay(Math.min(1440, Math.max(1, Number(e.target.value) || 1)))} />
          </div>
          <label className="sm:col-span-2 flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={escalate} onChange={(e) => setEscalate(e.target.checked)} />
            If it still fails, post an urgent task on the Supervisor Board
          </label>
          {escalate && (
            <div className="sm:col-span-2">
              <label className={labelCls}>Escalate to</label>
              <select className={inputCls} value={escalationTeam} onChange={(e) => setEscalationTeam(e.target.value)}>
                <option value="">Anyone (a person reviews the board)</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-xs text-zinc-400 hover:text-white">Cancel</button>
          <button onClick={save} disabled={saving || !title.trim() || !instructions.trim() || !teamId} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : task ? 'Save' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Task drawer
// ---------------------------------------------------------------------------

const TaskDrawer: React.FC<{
  taskId: string;
  teamName: (id: string | null | undefined) => string;
  onClose: () => void;
  onEdit: (t: Task) => void;
  onChanged: () => void;
  onNavigateToStudio?: () => void;
}> = ({ taskId, teamName, onClose, onEdit, onChanged, onNavigateToStudio }) => {
  const [task, setTask] = useState<Task | null>(null);
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ task: Task; runs: TaskRun[] }>(`/api/v1/tasks/${taskId}`);
      setTask(data.task);
      setRuns(data.runs);
    } catch (err: any) {
      setError(err?.message || 'Could not load the task');
    }
  }, [taskId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (kind: string, work: () => Promise<unknown>, done?: string) => {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await work();
      if (done) setNotice(done);
      await load();
      onChanged();
    } catch (err: any) {
      setError(err?.message || 'Failed');
    } finally {
      setBusy(null);
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
        {notice && <p className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {notice}</p>}
        {task && (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`px-2 py-0.5 rounded border ${STATUS_STYLE[task.status]}`}>{task.paused ? 'paused' : STATUS_LABEL[task.status] ?? task.status}</span>
              {task.repeating && <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 flex items-center gap-1"><Repeat className="w-3 h-3" /> repeating</span>}
              <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 flex items-center gap-1"><Users className="w-3 h-3" /> {teamName(task.team_id)}</span>
            </div>
            {task.instructions && <p className="text-sm text-zinc-300 whitespace-pre-wrap">{task.instructions}</p>}

            <div className="flex flex-wrap gap-2">
              {task.status !== 'cancelled' && (
                <button onClick={() => act('run', () => api(`/api/v1/tasks/${task.id}`, { method: 'POST', body: JSON.stringify({ action: 'run_now' }) }), 'Started. It runs in the background worker.')} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50">
                  {busy === 'run' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run now
                </button>
              )}
              {task.status === 'scheduled' && (
                <button onClick={() => act('pause', () => api(`/api/v1/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ paused: !task.paused }) }))} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:text-white disabled:opacity-50">
                  {task.paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />} {task.paused ? 'Resume' : 'Pause'}
                </button>
              )}
              {task.status !== 'cancelled' && (
                <button onClick={() => onEdit(task)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:text-white"><Pencil className="w-3.5 h-3.5" /> Edit</button>
              )}
              {!['completed', 'cancelled'].includes(task.status) && (
                <button onClick={() => window.confirm('Cancel this task? It will not run again.') && act('cancel', () => api(`/api/v1/tasks/${task.id}`, { method: 'DELETE' }))} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-400 hover:text-rose-400 disabled:opacity-50">
                  <Ban className="w-3.5 h-3.5" /> Cancel
                </button>
              )}
            </div>

            <dl className="text-xs grid grid-cols-[120px_1fr] gap-y-1.5 text-zinc-400">
              <dt>Next run</dt><dd className="text-zinc-200">{task.paused ? 'paused' : formatWhen(task.next_run_at)}</dd>
              <dt>Last run</dt><dd className="text-zinc-200">{formatWhen(task.last_run_at)}{task.last_status ? ` · ${task.last_status}` : ''}</dd>
              <dt>Runs so far</dt><dd className="text-zinc-200">{task.run_count}</dd>
              <dt>On failure</dt><dd className="text-zinc-200">retry {task.max_retries}× every {task.retry_delay_minutes} min{task.escalate_to_board ? `, then board${task.escalation_team_id ? ` (${teamName(task.escalation_team_id)})` : ''}` : ''}</dd>
            </dl>
            {task.upcoming && task.upcoming.length > 1 && (
              <div className="text-xs text-zinc-400">
                <div className="font-semibold text-zinc-300 mb-1">Upcoming</div>
                <ol className="list-decimal list-inside space-y-0.5">{task.upcoming.map((u) => <li key={u}>{formatWhen(u, task.schedule?.timezone)}</li>)}</ol>
              </div>
            )}
            {task.last_result && (
              <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-900 text-sm text-zinc-200 whitespace-pre-wrap">
                <div className="text-xs text-emerald-400 mb-1">Last result</div>
                {task.last_result}
              </div>
            )}
            {task.last_error && task.last_status !== 'ok' && (
              <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-900 text-sm text-rose-200 whitespace-pre-wrap">
                <div className="text-xs text-rose-400 mb-1">Last error</div>
                {task.last_error}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-zinc-300">Run history</h4>
                {task.session_id && onNavigateToStudio && (
                  <button onClick={onNavigateToStudio} className="text-[11px] text-emerald-400 hover:text-emerald-300">Open transcripts in Agent Studio →</button>
                )}
              </div>
              {runs.length === 0 && <p className="text-xs text-zinc-500">Not run yet.</p>}
              <ol className="space-y-2">
                {runs.map((r) => (
                  <li key={r.run_id} className="p-2.5 rounded-lg border border-zinc-800 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={r.status === 'done' ? 'text-emerald-400' : r.status === 'error' || r.status === 'cancelled' ? 'text-rose-400' : 'text-amber-400'}>{r.status === 'done' ? 'done' : r.status}</span>
                      <span className="text-zinc-500">{formatWhen(r.started_at)}</span>
                    </div>
                    <div className="text-zinc-500">{r.steps} step{r.steps === 1 ? '' : 's'}{r.tools.length ? ` · ${r.tools.join(', ')}` : ''}</div>
                    {r.message && <div className="text-zinc-300 line-clamp-3">{r.message}</div>}
                    {r.error && <div className="text-rose-300 line-clamp-3">{r.error}</div>}
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
