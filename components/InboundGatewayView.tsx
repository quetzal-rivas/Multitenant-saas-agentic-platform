'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  FlaskConical,
  Inbox,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Webhook,
  X,
} from 'lucide-react';
import { INBOUND_PRESETS, PRESET_LABEL, PRESET_SECRETS, type InboundPreset, type RoutingRule } from '@/lib/inbound/types';

/**
 * Webhooks (Inbound Gateway): endpoints that outside systems call (Meta, ElevenLabs,
 * Twilio, Telnyx, anything that signs requests). Each verified event is routed by rules
 * or an AI Function Studio router into a conversation answered by a team.
 */

interface Endpoint {
  id: string;
  name: string;
  preset: InboundPreset;
  enabled: boolean;
  default_team_id: string | null;
  rules: RoutingRule[];
  router_function_id: string | null;
  reply: { enabled: boolean; url?: string | null };
  verify_settings: { signature_header?: string | null; timestamp_header?: string | null; unsigned?: boolean };
  secrets_set: string[];
  url: string;
  last_event_at?: string | null;
  last_event_status?: string | null;
}

interface EventRow {
  id: string;
  received_at: string;
  status: string;
  error: string | null;
  normalized: { channel?: string; text?: string; sender?: { id: string; name?: string | null }; type?: string } | null;
  thread_id: string | null;
  run_id: string | null;
  route_detail: { decided_by?: string; rule?: string | number; team_id?: string; reason?: string } | null;
  reply_status: { sent?: boolean; error?: string; skipped?: string; channel?: string } | null;
}

interface Named {
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
const STATUS_CLS: Record<string, string> = {
  routed: 'text-emerald-300 border-emerald-800',
  queued: 'text-amber-300 border-amber-800',
  received: 'text-sky-300 border-sky-800',
  processing: 'text-sky-300 border-sky-800',
  ignored: 'text-zinc-400 border-zinc-700',
  failed: 'text-rose-300 border-rose-800',
};

const SETUP: Record<InboundPreset, string[]> = {
  meta: [
    'Meta App Dashboard → your app → Webhooks (WhatsApp, Messenger or Instagram).',
    'Callback URL: the URL above. Verify token: the same value you save below.',
    'Subscribe to the "messages" field. Save the App secret (App settings → Basic) so signatures are checked.',
    'For replies, save a WhatsApp system-user token (or the Page token for Messenger/Instagram).',
  ],
  elevenlabs: [
    'ElevenLabs → Agents → Settings → Post-call webhook: paste the URL above.',
    'Enable transcription (and audio if you want recordings in S3). Save the webhook secret below.',
  ],
  twilio: ['Twilio Console → your number → Messaging (or status callback): set this URL, HTTP POST.', 'Save your Auth token so X-Twilio-Signature is checked.'],
  telnyx: ['Telnyx Portal → Messaging/Voice profile → Webhook URL: the URL above (API v2).', 'Save your account public key (Keys & Credentials).'],
  generic: [
    'Send a POST with your JSON payload to the URL above.',
    'Sign it: header X-Signature = hex HMAC-SHA256(signing secret, raw body) ("sha256=" prefix optional).',
    'Useful fields: id, conversation_id, from, name, text. A router function can read anything else.',
  ],
};

const SAMPLES: Record<InboundPreset, unknown> = {
  meta: {
    object: 'whatsapp_business_account',
    entry: [{ id: 'WABA_ID', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '15550001111', phone_number_id: '1234567890' }, contacts: [{ profile: { name: 'Ana' }, wa_id: '5215512345678' }], messages: [{ from: '5215512345678', id: 'wamid.TEST1', timestamp: '1760000000', type: 'text', text: { body: '¿Cuál es el precio del plan Pro?' } }] } }] }],
  },
  elevenlabs: {
    type: 'post_call_transcription',
    event_timestamp: 1760000000,
    data: { agent_id: 'agent_x', agent_name: 'Reception', conversation_id: 'conv_123', transcript: [{ role: 'agent', message: 'Hello, how can I help?' }, { role: 'user', message: 'I need to reschedule my appointment.' }], metadata: { call_duration_secs: 42 }, analysis: { transcript_summary: 'Caller wants to reschedule.' } },
  },
  twilio: 'MessageSid=SM123&From=%2B5215512345678&To=%2B15550001111&Body=Hello',
  telnyx: { data: { event_type: 'message.received', id: 'evt_1', payload: { id: 'msg_1', text: 'Hello', from: { phone_number: '+5215512345678' }, to: [{ phone_number: '+15550001111' }] } } },
  generic: { id: 'evt_1', conversation_id: 'order-1001', from: 'customer@example.com', name: 'Ana', text: 'Where is my order?' },
};

