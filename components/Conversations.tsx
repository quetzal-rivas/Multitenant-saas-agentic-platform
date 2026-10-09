'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  CheckCircle2,
  HeartPulse,
  Loader2,
  MessageSquare,
  Mic,
  RefreshCw,
  Search,
  Users,
  Volume2,
  Wrench,
  XCircle,
  Inbox,
} from 'lucide-react';
import { useVoice } from '@/components/voice/useVoice';

/**
 * Conversations inbox: every agent instance in the organization (Agent Studio chats, team
 * instances, heartbeat and scheduled-task instances) with its transcript and runs. Voice
 * turns are marked; any reply can be read aloud with the instance's voice profile.
 */

type Kind = 'agent' | 'team' | 'heartbeat' | 'task' | 'inbound';

const CHANNEL_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram', phone_call: 'Phone call', sms: 'SMS', webhook: 'Webhook' };

interface InboundMessage {
  event_id: string;
  received_at: string;
  status: string;
  error: string | null;
  text: string;
  sender: { id: string; name?: string | null } | null;
  run_id: string | null;
  reply: { sent: boolean; channel?: string; error?: string; skipped?: string; at?: string } | null;
}

interface Conversation {
  id: string;
  name: string;
  kind: Kind;
  team_id: string | null;
  team_name: string | null;
  task_id: string | null;
  channel: string | null;
  contact: { id?: string; name?: string | null } | null;
  provider: string;
  model: string;
  voice: boolean;
  run_count: number;
  last_status: string | null;
  last_error: string | null;
  last_message: string | null;
  last_active_at: string;
}

interface TranscriptItem {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  isError?: boolean;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
}

