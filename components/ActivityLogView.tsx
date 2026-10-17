'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Clock, Code2, Loader2, RefreshCw, ScrollText, Webhook, Wrench, XCircle } from 'lucide-react';
import type { ActivityEntry, ActivityKind, ActivityStatus, TimelineEvent } from '@/lib/services/activity-log';

/**
 * Logs & Tracing: what actually ran in this organization. Agent runs (with a step
 * timeline of tool calls), webhook deliveries and Function Studio calls, newest first.
 */

interface RunDetail {
  run: {
    id: string;
    agent: string;
    origin: string;
    kind: string;
    status: string;
    input: string;
    answer: string | null;
    error: string | null;
    tokens_used: number;
    usage_by_worker: Record<string, { steps: number; tokens: number }>;
    labels: Record<string, string>;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    queue_ms: number | null;
    duration_ms: number | null;
  };
  timeline: TimelineEvent[];
}

const KINDS: { id: ActivityKind | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'run', label: 'Agent runs' },
  { id: 'webhook', label: 'Webhooks' },
  { id: 'function', label: 'Functions' },
];

const KIND_ICON: Record<ActivityKind, React.ElementType> = { run: Bot, webhook: Webhook, function: Code2 };
const KIND_TAB: Record<ActivityKind, string> = { run: 'session-studio', webhook: 'endpoints', function: 'function-studio' };
const KIND_TAB_LABEL: Record<ActivityKind, string> = { run: 'Open Agent Studio', webhook: 'Open Webhooks', function: 'Open Function Studio' };

function StatusIcon({ status }: { status: ActivityStatus }) {
  if (status === 'ok') return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
  if (status === 'error') return <XCircle className="w-4 h-4 text-rose-400 shrink-0" />;
  if (status === 'active') return <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />;
  return <Clock className="w-4 h-4 text-zinc-500 shrink-0" />;
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString() : d.toLocaleString();
}