const emptyEndpoint = (preset: InboundPreset = 'generic'): Omit<Endpoint, 'id' | 'url' | 'secrets_set'> => ({
  name: '',
  preset,
  enabled: true,
  default_team_id: null,
  rules: [],
  router_function_id: null,
  reply: { enabled: true, url: null },
  verify_settings: {},
});

export const InboundGatewayView: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [teams, setTeams] = useState<Named[]>([]);
  const [functions, setFunctions] = useState<Array<Named & { status: string }>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyEndpoint());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'setup' | 'test' | 'events'>('setup');
  const [events, setEvents] = useState<EventRow[]>([]);
  const [sample, setSample] = useState('');
  const [dry, setDry] = useState<any | null>(null);

  const selected = endpoints.find((e) => e.id === selectedId) ?? null;
  const teamName = useCallback((id?: string | null) => teams.find((t) => t.id === id)?.name ?? (id ? 'unknown team' : '—'), [teams]);

  const load = useCallback(async (prefer?: string | null) => {
    const [eps, ts, fns] = await Promise.all([
      api<{ endpoints: Endpoint[] }>('/api/v1/inbound/endpoints'),
      api<{ teams: Named[] }>('/api/v1/agent-teams').catch(() => ({ teams: [] as Named[] })),
      api<{ functions: Array<Named & { status: string }> }>('/api/v1/functions').catch(() => ({ functions: [] })),
    ]);
    setEndpoints(eps.endpoints);
    setTeams(ts.teams);
    setFunctions(fns.functions);
    const pick = prefer === null ? null : eps.endpoints.find((e) => e.id === (prefer ?? selectedId)) ?? eps.endpoints[0] ?? null;
    setSelectedId(pick?.id ?? null);
    if (pick) {
      const { id: _i, url: _u, secrets_set: _s, last_event_at: _l, last_event_status: _ls, ...rest } = pick;
      setDraft(rest);
    } else setDraft(emptyEndpoint());
  }, [selectedId]);

  useEffect(() => {
    load()
      .catch((err) => setNotice({ ok: false, text: err?.message || 'Could not load webhooks' }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadEvents = useCallback(async () => {
    if (!selectedId) return setEvents([]);
    try {
      setEvents((await api<{ events: EventRow[] }>(`/api/v1/inbound/endpoints/${selectedId}/events`)).events);
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'Could not load events' });
    }
  }, [selectedId]);

  useEffect(() => {
    if (tab !== 'events') return;
    loadEvents();
    const t = setInterval(loadEvents, 10_000);
    return () => clearInterval(t);
  }, [tab, loadEvents]);

  useEffect(() => {
    const s = SAMPLES[draft.preset];
    setSample(typeof s === 'string' ? s : JSON.stringify(s, null, 2));
    setDry(null);
  }, [draft.preset, selectedId]);

  const routerFunctions = useMemo(() => functions.filter((f) => f.status === 'deployed' || f.id === draft.router_function_id), [functions, draft.router_function_id]);

  const select = (e: Endpoint | null) => {
    setNotice(null);
    setSecretDrafts({});
    setDry(null);
    setTab('setup');
    setSelectedId(e?.id ?? null);
    if (e) {
      const { id: _i, url: _u, secrets_set: _s, last_event_at: _l, last_event_status: _ls, ...rest } = e;
      setDraft(rest);
    } else setDraft(emptyEndpoint());
  };

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const body = JSON.stringify({ ...draft, reply: { enabled: draft.reply.enabled, url: draft.reply.url || null } });
      const { endpoint } = selectedId
        ? await api<{ endpoint: Endpoint }>(`/api/v1/inbound/endpoints/${selectedId}`, { method: 'PATCH', body })
        : await api<{ endpoint: Endpoint }>('/api/v1/inbound/endpoints', { method: 'POST', body });
      await load(endpoint.id);
      setNotice({ ok: true, text: selectedId ? 'Saved.' : 'Created. Copy the URL into the sending service and save the secrets below.' });
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'Could not save' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedId || !confirm(`Delete "${draft.name}"? Its URL stops working immediately.`)) return;
    try {
      await api(`/api/v1/inbound/endpoints/${selectedId}`, { method: 'DELETE' });
      await load(null);
      select(null);
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'Could not delete' });
    }
  };

  const saveSecret = async (name: string) => {
    if (!selectedId) return;
    try {
      await api(`/api/v1/inbound/endpoints/${selectedId}/secrets`, { method: 'PUT', body: JSON.stringify({ name, value: secretDrafts[name] }) });
      setSecretDrafts((d) => ({ ...d, [name]: '' }));
      await load(selectedId);
      setNotice({ ok: true, text: 'Secret saved (encrypted; it will not be shown again).' });
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'Could not save the secret' });
    }
  };

  const removeSecret = async (name: string) => {
    if (!selectedId || !confirm('Remove this secret? Requests can no longer be verified with it.')) return;
    try {
      await api(`/api/v1/inbound/endpoints/${selectedId}/secrets?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
      await load(selectedId);
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'Could not remove the secret' });
    }
  };

  const runDry = async () => {
    if (!selectedId) return;
    setDry(null);
    try {
      const res = await fetch(`/api/v1/inbound/endpoints/${selectedId}/test`, { method: 'POST', body: sample, cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Dry run failed');
      setDry(body);
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'Dry run failed' });
    }
  };

  const replay = async (eventId: string) => {
    try {
      await api(`/api/v1/inbound/endpoints/${selectedId}/events`, { method: 'POST', body: JSON.stringify({ action: 'replay', event_id: eventId }) });
      await loadEvents();
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'Could not replay' });
    }
  };

  const setRule = (i: number, patch: Partial<RoutingRule>) => setDraft((d) => ({ ...d, rules: d.rules.map((r, n) => (n === i ? { ...r, ...patch } : r)) }));

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-zinc-400 gap-2 bg-[#090b10]">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading webhooks…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#090b10] text-zinc-100">
      <header className="px-6 py-4 border-b border-zinc-800 bg-[#0d1017] flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-950/70 border border-amber-800/80 flex items-center justify-center text-amber-300">
          <Webhook className="w-4 h-4" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-white">Webhooks</h1>
          <p className="text-xs text-zinc-400">Receive WhatsApp, Instagram, Messenger, call results or any signed webhook, and route each one to the team that answers it.</p>
        </div>
      </header>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <aside className="space-y-2">
          <button onClick={() => select(null)} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold">
            <Plus className="w-3.5 h-3.5" /> New endpoint
          </button>
          {endpoints.length === 0 && <p className="text-xs text-zinc-500 p-2">No endpoints yet. Create one per source (for example one for your WhatsApp app).</p>}
          {endpoints.map((e) => (
            <button
              key={e.id}
              onClick={() => select(e)}
              className={`w-full text-left p-3 rounded-lg border text-xs ${selectedId === e.id ? 'border-emerald-600 bg-emerald-950/20' : 'border-zinc-800 bg-[#0d1017] hover:border-zinc-600'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-white truncate">{e.name}</span>
                {!e.enabled && <span className="text-[10px] text-zinc-500">off</span>}
              </div>
              <div className="text-zinc-500 mt-0.5">{PRESET_LABEL[e.preset]}</div>
              <div className="text-zinc-600 mt-0.5">{e.last_event_at ? `last event ${new Date(e.last_event_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${e.last_event_status}` : 'no events yet'}</div>
            </button>
          ))}
        </aside>

        <main className="space-y-5 max-w-4xl min-w-0">
          {notice && (
            <div className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${notice.ok ? 'border-emerald-900 bg-emerald-950/30 text-emerald-300' : 'border-rose-900 bg-rose-950/30 text-rose-300'}`}>
              {notice.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />}
              <span className="flex-1 break-words">{notice.text}</span>
              <button onClick={() => setNotice(null)}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {selected && (
            <div className="flex border-b border-zinc-800 text-xs">
              {(
                [
                  ['setup', 'Setup & routing'],
                  ['test', 'Test'],
                  ['events', 'Event log'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 border-b-2 ${tab === id ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {(tab === 'setup' || !selected) && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Name</label>
                  <input className={inputCls} value={draft.name} placeholder="e.g. WhatsApp support line" onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Source</label>
                  <select className={inputCls} value={draft.preset} disabled={!!selectedId} onChange={(e) => setDraft((d) => ({ ...d, preset: e.target.value as InboundPreset }))}>
                    {INBOUND_PRESETS.map((p) => (
                      <option key={p} value={p}>{PRESET_LABEL[p]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {selected && (
                <section className="p-4 rounded-xl border border-zinc-800 bg-[#0d1017] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-white">Endpoint URL</h2>
                    <label className="flex items-center gap-2 text-xs text-zinc-300">
                      <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))} /> Enabled
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <code className="flex-1 min-w-0 truncate px-3 py-2 rounded-lg bg-black/40 border border-zinc-800 text-xs text-emerald-300">{selected.url}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selected.url);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                      className="px-3 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white"
                      title="Copy URL"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <ol className="list-decimal list-inside text-xs text-zinc-400 space-y-1">
                    {SETUP[draft.preset].map((s, i) => <li key={i}>{s}</li>)}
                  </ol>

                  <div className="space-y-2 pt-1">
                    <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" /> Secrets</h3>
                    {PRESET_SECRETS[draft.preset].map((sec) => {
                      const isSet = selected.secrets_set.includes(sec.name);
                      return (
                        <div key={sec.name} className="grid grid-cols-1 sm:grid-cols-[180px_1fr_auto] gap-2 items-center text-xs">
                          <span className="text-zinc-300">
                            {sec.label}
                            {sec.required && !isSet && <span className="text-amber-400"> · needed</span>}
                            {isSet && <span className="text-emerald-400"> · set</span>}
                          </span>
                          <input
                            type="password"
                            autoComplete="off"
                            className={inputCls}
                            placeholder={isSet ? 'Replace…' : sec.hint}
                            value={secretDrafts[sec.name] ?? ''}
                            onChange={(e) => setSecretDrafts((d) => ({ ...d, [sec.name]: e.target.value }))}
                          />
                          <div className="flex gap-1">
                            <button disabled={!secretDrafts[sec.name]?.trim()} onClick={() => saveSecret(sec.name)} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40">Save</button>
                            {isSet && <button onClick={() => removeSecret(sec.name)} className="px-2 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-rose-400" title="Remove"><Trash2 className="w-3.5 h-3.5" /></button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {draft.preset === 'generic' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
                      <div>
                        <label className={labelCls}>Signature header</label>
                        <input className={inputCls} placeholder="X-Signature" value={draft.verify_settings.signature_header ?? ''} onChange={(e) => setDraft((d) => ({ ...d, verify_settings: { ...d.verify_settings, signature_header: e.target.value || null } }))} />
                      </div>
                      <div>
                        <label className={labelCls}>Timestamp header (optional)</label>
                        <input className={inputCls} placeholder="X-Timestamp" value={draft.verify_settings.timestamp_header ?? ''} onChange={(e) => setDraft((d) => ({ ...d, verify_settings: { ...d.verify_settings, timestamp_header: e.target.value || null } }))} />
                      </div>
                      <label className="flex items-center gap-2 text-amber-300 sm:pt-6">
                        <input type="checkbox" checked={!!draft.verify_settings.unsigned} onChange={(e) => setDraft((d) => ({ ...d, verify_settings: { ...d.verify_settings, unsigned: e.target.checked } }))} />
                        Accept unsigned requests (testing only)
                      </label>
                    </div>
                  )}
                </section>
              )}

              <section className="p-4 rounded-xl border border-zinc-800 bg-[#0d1017] space-y-3">
                <h2 className="text-sm font-semibold text-white">Routing</h2>
                <p className="text-xs text-zinc-400">
                  Each conversation (one WhatsApp number, one caller, one conversation id) gets its own thread and agent instance, so the team remembers it. Order: router function → rules → default team.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Default team</label>
                    <select className={inputCls} value={draft.default_team_id ?? ''} onChange={(e) => setDraft((d) => ({ ...d, default_team_id: e.target.value || null }))}>
                      <option value="">None (unmatched events are ignored)</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Router function (AI Function Studio)</label>
                    <div className="flex gap-2">
                      <select className={inputCls} value={draft.router_function_id ?? ''} onChange={(e) => setDraft((d) => ({ ...d, router_function_id: e.target.value || null }))}>
                        <option value="">None: use the rules below</option>
                        {routerFunctions.map((f) => <option key={f.id} value={f.id}>{f.name}{f.status !== 'deployed' ? ' (not deployed)' : ''}</option>)}
                      </select>
                      {onNavigate && (
                        <button onClick={() => onNavigate('function-studio')} title="Write a router in AI Function Studio (New function → Webhook router)" className="px-3 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:text-white whitespace-nowrap">
                          New router
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {!draft.router_function_id && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-zinc-300">Rules (first match wins)</h3>
                      <button
                        onClick={() => setDraft((d) => ({ ...d, rules: [...d.rules, { name: '', when: [{ path: 'event.text', op: 'contains', value: '' }], team_id: d.default_team_id, action: 'route' }] }))}
                        className="text-xs text-emerald-400 hover:text-emerald-300"
                      >
                        + Add rule
                      </button>
                    </div>
                    {draft.rules.length === 0 && <p className="text-xs text-zinc-500">No rules: everything goes to the default team.</p>}
                    {draft.rules.map((rule, i) => (
                      <div key={i} className="p-3 rounded-lg border border-zinc-800 bg-black/20 space-y-2 text-xs">
                        <div className="flex gap-2 items-center">
                          <span className="text-zinc-500">#{i + 1}</span>
                          <input className={inputCls} placeholder="Rule name (optional)" value={rule.name ?? ''} onChange={(e) => setRule(i, { name: e.target.value })} />
                          <button onClick={() => setDraft((d) => ({ ...d, rules: d.rules.filter((_, n) => n !== i) }))} className="text-zinc-500 hover:text-rose-400" title="Remove rule"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                        {rule.when.map((c, ci) => (
                          <div key={ci} className="grid grid-cols-[1fr_110px_1fr_auto] gap-2">
                            <input className={inputCls} placeholder="event.text, event.channel, raw.…" value={c.path} onChange={(e) => setRule(i, { when: rule.when.map((x, n) => (n === ci ? { ...x, path: e.target.value } : x)) })} />
                            <select className={inputCls} value={c.op} onChange={(e) => setRule(i, { when: rule.when.map((x, n) => (n === ci ? { ...x, op: e.target.value as any } : x)) })}>
                              <option value="contains">contains</option>
                              <option value="equals">equals</option>
                              <option value="regex">matches regex</option>
                              <option value="exists">exists</option>
                            </select>
                            <input className={inputCls} disabled={c.op === 'exists'} value={c.value ?? ''} onChange={(e) => setRule(i, { when: rule.when.map((x, n) => (n === ci ? { ...x, value: e.target.value } : x)) })} />
                            <button onClick={() => setRule(i, { when: rule.when.filter((_, n) => n !== ci) })} className="text-zinc-500 hover:text-rose-400"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ))}
                        <button onClick={() => setRule(i, { when: [...rule.when, { path: 'event.channel', op: 'equals', value: '' }] })} className="text-emerald-400 hover:text-emerald-300">+ condition</button>
                        <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2">
                          <select className={inputCls} value={rule.action ?? 'route'} onChange={(e) => setRule(i, { action: e.target.value as 'route' | 'ignore' })}>
                            <option value="route">Route to</option>
                            <option value="ignore">Ignore</option>
                          </select>
                          {(rule.action ?? 'route') === 'route' && (
                            <select className={inputCls} value={rule.team_id ?? ''} onChange={(e) => setRule(i, { team_id: e.target.value || null })}>
                              <option value="">Default team</option>
                              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                          )}
                        </div>
                        {(rule.action ?? 'route') === 'route' && (
                          <input
                            className={inputCls}
                            placeholder="Message to the team (optional), e.g. Sales lead {{event.sender.name}}: {{event.text}}"
                            value={rule.message_template ?? ''}
                            onChange={(e) => setRule(i, { message_template: e.target.value || null })}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="p-4 rounded-xl border border-zinc-800 bg-[#0d1017] space-y-2 text-xs">
                <h2 className="text-sm font-semibold text-white">Replies</h2>
                <label className="flex items-center gap-2 text-zinc-300">
                  <input type="checkbox" checked={draft.reply.enabled} onChange={(e) => setDraft((d) => ({ ...d, reply: { ...d.reply, enabled: e.target.checked } }))} />
                  Send the team&apos;s answer back {draft.preset === 'meta' ? 'on WhatsApp / Messenger / Instagram (needs the access token)' : draft.preset === 'generic' ? 'to a reply URL' : '(call results and SMS stay in the conversation)'}
                </label>
                {draft.preset === 'generic' && draft.reply.enabled && (
                  <input className={inputCls} placeholder="https://your-app.example.com/agent-replies (optional)" value={draft.reply.url ?? ''} onChange={(e) => setDraft((d) => ({ ...d, reply: { ...d.reply, url: e.target.value } }))} />
                )}
              </section>

              <div className="flex items-center gap-2">
                <button onClick={save} disabled={saving || !draft.name.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {selectedId ? 'Save changes' : 'Create endpoint'}
                </button>
                {selectedId && (
                  <button onClick={remove} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-400 hover:text-rose-400">
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                )}
              </div>
            </>
          )}

          {selected && tab === 'test' && (
            <section className="space-y-3">
              <p className="text-xs text-zinc-400">Dry run with the saved settings: shows how a payload would be routed. No signature check, nothing stored, no agent runs.</p>
              <textarea className={`${inputCls} font-mono text-xs min-h-[220px]`} value={sample} onChange={(e) => setSample(e.target.value)} />
              <button onClick={runDry} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">
                <FlaskConical className="w-4 h-4" /> Dry run
              </button>
              {dry?.events?.length === 0 && <p className="text-xs text-zinc-500">No messages found in this payload.</p>}
              {dry?.events?.map((r: any, i: number) => (
                <div key={i} className="p-3 rounded-lg border border-zinc-800 bg-[#0d1017] text-xs space-y-1">
                  <div className="text-zinc-300">
                    {r.event.channel} · from <span className="text-white">{r.event.sender?.name || r.event.sender?.id}</span> · thread <code>{r.decision.conversation_key ?? r.event.conversation_key}</code>
                  </div>
                  <div className={r.decision.action === 'route' ? 'text-emerald-300' : r.decision.action === 'fail' ? 'text-rose-300' : 'text-zinc-400'}>
                    {r.decision.action === 'route' ? `→ ${r.decision.team_name ?? teamName(r.decision.team_id)}` : r.decision.action === 'fail' ? 'fails' : 'ignored'}
                    {r.decision.decided_by ? ` (by ${String(r.decision.decided_by).replace('_', ' ')}${r.decision.rule ? ` ${r.decision.rule}` : ''})` : ''}
                    {r.decision.reason ? ` · ${r.decision.reason}` : ''}
                  </div>
                  {r.decision.message && <pre className="p-2 rounded bg-black/40 whitespace-pre-wrap text-zinc-300">{r.decision.message}</pre>}
                </div>
              ))}
            </section>
          )}

          {selected && tab === 'events' && (
            <section className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Last 50 events (kept 30 days). Updates every 10 s.</span>
                <button onClick={loadEvents} className="flex items-center gap-1 hover:text-white"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
              </div>
              {events.length === 0 && (
                <p className="text-xs text-zinc-500 flex items-center gap-2"><Inbox className="w-4 h-4" /> Nothing received yet.</p>
              )}
              {events.map((e) => (
                <div key={e.id} className="p-3 rounded-lg border border-zinc-800 bg-[#0d1017] text-xs space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded border ${STATUS_CLS[e.status] ?? 'border-zinc-700 text-zinc-400'}`}>{e.status}</span>
                    <span className="text-zinc-500">{new Date(e.received_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    <span className="text-zinc-400">{e.normalized?.channel} · {e.normalized?.sender?.name || e.normalized?.sender?.id}</span>
                    {e.route_detail?.team_id && <span className="text-zinc-400">→ {teamName(e.route_detail.team_id)} ({String(e.route_detail.decided_by).replace('_', ' ')})</span>}
                    {['failed', 'ignored'].includes(e.status) && e.normalized?.type !== 'status' && (
                      <button onClick={() => replay(e.id)} className="ml-auto flex items-center gap-1 text-emerald-400 hover:text-emerald-300"><RotateCcw className="w-3 h-3" /> Replay</button>
                    )}
                  </div>
                  {e.normalized?.text && <p className="text-zinc-300 line-clamp-2 whitespace-pre-wrap">{e.normalized.text}</p>}
                  {e.error && <p className="text-rose-400">{e.error}</p>}
                  {e.reply_status && (
                    <p className={e.reply_status.sent ? 'text-emerald-400' : e.reply_status.error ? 'text-rose-400' : 'text-zinc-500'}>
                      {e.reply_status.sent ? `Reply delivered (${e.reply_status.channel})` : e.reply_status.error ? `Reply failed: ${e.reply_status.error}` : e.reply_status.skipped}
                    </p>
                  )}
                </div>
              ))}
            </section>
          )}
        </main>
      </div>
    </div>
  );
};