interface Run {
  run_id: string;
  origin: 'chat' | 'heartbeat' | 'task' | 'inbound';
  channel: 'text' | 'voice';
  voice: { stt_provider?: string; audio_seconds?: number } | null;
  status: string;
  message: string;
  reply: string | null;
  tools: string[];
  steps: number;
  model: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

const KIND_META: Record<Kind, { label: string; icon: React.ElementType; cls: string }> = {
  agent: { label: 'Agent', icon: Bot, cls: 'text-emerald-300 border-emerald-800 bg-emerald-950/40' },
  team: { label: 'Team', icon: Users, cls: 'text-purple-300 border-purple-800 bg-purple-950/40' },
  heartbeat: { label: 'Heartbeat', icon: HeartPulse, cls: 'text-violet-300 border-violet-800 bg-violet-950/40' },
  task: { label: 'Task', icon: CalendarClock, cls: 'text-sky-300 border-sky-800 bg-sky-950/40' },
  inbound: { label: 'Inbound', icon: Inbox, cls: 'text-amber-300 border-amber-800 bg-amber-950/40' },
};

const ORIGIN_LABEL: Record<Run['origin'], string> = { chat: 'chat', heartbeat: 'heartbeat', task: 'scheduled task', inbound: 'inbound message' };

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function StatusIcon({ status }: { status: string | null }) {
  if (status === 'done') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
  if (status === 'error' || status === 'cancelled') return <XCircle className="w-3.5 h-3.5 text-rose-400" />;
  if (status === 'queued' || status === 'running') return <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />;
  return null;
}

export const Conversations: React.FC<{ onOpenInStudio?: (sessionId: string) => void; onOpenCalendar?: () => void }> = ({
  onOpenInStudio,
  onOpenCalendar,
}) => {
  const [list, setList] = useState<Conversation[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [kind, setKind] = useState<Kind | 'voice' | 'all'>('all');
  const [status, setStatus] = useState<'' | 'running' | 'failed'>('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ conversation: Conversation; transcript: TranscriptItem[]; runs: Run[]; inbound: InboundMessage[] | null } | null>(null);
  const [tab, setTab] = useState<'transcript' | 'runs' | 'messages'>('transcript');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const voice = useVoice({ session_id: selected ?? undefined });

  const loadList = useCallback(async () => {
    const params = new URLSearchParams();
    if (kind === 'voice') params.set('voice', 'true');
    else if (kind !== 'all') params.set('kind', kind);
    if (status) params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    try {
      const data = await api<{ conversations: Conversation[]; counts: Record<string, number> }>(`/api/v1/conversations?${params}`);
      setList(data.conversations);
      setCounts(data.counts);
      setSelected((cur) => (cur && data.conversations.some((c) => c.id === cur) ? cur : data.conversations[0]?.id ?? null));
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Could not load conversations');
    } finally {
      setLoading(false);
    }
  }, [kind, status, q]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await api(`/api/v1/conversations/${id}`));
    } catch (err: any) {
      setError(err?.message || 'Could not load the conversation');
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(loadList, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [loadList, q]);

  useEffect(() => {
    setDetail(null);
    setTab('transcript');
    if (selected) loadDetail(selected);
  }, [selected, loadDetail]);

  // Keep running conversations fresh.
  useEffect(() => {
    const t = setInterval(() => {
      loadList();
      if (selected) loadDetail(selected);
    }, 15_000);
    return () => clearInterval(t);
  }, [loadList, loadDetail, selected]);

  const toolResults = useMemo(() => {
    const m = new Map<string, TranscriptItem>();
    detail?.transcript.forEach((t) => t.role === 'tool' && t.toolCallId && m.set(t.toolCallId, t));
    return m;
  }, [detail]);

  // User messages that were spoken (from the runs).
  const spokenMessages = useMemo(() => new Set((detail?.runs || []).filter((r) => r.channel === 'voice').map((r) => r.message)), [detail]);

  const chips: Array<[Kind | 'voice' | 'all', string, number | undefined]> = [
    ['all', 'All', counts.all],
    ['agent', 'Agents', counts.agent],
    ['team', 'Teams', counts.team],
    ['heartbeat', 'Heartbeats', counts.heartbeat],
    ['task', 'Tasks', counts.task],
    ['inbound', 'Inbound', counts.inbound],
    ['voice', 'Voice', counts.voice],
  ];

  const c = detail?.conversation;

  return (
    <div className="h-[calc(100vh-3.5rem)] flex bg-[#090b10] text-zinc-100 overflow-hidden">
      {/* Inbox */}
      <aside className="w-80 shrink-0 border-r border-zinc-800 flex flex-col">
        <div className="p-4 border-b border-zinc-800 space-y-3 bg-[#0d1017]">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold text-white flex items-center gap-2"><MessageSquare className="w-4 h-4 text-emerald-400" /> Conversations</h1>
            <button onClick={() => loadList()} title="Refresh" className="text-zinc-500 hover:text-white"><RefreshCw className="w-3.5 h-3.5" /></button>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, team or message"
              className="w-full bg-[#090b0f] border border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {chips.map(([id, label, n]) => (
              <button
                key={id}
                onClick={() => setKind(id)}
                className={`px-2 py-1 rounded-md text-[11px] border ${kind === id ? 'border-emerald-600 bg-emerald-950/40 text-white' : 'border-zinc-800 text-zinc-400 hover:text-white'}`}
              >
                {label}
                {n !== undefined ? <span className="text-zinc-500"> {n}</span> : null}
              </button>
            ))}
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="w-full bg-[#090b0f] border border-zinc-700 rounded-md px-2 py-1 text-[11px] text-zinc-300"
          >
            <option value="">Any status</option>
            <option value="running">Running now</option>
            <option value="failed">Last run failed</option>
          </select>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="p-4 text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</p>}
          {!loading && list.length === 0 && (
            <p className="p-4 text-xs text-zinc-500">
              Nothing here yet. Conversations appear when you chat in Agent Studio, a team runs its heartbeat, or a scheduled task runs.
            </p>
          )}
          {list.map((conv) => {
            const meta = KIND_META[conv.kind];
            const Icon = meta.icon;
            return (
              <button
                key={conv.id}
                onClick={() => setSelected(conv.id)}
                className={`w-full text-left px-4 py-3 border-b border-zinc-800/70 space-y-1 ${selected === conv.id ? 'bg-zinc-800/60' : 'hover:bg-zinc-900/60'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-white truncate">{conv.name}</span>
                  <span className="text-[10px] text-zinc-500 shrink-0">{ago(conv.last_active_at)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${meta.cls}`}><Icon className="w-2.5 h-2.5" /> {meta.label}</span>
                  {conv.channel && <span className="px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-300">{CHANNEL_LABEL[conv.channel] ?? conv.channel}</span>}
                  {conv.voice && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded border text-rose-300 border-rose-800 bg-rose-950/40"><Mic className="w-2.5 h-2.5" /> voice</span>}
                  {conv.team_name && conv.kind !== 'team' && <span className="text-zinc-500 truncate">{conv.team_name}</span>}
                  <span className="ml-auto"><StatusIcon status={conv.last_status} /></span>
                </div>
                {conv.last_message && <p className="text-[11px] text-zinc-500 truncate">{conv.last_message}</p>}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Detail */}
      <section className="flex-1 min-w-0 flex flex-col">
        {error && (
          <div className="m-4 p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </div>
        )}
        {!selected && !loading && <div className="flex-1 flex items-center justify-center text-sm text-zinc-500">Select a conversation.</div>}
        {selected && !detail && <div className="flex-1 flex items-center justify-center text-sm text-zinc-500 gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
        {c && detail && (
          <>
            <header className="px-6 py-4 border-b border-zinc-800 bg-[#0d1017] flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-white truncate">{c.name}</h2>
                <p className="text-xs text-zinc-400">
                  {KIND_META[c.kind].label}
                  {c.team_name ? ` · ${c.team_name}` : ''} · {c.provider} <code className="text-zinc-500">{c.model}</code> · {c.run_count} run{c.run_count === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {c.kind === 'task' && onOpenCalendar && (
                  <button onClick={onOpenCalendar} className="px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-300 hover:text-white">Open in Task Calendar</button>
                )}
                {onOpenInStudio && (
                  <button onClick={() => onOpenInStudio(c.id)} className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">
                    Continue in Agent Studio
                  </button>
                )}
              </div>
            </header>
            <div className="flex border-b border-zinc-800 text-xs bg-[#0e1118]">
              {(detail.inbound ? (['transcript', 'messages', 'runs'] as const) : (['transcript', 'runs'] as const)).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2.5 capitalize border-b-2 ${tab === t ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
                >
                  {t === 'runs' ? `Runs (${detail.runs.length})` : t === 'messages' ? `Messages & replies (${detail.inbound?.length ?? 0})` : 'Transcript'}
                </button>
              ))}
              {voice.error && <span className="ml-auto self-center pr-4 text-rose-400">{voice.error}</span>}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {tab === 'transcript' && detail.transcript.length === 0 && <p className="text-sm text-zinc-500">No messages yet.</p>}
              {tab === 'transcript' &&
                detail.transcript.map((item, i) => {
                  if (item.role === 'tool') return null;
                  if (item.role === 'user') {
                    return (
                      <div key={i} className="flex justify-end">
                        <div className="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-sm bg-emerald-700/30 border border-emerald-800/60 text-sm whitespace-pre-wrap">
                          {spokenMessages.has(item.content) && <Mic className="inline w-3 h-3 mr-1.5 text-emerald-300" aria-label="spoken" />}
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
                        {item.content && (
                          <div className="text-sm text-zinc-100 whitespace-pre-wrap leading-relaxed">
                            {item.content}
                            <button
                              onClick={() => (voice.phase === 'speaking' ? voice.stopSpeaking() : voice.speak(item.content))}
                              title="Read aloud with this instance's voice"
                              className="ml-2 align-middle text-zinc-500 hover:text-emerald-400"
                            >
                              <Volume2 className="inline w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        {item.toolCalls?.map((call) => {
                          const result = toolResults.get(call.id);
                          return (
                            <details key={call.id} className="rounded-lg border border-zinc-800 bg-[#0d1017] text-xs font-mono">
                              <summary className="px-3 py-2 cursor-pointer flex items-center gap-2 text-zinc-300">
                                <Wrench className="w-3.5 h-3.5 text-cyan-400" /> {call.name}
                                {result?.isError ? <span className="text-rose-400">failed</span> : result ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : null}
                              </summary>
                              <div className="px-3 pb-3 space-y-2">
                                <pre className="p-2 rounded bg-black/40 overflow-x-auto">{JSON.stringify(call.arguments, null, 2)}</pre>
                                {result && <pre className={`p-2 rounded bg-black/40 overflow-x-auto max-h-64 ${result.isError ? 'text-rose-300' : ''}`}>{result.content}</pre>}
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

              {tab === 'messages' && detail.inbound && (
                <div className="space-y-2">
                  {c.contact && (
                    <p className="text-xs text-zinc-400">
                      {CHANNEL_LABEL[c.channel ?? ''] ?? c.channel} contact: <span className="text-zinc-200">{c.contact.name || c.contact.id}</span>
                      {c.contact.name && c.contact.id ? ` (${c.contact.id})` : ''}
                    </p>
                  )}
                  {detail.inbound.length === 0 && <p className="text-sm text-zinc-500">No messages recorded (older than 30 days are removed).</p>}
                  {detail.inbound.map((m) => (
                    <div key={m.event_id} className="p-3 rounded-lg border border-zinc-800 bg-[#0d1017] text-xs space-y-1">
                      <div className="flex items-center gap-2 text-zinc-500">
                        <span>{new Date(m.received_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        <span>· {m.status}</span>
                        {m.reply && (
                          <span className={`ml-auto ${m.reply.sent ? 'text-emerald-400' : m.reply.error ? 'text-rose-400' : 'text-zinc-500'}`}>
                            {m.reply.sent ? `reply delivered via ${CHANNEL_LABEL[m.reply.channel ?? ''] ?? m.reply.channel}` : m.reply.error ? `reply failed: ${m.reply.error}` : m.reply.skipped}
                          </span>
                        )}
                      </div>
                      <p className="text-zinc-200 whitespace-pre-wrap">{m.text}</p>
                      {m.error && <p className="text-rose-400">{m.error}</p>}
                    </div>
                  ))}
                </div>
              )}

              {tab === 'runs' && detail.runs.length === 0 && <p className="text-sm text-zinc-500">No runs recorded for this instance yet.</p>}
              {tab === 'runs' &&
                detail.runs.map((r) => (
                  <div key={r.run_id} className="p-3 rounded-lg border border-zinc-800 bg-[#0d1017] space-y-1.5 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusIcon status={r.status} />
                      <span className="text-zinc-200">{r.status}</span>
                      <span className="text-zinc-500">· {ORIGIN_LABEL[r.origin] ?? r.origin}</span>
                      {r.channel === 'voice' && (
                        <span className="flex items-center gap-1 text-rose-300">
                          <Mic className="w-3 h-3" /> voice{r.voice?.stt_provider ? ` (heard by ${r.voice.stt_provider})` : ''}
                        </span>
                      )}
                      <span className="ml-auto text-zinc-500">
                        {new Date(r.started_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {r.finished_at ? ` · ${Math.max(1, Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000))} s` : ''}
                      </span>
                    </div>
                    <p className="text-zinc-300 line-clamp-2">{r.message}</p>
                    {r.reply && <p className="text-zinc-500 line-clamp-2">→ {r.reply}</p>}
                    {r.tools.length > 0 && <p className="text-zinc-500 font-mono">tools: {r.tools.join(', ')}</p>}
                    {r.error && <p className="text-rose-400">{r.error}</p>}
                  </div>
                ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
};
