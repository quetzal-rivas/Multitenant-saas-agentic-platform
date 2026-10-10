'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Ear,
  Headphones,
  Loader2,
  Phone,
  PhoneCall,
  PhoneOff,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';

/**
 * Live Calls: every phone call (in or out) is a room. Watch the live per-speaker
 * transcript and notes, listen in from the browser (muted), set up voice agents (who
 * answers / calls) and the organization's own Twilio account and numbers.
 */

interface Room {
  id: string;
  kind: 'phone_in' | 'phone_out' | 'browser';
  status: 'ringing' | 'live' | 'ended' | 'failed';
  mode: string;
  customer_number: string | null;
  agent_number: string | null;
  voice_agent_name?: string | null;
  purpose: string | null;
  summary: string | null;
  end_reason: string | null;
  capabilities: { listenIn?: boolean };
  session_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}
interface Utterance {
  seq: number;
  speaker_role: string;
  text: string;
  created_at: string;
}
interface Note {
  id: string;
  level: 'info' | 'warn' | 'alert';
  text: string;
  author: string;
  created_at: string;
}
interface Named {
  id: string;
  name: string;
}
interface VoiceAgent {
  id: string;
  name: string;
  mode: 'elevenlabs' | 'turn_based';
  team_id: string;
  context_profile_id: string | null;
  mcp_profile_id: string | null;
  voice_profile_id: string | null;
  language: string;
  instructions: string | null;
  greeting: string | null;
  consent_message: string | null;
  listener_team_id: string | null;
  triggers: any[];
  calling_hours: { timezone: string; days: number[]; start: string; end: string } | null;
  max_minutes: number;
  elevenlabs: { agent_id: string | null; synced_at: string | null; error: string | null; voice_id: string | null; ready: boolean } | null;
}
interface PhoneNumberRow {
  id: string;
  e164: string;
  friendly_name: string | null;
  capabilities: { voice?: boolean; sms?: boolean };
  voice_agent_id: string | null;
  sms_endpoint_id: string | null;
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
const ROLE_CLS: Record<string, string> = { customer: 'text-sky-300', agent: 'text-emerald-300', staff: 'text-amber-300' };
const ROLE_NAME: Record<string, string> = { customer: 'Customer', agent: 'Agent', staff: 'Staff' };
const NOTE_CLS: Record<string, string> = { info: 'border-zinc-700 text-zinc-300', warn: 'border-amber-800 text-amber-300 bg-amber-950/20', alert: 'border-rose-800 text-rose-300 bg-rose-950/30' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const duration = (r: Room) => {
  const start = r.started_at ? new Date(r.started_at).getTime() : null;
  if (!start) return '';
  const s = Math.max(0, Math.round(((r.ended_at ? new Date(r.ended_at).getTime() : Date.now()) - start) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const LiveCallsView: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const [tab, setTab] = useState<'calls' | 'agents' | 'setup'>('calls');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="h-full flex flex-col bg-[#090b10] text-zinc-100 overflow-hidden">
      <header className="px-6 py-4 border-b border-zinc-800 bg-[#0d1017] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-950/70 border border-emerald-800/80 flex items-center justify-center text-emerald-300">
            <PhoneCall className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">Live Calls</h1>
            <p className="text-xs text-zinc-400">Phone calls answered or placed by your voice agents, with a live per-speaker transcript and listen-in.</p>
          </div>
        </div>
        <div className="inline-flex rounded-md border border-zinc-700 overflow-hidden text-xs">
          {(
            [
              ['calls', 'Calls'],
              ['agents', 'Voice agents'],
              ['setup', 'Twilio & numbers'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`px-3 py-1.5 ${tab === id ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:bg-zinc-800'}`}>
              {label}
            </button>
          ))}
        </div>
      </header>
      {notice && (
        <div className={`mx-6 mt-4 p-3 rounded-lg border text-xs flex items-start gap-2 ${notice.ok ? 'border-emerald-900 bg-emerald-950/30 text-emerald-300' : 'border-rose-900 bg-rose-950/30 text-rose-300'}`}>
          {notice.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />}
          <span className="flex-1 break-words">{notice.text}</span>
          <button onClick={() => setNotice(null)}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'calls' && <CallsTab onNotice={setNotice} onNavigate={onNavigate} />}
        {tab === 'agents' && <AgentsTab onNotice={setNotice} onNavigate={onNavigate} />}
        {tab === 'setup' && <SetupTab onNotice={setNotice} />}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Calls: list + live room
// ---------------------------------------------------------------------------

function CallsTab({ onNotice, onNavigate }: { onNotice: (n: { ok: boolean; text: string } | null) => void; onNavigate?: (tab: string) => void }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { rooms: list } = await api<{ rooms: Room[] }>('/api/v1/rooms');
      setRooms(list);
      setSelected((cur) => cur ?? list.find((r) => r.status === 'live')?.id ?? list[0]?.id ?? null);
    } catch (err: any) {
      onNotice({ ok: false, text: err?.message || 'Could not load calls' });
    } finally {
      setLoading(false);
    }
  }, [onNotice]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return <div className="p-6 text-sm text-zinc-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading calls…</div>;

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
      <aside className="space-y-2">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>{rooms.filter((r) => r.status === 'live' || r.status === 'ringing').length} live · {rooms.length} recent</span>
          <button onClick={load} className="hover:text-white" title="Refresh"><RefreshCw className="w-3.5 h-3.5" /></button>
        </div>
        {rooms.length === 0 && (
          <p className="text-xs text-zinc-500 p-2">
            No calls yet. Connect Twilio, create a voice agent and assign it a number (tabs above). Then call the number, or use &quot;Call my phone&quot;.
          </p>
        )}
        {rooms.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelected(r.id)}
            className={`w-full text-left p-3 rounded-lg border text-xs space-y-1 ${selected === r.id ? 'border-emerald-600 bg-emerald-950/20' : 'border-zinc-800 bg-[#0d1017] hover:border-zinc-600'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-white truncate">{r.customer_number || 'Unknown caller'}</span>
              <StatusPill status={r.status} />
            </div>
            <div className="text-zinc-500">
              {r.kind === 'phone_out' ? 'Outbound' : 'Inbound'} · {r.voice_agent_name ?? 'voice agent'} · {when(r.created_at)}
              {duration(r) ? ` · ${duration(r)}` : ''}
            </div>
          </button>
        ))}
      </aside>
      <main className="min-w-0">{selected ? <RoomPanel roomId={selected} onNotice={onNotice} onNavigate={onNavigate} /> : null}</main>
    </div>
  );
}

function StatusPill({ status }: { status: Room['status'] }) {
  const cls =
    status === 'live' ? 'bg-emerald-600 text-white animate-pulse' : status === 'ringing' ? 'bg-amber-600 text-white' : status === 'failed' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-zinc-800 text-zinc-400';
  return <span className={`px-1.5 py-0.5 rounded text-[10px] ${cls}`}>{status}</span>;
}

function RoomPanel({ roomId, onNotice, onNavigate }: { roomId: string; onNotice: (n: { ok: boolean; text: string } | null) => void; onNavigate?: (tab: string) => void }) {
  const [detail, setDetail] = useState<{ room: Room; utterances: Utterance[]; notes: Note[]; participants: any[]; voice_agent: { name: string; mode: string } | null } | null>(null);
  const [listening, setListening] = useState<'off' | 'connecting' | 'on'>('off');
  const deviceRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const lastSeq = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadDetail = useCallback(async () => {
    try {
      const d = await api<any>(`/api/v1/rooms/${roomId}`);
      lastSeq.current = d.utterances.at(-1)?.seq ?? 0;
      setDetail(d);
    } catch (err: any) {
      onNotice({ ok: false, text: err?.message || 'Could not load the call' });
    }
  }, [roomId, onNotice]);

  useEffect(() => {
    setDetail(null);
    lastSeq.current = 0;
    loadDetail();
  }, [loadDetail]);

  // Live transcript: poll new lines every 2 s while the call is live.
  const live = detail?.room.status === 'live' || detail?.room.status === 'ringing';
  useEffect(() => {
    if (!live) return;
    const t = setInterval(async () => {
      try {
        const d = await api<{ status: Room['status']; utterances: Utterance[]; notes: Note[] }>(`/api/v1/rooms/${roomId}/utterances?since=${lastSeq.current}`);
        if (d.utterances.length) lastSeq.current = d.utterances.at(-1)!.seq;
        setDetail((cur) => (cur ? { ...cur, room: { ...cur.room, status: d.status }, utterances: [...cur.utterances, ...d.utterances], notes: d.notes } : cur));
        if (d.status !== 'live' && d.status !== 'ringing') loadDetail();
      } catch {
        /* keep polling */
      }
    }, 2000);
    return () => clearInterval(t);
  }, [live, roomId, loadDetail]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [detail?.utterances.length]);

  const stopListening = useCallback(() => {
    try {
      callRef.current?.disconnect();
      deviceRef.current?.destroy();
    } catch {
      /* already closed */
    }
    callRef.current = null;
    deviceRef.current = null;
    setListening('off');
  }, []);
  useEffect(() => () => stopListening(), [roomId, stopListening]);

  const listenIn = async () => {
    setListening('connecting');
    try {
      const { token, params } = await api<{ token: string; params: Record<string, string> }>(`/api/v1/rooms/${roomId}/join`, { method: 'POST', body: '{}' });
      const { Device } = await import('@twilio/voice-sdk');
      const device = new Device(token, { logLevel: 'error' } as any);
      deviceRef.current = device;
      const call = await device.connect({ params });
      callRef.current = call;
      call.on('disconnect', () => setListening('off'));
      call.on('error', (e: any) => {
        onNotice({ ok: false, text: `Listen-in error: ${e?.message || e}` });
        setListening('off');
      });
      call.mute(true);
      setListening('on');
    } catch (err: any) {
      onNotice({ ok: false, text: err?.message || 'Could not listen in' });
      stopListening();
    }
  };

  const endCall = async () => {
    if (!confirm('Hang up this call for everyone?')) return;
    try {
      await api(`/api/v1/rooms/${roomId}/end`, { method: 'POST', body: '{}' });
      stopListening();
      loadDetail();
    } catch (err: any) {
      onNotice({ ok: false, text: err?.message || 'Could not end the call' });
    }
  };

  if (!detail) return <div className="text-sm text-zinc-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  const r = detail.room;
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-zinc-800 bg-[#0d1017] flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-white">{r.customer_number || 'Unknown caller'}</span>
            <StatusPill status={r.status} />
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            {r.kind === 'phone_out' ? `Outbound from ${r.agent_number}` : `Inbound to ${r.agent_number}`} · {detail.voice_agent?.name ?? 'voice agent'} ({detail.voice_agent?.mode === 'turn_based' ? 'turn-based' : 'ElevenLabs'}) · {when(r.created_at)}
            {duration(r) ? ` · ${duration(r)}` : ''}
            {r.end_reason ? ` · ${r.end_reason}` : ''}
          </p>
          {r.purpose && <p className="text-xs text-zinc-500 mt-1">Purpose: {r.purpose}</p>}
        </div>
        <div className="flex items-center gap-2 text-xs">
          {live && r.capabilities?.listenIn && (
            listening === 'off' ? (
              <button onClick={listenIn} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"><Headphones className="w-3.5 h-3.5" /> Listen in</button>
            ) : (
              <button onClick={stopListening} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white font-semibold">
                {listening === 'connecting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ear className="w-3.5 h-3.5" />} {listening === 'connecting' ? 'Connecting…' : 'Listening (muted) · stop'}
              </button>
            )
          )}
          {live && <button onClick={endCall} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:text-rose-400"><PhoneOff className="w-3.5 h-3.5" /> End call</button>}
          {r.session_id && onNavigate && <button onClick={() => onNavigate('conversations')} className="px-3 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white">Conversations</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <section className="p-4 rounded-xl border border-zinc-800 bg-[#0d1017] space-y-2 max-h-[60vh] overflow-y-auto">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            Transcript {live && <span className="text-[10px] text-emerald-400 font-normal">● live</span>}
          </h2>
          {detail.utterances.length === 0 && <p className="text-xs text-zinc-500">{live ? 'Waiting for the first words…' : 'No transcript was captured.'}</p>}
          {detail.utterances.map((u) => (
            <div key={u.seq} className="text-sm">
              <span className={`text-xs font-semibold mr-2 ${ROLE_CLS[u.speaker_role] ?? 'text-zinc-300'}`}>{ROLE_NAME[u.speaker_role] ?? u.speaker_role}</span>
              <span className="text-zinc-200">{u.text}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-white">Notes & alerts</h2>
          {r.summary && <div className="p-3 rounded-lg border border-emerald-900 bg-emerald-950/20 text-xs text-emerald-200">{r.summary}</div>}
          {detail.notes.length === 0 && <p className="text-xs text-zinc-500">Notes from the voice agent and the listener team appear here.</p>}
          {detail.notes.map((n) => (
            <div key={n.id} className={`p-2.5 rounded-lg border text-xs ${NOTE_CLS[n.level]}`}>
              <div className="text-[10px] opacity-70 mb-0.5">{n.author} · {new Date(n.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
              {n.text}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Voice agents
// ---------------------------------------------------------------------------

const emptyAgent = (teamId = ''): Omit<VoiceAgent, 'id' | 'elevenlabs'> & { elevenlabs_voice_id?: string | null } => ({
  name: '',
  mode: 'elevenlabs',
  team_id: teamId,
  context_profile_id: null,
  mcp_profile_id: null,
  voice_profile_id: null,
  language: 'es',
  instructions: '',
  greeting: '',
  consent_message: '',
  listener_team_id: null,
  triggers: [],
  calling_hours: null,
  max_minutes: 15,
  elevenlabs_voice_id: null,
});

function AgentsTab({ onNotice, onNavigate }: { onNotice: (n: { ok: boolean; text: string } | null) => void; onNavigate?: (tab: string) => void }) {
  const [agents, setAgents] = useState<VoiceAgent[]>([]);
  const [teams, setTeams] = useState<Named[]>([]);
  const [contextProfiles, setContextProfiles] = useState<Named[]>([]);
  const [mcpProfiles, setMcpProfiles] = useState<Named[]>([]);
  const [voiceProfiles, setVoiceProfiles] = useState<Named[]>([]);
  const [elVoices, setElVoices] = useState<Array<{ id: string; name: string; custom?: boolean }>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyAgent());
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [keywords, setKeywords] = useState('');

  const load = useCallback(async (prefer?: string | null) => {
    const [a, t, c, m, v] = await Promise.all([
      api<{ voice_agents: VoiceAgent[] }>('/api/v1/voice-agents'),
      api<{ teams: Named[] }>('/api/v1/agent-teams').catch(() => ({ teams: [] as Named[] })),
      api<{ profiles: Named[] }>('/api/v1/context-profiles').catch(() => ({ profiles: [] as Named[] })),
      api<{ profiles: Named[] }>('/api/mcp/profiles').catch(() => ({ profiles: [] as Named[] })),
      api<{ profiles: Named[] }>('/api/v1/voice/profiles').catch(() => ({ profiles: [] as Named[] })),
    ]);
    setAgents(a.voice_agents);
    setTeams(t.teams);
    setContextProfiles(c.profiles);
    setMcpProfiles(m.profiles);
    setVoiceProfiles(v.profiles);
    const pick = prefer === null ? null : a.voice_agents.find((x) => x.id === prefer) ?? a.voice_agents[0] ?? null;
    select(pick, t.teams[0]?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load().catch((err) => onNotice({ ok: false, text: err?.message || 'Could not load voice agents' }));
    api<{ voices: Array<{ id: string; name: string; custom?: boolean }> }>('/api/v1/voice/voices?provider=elevenlabs').then((r) => setElVoices(r.voices)).catch(() => undefined);
  }, [load, onNotice]);

  function select(a: VoiceAgent | null, defaultTeam?: string) {
    setSelectedId(a?.id ?? null);
    if (a) {
      const { id: _i, elevenlabs, ...rest } = a;
      setDraft({ ...rest, instructions: rest.instructions ?? '', greeting: rest.greeting ?? '', consent_message: rest.consent_message ?? '', elevenlabs_voice_id: elevenlabs?.voice_id ?? null });
      setKeywords((a.triggers.find((t) => t.type === 'keyword')?.any ?? []).join(', '));
    } else {
      setDraft(emptyAgent(defaultTeam ?? teams[0]?.id ?? ''));
      setKeywords('');
    }
  }

  const selected = agents.find((a) => a.id === selectedId) ?? null;

  const save = async () => {
    setSaving(true);
    onNotice(null);
    try {
      const kw = keywords.split(',').map((k) => k.trim()).filter(Boolean);
      const triggers = [...draft.triggers.filter((t) => t.type !== 'keyword'), ...(kw.length ? [{ type: 'keyword', any: kw, role: 'customer' }] : [])];
      const body = JSON.stringify({ ...draft, triggers, instructions: draft.instructions || null, greeting: draft.greeting || null, consent_message: draft.consent_message || null });
      const { voice_agent } = selectedId
        ? await api<{ voice_agent: VoiceAgent }>(`/api/v1/voice-agents/${selectedId}`, { method: 'PATCH', body })
        : await api<{ voice_agent: VoiceAgent }>('/api/v1/voice-agents', { method: 'POST', body });
      await load(voice_agent.id);
      onNotice(
        voice_agent.elevenlabs?.error
          ? { ok: false, text: `Saved, but ElevenLabs sync failed: ${voice_agent.elevenlabs.error}` }
          : { ok: true, text: voice_agent.mode === 'elevenlabs' ? 'Saved and synced to ElevenLabs. Assign it a number in "Twilio & numbers".' : 'Saved. Assign it a number in "Twilio & numbers".' }
      );
    } catch (err: any) {
      onNotice({ ok: false, text: err?.message || 'Could not save' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedId || !confirm(`Delete "${draft.name}"? Its numbers stop answering and the ElevenLabs agent is removed.`)) return;
    try {
      await api(`/api/v1/voice-agents/${selectedId}`, { method: 'DELETE' });
      await load(null);
    } catch (err: any) {
      onNotice({ ok: false, text: err?.message || 'Could not delete' });
    }
  };

  const testCall = async () => {
    if (!selectedId) return;
    try {
      const res = await api<{ room_id: string }>(`/api/v1/voice-agents/${selectedId}/call`, { method: 'POST', body: JSON.stringify({ to: testTo, purpose: 'Test call from Live Calls' }) });
      onNotice({ ok: true, text: `Calling ${testTo}… open the Calls tab to watch it live (call ${res.room_id.slice(0, 8)}).` });
    } catch (err: any) {
      onNotice({ ok: false, text: err?.message || 'Could not place the call' });
    }
  };

  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
      <aside className="space-y-2">
        <button onClick={() => select(null)} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold">
          <Plus className="w-3.5 h-3.5" /> New voice agent
        </button>
        {agents.map((a) => (
          <button
            key={a.id}
            onClick={() => select(a)}
            className={`w-full text-left p-3 rounded-lg border text-xs ${selectedId === a.id ? 'border-emerald-600 bg-emerald-950/20' : 'border-zinc-800 bg-[#0d1017] hover:border-zinc-600'}`}
          >
            <div className="text-sm text-white">{a.name}</div>
            <div className="text-zinc-500">
              {a.mode === 'elevenlabs' ? 'ElevenLabs Voice Front' : 'Platform turn-based'} · team {teams.find((t) => t.id === a.team_id)?.name ?? '—'}
            </div>
            {a.elevenlabs && !a.elevenlabs.ready && <div className="text-amber-400 mt-0.5">needs sync</div>}
          </button>
        ))}
      </aside>

      <main className="space-y-4 max-w-3xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} value={draft.name} placeholder="e.g. Reception" onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Language</label>
            <input className={inputCls} value={draft.language} placeholder="es, en, multi" onChange={(e) => set({ language: e.target.value })} />
          </div>
        </div>

        <section className="p-4 rounded-xl border border-zinc-800 bg-[#0d1017] space-y-3">
          <h2 className="text-sm font-semibold text-white">Who talks on the call</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(
              [
                ['elevenlabs', 'ElevenLabs Voice Front', 'Natural, sub-second conversation. Uses your team and tools through our MCP server. Needs an ElevenLabs key.'],
                ['turn_based', 'Platform turn-based', 'Any team (incl. Claude) answers turn by turn with your voice profile. ~2–4 s per turn; no voice vendor needed.'],
              ] as const
            ).map(([id, label, hint]) => (
              <button key={id} onClick={() => set({ mode: id })} className={`p-3 rounded-lg border text-left text-xs ${draft.mode === id ? 'border-emerald-600 bg-emerald-950/30' : 'border-zinc-800 hover:border-zinc-600'}`}>
                <div className="text-sm text-white">{label}</div>
                <div className="text-zinc-400 mt-1">{hint}</div>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Team behind the voice</label>
              <select className={inputCls} value={draft.team_id} onChange={(e) => set({ team_id: e.target.value })}>
                <option value="">Choose a team…</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Context profile (what it knows)</label>
              <select className={inputCls} value={draft.context_profile_id ?? ''} onChange={(e) => set({ context_profile_id: e.target.value || null })}>
                <option value="">None</option>
                {contextProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {draft.mode === 'elevenlabs' ? (
              <>
                <div>
                  <label className={labelCls}>MCP profile (tools the voice can use directly)</label>
                  <select className={inputCls} value={draft.mcp_profile_id ?? ''} onChange={(e) => set({ mcp_profile_id: e.target.value || null })}>
                    <option value="">Only call tools (team, notes)</option>
                    {mcpProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>ElevenLabs voice</label>
                  <select className={inputCls} value={draft.elevenlabs_voice_id ?? ''} onChange={(e) => set({ elevenlabs_voice_id: e.target.value || null })}>
                    <option value="">Agent default</option>
                    {elVoices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.custom ? ' (custom)' : ''}</option>)}
                  </select>
                </div>
              </>
            ) : (
              <div>
                <label className={labelCls}>Voice profile (how it sounds)</label>
                <select className={inputCls} value={draft.voice_profile_id ?? ''} onChange={(e) => set({ voice_profile_id: e.target.value || null })}>
                  <option value="">Platform default</option>
                  {voiceProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div>
            <label className={labelCls}>Greeting (first sentence)</label>
            <input className={inputCls} value={draft.greeting ?? ''} placeholder="Hola, gracias por llamar a… ¿en qué le puedo ayudar?" onChange={(e) => set({ greeting: e.target.value })} />
          </div>
          {draft.mode === 'elevenlabs' && (
            <div>
              <label className={labelCls}>Extra instructions for the voice</label>
              <textarea className={`${inputCls} min-h-[70px]`} value={draft.instructions ?? ''} placeholder="Tone, what to offer, when to hand over to a person…" onChange={(e) => set({ instructions: e.target.value })} />
            </div>
          )}
          {selected?.elevenlabs && (
            <p className={`text-xs ${selected.elevenlabs.error ? 'text-rose-400' : selected.elevenlabs.ready ? 'text-emerald-400' : 'text-amber-400'}`}>
              {selected.elevenlabs.error ? `ElevenLabs: ${selected.elevenlabs.error}` : selected.elevenlabs.ready ? `ElevenLabs agent synced ${when(selected.elevenlabs.synced_at)}.` : 'Not synced yet: save to create the ElevenLabs agent.'}
            </p>
          )}
        </section>

        <section className="p-4 rounded-xl border border-zinc-800 bg-[#0d1017] space-y-3">
          <h2 className="text-sm font-semibold text-white">Ear: listening and alerts</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Listener team (optional; never speaks)</label>
              <select className={inputCls} value={draft.listener_team_id ?? ''} onChange={(e) => set({ listener_team_id: e.target.value || null })}>
                <option value="">None: keywords become notes</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Alert keywords (customer)</label>
              <input className={inputCls} value={keywords} placeholder="cancelar, abogado, PROFECO" onChange={(e) => setKeywords(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-zinc-500">A listener team gets the new transcript when a keyword is heard and posts notes; it also writes a summary when the call ends. Give it the room tools in Team Builder.</p>
        </section>

        <section className="p-4 rounded-xl border border-zinc-800 bg-[#0d1017] space-y-3">
          <h2 className="text-sm font-semibold text-white">Consent, hours and limits</h2>
          <div>
            <label className={labelCls}>Consent message (played first)</label>
            <input className={inputCls} value={draft.consent_message ?? ''} placeholder="Esta llamada puede ser grabada y atendida por un asistente de inteligencia artificial." onChange={(e) => set({ consent_message: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={!!draft.calling_hours}
              onChange={(e) => set({ calling_hours: e.target.checked ? { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, days: [1, 2, 3, 4, 5], start: '09:00', end: '20:00' } : null })}
            />
            Only answer and call within these hours
          </label>
          {draft.calling_hours && (
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-center text-xs">
              <input className={inputCls} value={draft.calling_hours.timezone} onChange={(e) => set({ calling_hours: { ...draft.calling_hours!, timezone: e.target.value } })} />
              <input type="time" className={inputCls} value={draft.calling_hours.start} onChange={(e) => set({ calling_hours: { ...draft.calling_hours!, start: e.target.value } })} />
              <input type="time" className={inputCls} value={draft.calling_hours.end} onChange={(e) => set({ calling_hours: { ...draft.calling_hours!, end: e.target.value } })} />
              <div className="sm:col-span-3 flex flex-wrap gap-1">
                {DAYS.map((d, i) => {
                  const on = draft.calling_hours!.days.includes(i);
                  return (
                    <button key={d} onClick={() => set({ calling_hours: { ...draft.calling_hours!, days: on ? draft.calling_hours!.days.filter((x) => x !== i) : [...draft.calling_hours!.days, i].sort() } })} className={`px-2 py-1 rounded border ${on ? 'border-emerald-600 text-white' : 'border-zinc-800 text-zinc-500'}`}>
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="max-w-[200px]">
            <label className={labelCls}>Max call length (minutes)</label>
            <input type="number" min={1} max={120} className={inputCls} value={draft.max_minutes} onChange={(e) => set({ max_minutes: Math.max(1, Math.min(120, Number(e.target.value) || 15)) })} />
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={save} disabled={saving || !draft.name.trim() || !draft.team_id} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {selectedId ? 'Save & sync' : 'Create voice agent'}
          </button>
          {selectedId && (
            <>
              <input className={`${inputCls} max-w-[200px]`} value={testTo} placeholder="+5215512345678" onChange={(e) => setTestTo(e.target.value)} />
              <button onClick={testCall} disabled={!testTo.trim()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-200 hover:text-white disabled:opacity-50">
                <Phone className="w-4 h-4" /> Call my phone
              </button>
              <button onClick={remove} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-400 hover:text-rose-400"><Trash2 className="w-4 h-4" /> Delete</button>
            </>
          )}
          {onNavigate && <button onClick={() => onNavigate('team-builder')} className="text-xs text-emerald-400 hover:text-emerald-300 ml-auto">Open Team Builder →</button>}
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Twilio connection, compliance, numbers
// ---------------------------------------------------------------------------

function SetupTab({ onNotice }: { onNotice: (n: { ok: boolean; text: string } | null) => void }) {
  const [status, setStatus] = useState<{ connection: any; compliance_attested_at: string | null } | null>(null);
  const [numbers, setNumbers] = useState<PhoneNumberRow[]>([]);
  const [agents, setAgents] = useState<Named[]>([]);
  const [sid, setSid] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, n, a] = await Promise.all([
      api<{ connection: any; compliance_attested_at: string | null }>('/api/v1/telephony'),
      api<{ numbers: PhoneNumberRow[] }>('/api/v1/telephony/numbers').catch(() => ({ numbers: [] as PhoneNumberRow[] })),
      api<{ voice_agents: Named[] }>('/api/v1/voice-agents').catch(() => ({ voice_agents: [] as Named[] })),
    ]);
    setStatus(s);
    setNumbers(n.numbers);
    setAgents(a.voice_agents);
  }, []);

  useEffect(() => {
    load().catch((err) => onNotice({ ok: false, text: err?.message || 'Could not load the telephony settings' }));
  }, [load, onNotice]);

  const run = async (work: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    onNotice(null);
    try {
      await work();
      await load();
      onNotice({ ok: true, text: ok });
    } catch (err: any) {
      onNotice({ ok: false, text: err?.message || 'Request failed' });
    } finally {
      setBusy(false);
    }
  };

  if (!status) return <div className="p-6 text-sm text-zinc-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  const conn = status.connection;

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <section className="p-4 rounded-xl border border-zinc-800 bg-[#0d1017] space-y-3">
        <h2 className="text-sm font-semibold text-white">Twilio account (yours)</h2>
        {conn ? (
          <div className="text-xs text-zinc-300 space-y-1">
            <p className="flex items-center gap-1.5 text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> Connected · {conn.account_sid}</p>
            <p className="text-zinc-500">Browser listen-in: {conn.browser_calls ? 'ready' : 'not available (reconnect)'}{conn.last_error ? ` · ${conn.last_error}` : ''}</p>
          </div>
        ) : (
          <p className="text-xs text-zinc-400">Calls, numbers and minutes are billed to your own Twilio account. Find the Account SID and Auth Token on the Twilio Console home page.</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
          <input className={inputCls} value={sid} placeholder="Account SID (AC…)" autoComplete="off" onChange={(e) => setSid(e.target.value)} />
          <input className={inputCls} type="password" value={token} placeholder="Auth Token" autoComplete="off" onChange={(e) => setToken(e.target.value)} />
          <button
            disabled={busy || !sid.trim() || !token.trim()}
            onClick={() => run(() => api('/api/v1/telephony', { method: 'POST', body: JSON.stringify({ action: 'connect', account_sid: sid, auth_token: token }) }).then(() => setToken('')), 'Twilio connected and numbers synced.')}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50"
          >
            {conn ? 'Reconnect' : 'Connect'}
          </button>
        </div>
      </section>

      <section className="p-4 rounded-xl border border-zinc-800 bg-[#0d1017] space-y-2">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Consent and recording compliance</h2>
        {status.compliance_attested_at ? (
          <p className="text-xs text-emerald-400">Confirmed on {when(status.compliance_attested_at)}. Outbound calls are enabled.</p>
        ) : (
          <>
            <p className="text-xs text-zinc-400">
              Before placing outbound calls, an owner confirms that the organization has the people&apos;s consent to be called and recorded by an AI (TCPA in the US, LFPDPPP in Mexico, and local rules), honors do-not-call requests and calls only at reasonable hours. Every call starts with the consent message.
            </p>
            <button disabled={busy} onClick={() => run(() => api('/api/v1/telephony', { method: 'POST', body: JSON.stringify({ action: 'attest_compliance' }) }), 'Compliance confirmed.')} className="px-3 py-2 rounded-lg border border-emerald-700 text-xs text-emerald-300 hover:bg-emerald-950/40">
              I confirm (owner)
            </button>
          </>
        )}
      </section>

      {conn && (
        <section className="p-4 rounded-xl border border-zinc-800 bg-[#0d1017] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Your numbers</h2>
            <button disabled={busy} onClick={() => run(() => api('/api/v1/telephony/numbers', { method: 'POST', body: '{}' }), 'Numbers synced from Twilio.')} className="flex items-center gap-1 text-xs text-zinc-300 hover:text-white">
              <RefreshCw className="w-3.5 h-3.5" /> Sync from Twilio
            </button>
          </div>
          {numbers.length === 0 && <p className="text-xs text-zinc-500">No numbers in this Twilio account yet. Buy or port one in the Twilio Console, then sync.</p>}
          {numbers.map((n) => (
            <div key={n.id} className="grid grid-cols-1 sm:grid-cols-[180px_1fr_auto] gap-2 items-center text-xs">
              <div>
                <div className="text-sm text-white">{n.e164}</div>
                <div className="text-zinc-500">
                  <span className="px-1 py-0.5 rounded bg-red-950 text-red-300 border border-red-900 mr-1">Twilio</span>
                  {[n.capabilities.voice && 'voice', n.capabilities.sms && 'SMS'].filter(Boolean).join(' · ')}
                </div>
              </div>
              <select
                className={inputCls}
                value={n.voice_agent_id ?? ''}
                disabled={busy || !n.capabilities.voice}
                onChange={(e) => run(() => api(`/api/v1/telephony/numbers/${n.id}`, { method: 'PATCH', body: JSON.stringify({ voice_agent_id: e.target.value || null }) }), e.target.value ? 'Number now answers with that voice agent.' : 'Number no longer answers calls here.')}
              >
                <option value="">Calls: not answered here</option>
                {agents.map((a) => <option key={a.id} value={a.id}>Calls answered by {a.name}</option>)}
              </select>
              {n.capabilities.sms && (
                <label className="flex items-center gap-1.5 text-zinc-300">
                  <input
                    type="checkbox"
                    checked={!!n.sms_endpoint_id}
                    disabled={busy}
                    onChange={(e) => run(() => api(`/api/v1/telephony/numbers/${n.id}`, { method: 'PATCH', body: JSON.stringify({ voice_agent_id: n.voice_agent_id, sms_to_webhooks: e.target.checked }) }), e.target.checked ? 'SMS now arrive in Webhooks (set its team there).' : 'SMS no longer arrive here.')}
                  />
                  SMS → Webhooks
                </label>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