export const ActivityLogView: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const [kind, setKind] = useState<ActivityKind | 'all'>('all');
  const [status, setStatus] = useState<ActivityStatus | 'any'>('any');
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ActivityEntry | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);

  const load = useCallback(
    async (before?: string) => {
      setLoading(true);
      const params = new URLSearchParams({ limit: '100' });
      if (kind !== 'all') params.set('kind', kind);
      if (status !== 'any') params.set('status', status);
      if (before) params.set('before', before);
      try {
        const res = await fetch(`/api/v1/activity?${params}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load logs.');
        setEntries((prev) => (before ? [...prev, ...data.entries] : data.entries));
        setNextBefore(data.next_before);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load logs.');
      } finally {
        setLoading(false);
      }
    },
    [kind, status],
  );

  useEffect(() => {
    load();
  }, [load]);

  // While something is still running, refresh every few seconds.
  const hasActive = entries.some((e) => e.status === 'active');
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => load(), 5000);
    return () => clearInterval(t);
  }, [hasActive, load]);

  const errors = entries.filter((e) => e.status === 'error').length;

  return (
    <div className="h-full flex flex-col bg-[#090b10] text-zinc-100 overflow-hidden">
      <header className="px-4 sm:px-6 py-4 border-b border-zinc-800 bg-[#0d1017] space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-white flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-emerald-400" /> Logs & Tracing
            </h1>
            <p className="text-xs text-zinc-400">Agent runs step by step, webhook deliveries and function calls.</p>
          </div>
          <button
            onClick={() => load()}
            className="p-2 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 shrink-0"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800 overflow-x-auto max-w-full">
            {KINDS.map((k) => (
              <button
                key={k.id}
                onClick={() => setKind(k.id)}
                className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap ${kind === k.id ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ActivityStatus | 'any')}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200"
          >
            <option value="any">Any status</option>
            <option value="error">Errors</option>
            <option value="active">In progress</option>
            <option value="ok">Succeeded</option>
            <option value="other">Cancelled / ignored</option>
          </select>
          {errors > 0 && status === 'any' && (
            <button onClick={() => setStatus('error')} className="text-xs text-rose-300 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> {errors} error{errors === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <aside className={`${mobileDetail ? 'hidden' : 'flex'} md:flex w-full md:w-[420px] shrink-0 border-r border-zinc-800 flex-col min-h-0`}>
          {error && <p className="m-4 text-xs text-rose-300">{error}</p>}
          <div className="flex-1 overflow-y-auto">
            {!loading && entries.length === 0 && !error && (
              <div className="p-8 text-center text-sm text-zinc-500">
                Nothing here yet. Runs, webhook deliveries and function calls show up as they happen.
              </div>
            )}
            {entries.map((e) => {
              const Icon = KIND_ICON[e.kind];
              return (
                <button
                  key={`${e.kind}:${e.id}`}
                  onClick={() => {
                    setSelected(e);
                    setMobileDetail(true);
                  }}
                  className={`w-full text-left px-4 py-3 border-b border-zinc-900 flex gap-3 ${
                    selected?.id === e.id ? 'bg-zinc-800/60' : 'hover:bg-zinc-900/60'
                  }`}
                >
                  <StatusIcon status={e.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm text-white">
                      <Icon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span className="truncate">{e.title}</span>
                    </div>
                    <div className="text-xs text-zinc-500 truncate mt-0.5">{e.subtitle}</div>
                    {e.error && <div className="text-xs text-rose-300 truncate mt-0.5">{e.error}</div>}
                  </div>
                  <div className="text-[11px] text-zinc-500 text-right shrink-0">
                    <div>{fmtTime(e.at)}</div>
                    <div>{fmtDuration(e.duration_ms)}</div>
                  </div>
                </button>
              );
            })}
            {nextBefore && (
              <button onClick={() => load(nextBefore)} disabled={loading} className="w-full py-3 text-xs text-emerald-400 hover:bg-zinc-900 disabled:opacity-50">
                {loading ? 'Loading…' : 'Load older'}
              </button>
            )}
          </div>
        </aside>

        <section className={`${mobileDetail ? 'block' : 'hidden'} md:block flex-1 min-w-0 overflow-y-auto`}>
          <div className="md:hidden px-4 pt-3">
            <button onClick={() => setMobileDetail(false)} className="text-xs text-emerald-400">← All logs</button>
          </div>
          {selected ? (
            <EntryDetail key={`${selected.kind}:${selected.id}`} entry={selected} onNavigate={onNavigate} />
          ) : (
            <div className="h-full hidden md:flex items-center justify-center text-sm text-zinc-500 p-8 text-center">
              Select an entry to see its details. Agent runs show every step and tool call.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-sm text-zinc-200 mt-0.5 break-words">{children}</div>
    </div>
  );
}

function EntryDetail({ entry, onNavigate }: { entry: ActivityEntry; onNavigate?: (tab: string) => void }) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entry.kind !== 'run') return;
    let alive = true;
    const fetchRun = async () => {
      const res = await fetch(`/api/v1/activity/runs/${entry.id}`, { cache: 'no-store' }).catch(() => null);
      const data = res ? await res.json().catch(() => null) : null;
      if (!alive) return;
      if (!res?.ok || !data?.run) setError(data?.error || 'Could not load this run.');
      else setDetail(data);
    };
    fetchRun();
    const t = entry.status === 'active' ? setInterval(fetchRun, 4000) : undefined;
    return () => {
      alive = false;
      if (t) clearInterval(t);
    };
  }, [entry.id, entry.kind, entry.status]);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <StatusIcon status={entry.status} /> <span className="truncate">{entry.title}</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-1">{entry.subtitle}</p>
        </div>
        {onNavigate && (
          <button onClick={() => onNavigate(KIND_TAB[entry.kind])} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800">
            {KIND_TAB_LABEL[entry.kind]}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-[#0d1017] border border-zinc-800">
        <Field label="Status">{entry.detail_status}</Field>
        <Field label="When">{new Date(entry.at).toLocaleString()}</Field>
        <Field label="Duration">{fmtDuration(entry.duration_ms)}</Field>
        <Field label={entry.kind === 'run' ? 'Tokens' : 'ID'}>
          {entry.kind === 'run' ? (detail?.run.tokens_used ?? entry.tokens ?? 0).toLocaleString() : <span className="font-mono text-xs">{entry.id.slice(0, 8)}</span>}
        </Field>
      </div>

      {entry.error && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-xs text-rose-200 whitespace-pre-wrap break-words">{entry.error}</div>
      )}

      {entry.kind === 'run' && error && <p className="text-xs text-rose-300">{error}</p>}
      {entry.kind === 'run' && !detail && !error && (
        <div className="text-xs text-zinc-500 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading steps…
        </div>
      )}
      {detail && <RunTimeline detail={detail} />}
    </div>
  );
}

function RunTimeline({ detail }: { detail: RunDetail }) {
  const { run, timeline } = detail;
  const workers = Object.entries(run.usage_by_worker);
  const labels = Object.entries(run.labels);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Field label="Source">{run.origin}</Field>
        <Field label="Waited in queue">{fmtDuration(run.queue_ms)}</Field>
        <Field label="Started">{run.started_at ? new Date(run.started_at).toLocaleTimeString() : '—'}</Field>
        <Field label="Finished">{run.finished_at ? new Date(run.finished_at).toLocaleTimeString() : '—'}</Field>
      </div>

      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {labels.map(([k, v]) => (
            <span key={k} className="text-[11px] px-2 py-0.5 rounded border border-zinc-700 text-zinc-300 font-mono">
              {k}={String(v)}
            </span>
          ))}
        </div>
      )}

      <div>
        <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Message</div>
        <p className="text-sm text-zinc-200 whitespace-pre-wrap break-words p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">{run.input || '—'}</p>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Steps ({timeline.length})</div>
        {timeline.length === 0 ? (
          <p className="text-xs text-zinc-500">No steps recorded for this run.</p>
        ) : (
          <ol className="relative border-l border-zinc-800 ml-2 space-y-3">
            {timeline.map((t, i) => {
              const failed = t.status === 'failed' || t.type === 'agent_error';
              const isTool = t.type === 'tool_result' || t.type === 'tool_call';
              return (
                <li key={i} className="ml-4">
                  <span className={`absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full border-2 border-[#090b10] ${failed ? 'bg-rose-500' : isTool ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                    {isTool && <Wrench className="w-3.5 h-3.5 text-zinc-500" />}
                    <span className={`font-mono text-xs break-all ${failed ? 'text-rose-300' : 'text-zinc-200'}`}>{t.name}</span>
                    {t.worker && <span className="text-[11px] px-1.5 rounded bg-zinc-800 text-zinc-400">{t.worker}</span>}
                    {t.latency_ms !== null && <span className="text-[11px] text-zinc-500">{fmtDuration(t.latency_ms)}</span>}
                    <span className="text-[11px] text-zinc-600 ml-auto">{new Date(t.at).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-[11px] text-zinc-500">{t.type.replace(/_/g, ' ')}</div>
                  {t.error && <div className="text-xs text-rose-300 mt-1 whitespace-pre-wrap break-words">{t.error}</div>}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {workers.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Usage by worker</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {workers.map(([name, u]) => (
              <div key={name} className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs">
                <div className="text-zinc-200 truncate">{name}</div>
                <div className="text-zinc-500">
                  {u.steps} steps · {u.tokens.toLocaleString()} tokens
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {run.answer && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Answer</div>
          <p className="text-sm text-zinc-200 whitespace-pre-wrap break-words p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">{run.answer}</p>
        </div>
      )}
    </div>
  );
}
