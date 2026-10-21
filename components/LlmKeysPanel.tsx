'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, KeyRound, Loader2, Plus, Trash2, Zap } from 'lucide-react';

interface OrgProvider {
  id: string;
  label: string;
  kind: string;
  baseUrl?: string;
  defaultModel: string;
  fastModel: string;
  builtIn: boolean;
  supportsTools: boolean;
  keyHint?: string;
  keyWhere?: string;
  configured: boolean;
  enabled: boolean;
  locked_by: Array<{ kind: string; id: string; name: string }>;
}
interface Preset {
  slug: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  fastModel: string;
  docs: string;
}
type Msg = { ok: boolean; text: string };

const NOTES: Record<string, string> = {
  openai: 'Also used for voice (paid).',
  gemini: 'Also the free fallback for voice.',
  xai: 'Also used for voice. Paid per use.',
};

const VOICE_PROVIDERS = [
  { id: 'elevenlabs', label: 'ElevenLabs', hint: 'sk_…', where: 'elevenlabs.io → Developers → API keys', note: 'Free monthly allowance; your cloned voices appear in voice profiles.' },
];

const inputCls = 'bg-black/40 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500';

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

/**
 * The organization's LLM providers: built-in ones and its own OpenAI-compatible providers.
 * Each has a key (checked before it is saved, stored encrypted, never shown again), an on/off
 * switch and a place in the organization's order. Agents in Automatic mode follow that order;
 * Preferred agents fall back to it; Locked agents only use their own provider.
 */
export const LlmKeysPanel: React.FC = () => {
  const [providers, setProviders] = useState<OrgProvider[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [voiceStored, setVoiceStored] = useState<Array<{ provider: string; updatedAt?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, Msg | undefined>>({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: '', slug: '', base_url: '', default_model: '', fast_model: '', api_key: '' });

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([api<{ providers: OrgProvider[]; presets: Preset[] }>('/api/v1/llm-providers'), api<{ secrets: any[] }>('/api/v1/secrets')]);
      setProviders(p.providers);
      setPresets(p.presets);
      setVoiceStored(s.secrets || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const say = (id: string, msg: Msg | undefined) => setMessages((m) => ({ ...m, [id]: msg }));

  const run = async (id: string, work: () => Promise<Msg | void>) => {
    setBusy(id);
    say(id, undefined);
    try {
      const msg = await work();
      if (msg) say(id, msg);
      await load();
    } catch (err: any) {
      say(id, { ok: false, text: err?.message || 'Something went wrong' });
    } finally {
      setBusy(null);
    }
  };

  const saveSettings = (next: OrgProvider[]) =>
    api('/api/v1/llm-providers', { method: 'PUT', body: JSON.stringify({ order: next.map((p) => p.id), disabled: next.filter((p) => !p.enabled).map((p) => p.id) }) });

  const move = (i: number, dir: -1 | 1) => {
    const next = [...providers];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setProviders(next);
    run('order', () => saveSettings(next).then(() => undefined));
  };

  const toggle = (p: OrgProvider) => {
    if (p.enabled && p.locked_by.length) {
      const names = p.locked_by.map((a) => a.name).join(', ');
      if (!confirm(`These agents are locked to ${p.label} and will fail while it is off: ${names}. Turn it off anyway?`)) return;
    }
    const next = providers.map((x) => (x.id === p.id ? { ...x, enabled: !x.enabled } : x));
    setProviders(next);
    run(p.id, () => saveSettings(next).then(() => ({ ok: true, text: p.enabled ? `${p.label} is off: agents skip it.` : `${p.label} is on.` })));
  };

  const saveKey = (p: OrgProvider) => {
    const value = (drafts[p.id] || '').trim();
    if (!value) return;
    run(p.id, async () => {
      if (p.builtIn) await api('/api/v1/secrets', { method: 'POST', body: JSON.stringify({ provider: p.id, secretValue: value, testFirst: true }) });
      else await api(`/api/v1/llm-providers/${p.id}`, { method: 'PATCH', body: JSON.stringify({ api_key: value }) });
      setDrafts((d) => ({ ...d, [p.id]: '' }));
      return { ok: true, text: 'Verified with the provider and stored encrypted.' };
    });
  };

  const removeProvider = (p: OrgProvider) => {
    if (p.builtIn) {
      if (!confirm(`Remove the stored ${p.label} key? Agents using ${p.label} switch to other providers, or fail if locked to it.`)) return;
      run(p.id, () => api(`/api/v1/secrets?provider=${p.id}`, { method: 'DELETE' }).then(() => ({ ok: true, text: 'Key removed.' })));
    } else {
      if (!confirm(`Remove ${p.label} and its key?`)) return;
      run(p.id, () => api(`/api/v1/llm-providers/${p.id}`, { method: 'DELETE' }).then(() => undefined));
    }
  };

  const test = (p: OrgProvider) =>
    run(p.id, async () => {
      const r = await api<{ ok: boolean; tools: boolean; message: string }>(`/api/v1/llm-providers/${p.id}/test`, { method: 'POST', body: '{}' });
      return { ok: r.ok, text: r.message };
    });

  const usePreset = (slug: string) => {
    const preset = presets.find((x) => x.slug === slug);
    if (preset) setForm((f) => ({ ...f, label: preset.label, slug: preset.slug, base_url: preset.baseUrl, default_model: preset.defaultModel, fast_model: preset.fastModel }));
  };

  const addProvider = () =>
    run('new', async () => {
      const res = await api<{ check: { message: string } }>('/api/v1/llm-providers', {
        method: 'POST',
        body: JSON.stringify({ ...form, slug: form.slug || form.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), fast_model: form.fast_model || null }),
      });
      setForm({ label: '', slug: '', base_url: '', default_model: '', fast_model: '', api_key: '' });
      setAdding(false);
      return { ok: true, text: `Added. ${res.check.message}` };
    });

  const saveVoiceKey = (id: string) => {
    const value = (drafts[id] || '').trim();
    if (!value) return;
    run(id, async () => {
      await api('/api/v1/secrets', { method: 'POST', body: JSON.stringify({ provider: id, secretValue: value, testFirst: true }) });
      setDrafts((d) => ({ ...d, [id]: '' }));
      return { ok: true, text: 'Verified with the provider and stored encrypted.' };
    });
  };

  const MsgLine = ({ id }: { id: string }) => {
    const msg = messages[id];
    if (!msg) return null;
    return (
      <p className={`text-xs flex items-start gap-1.5 ${msg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
        {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
        <span className="break-words">{msg.text}</span>
      </p>
    );
  };

  return (
    <div className="bg-[#0d1017] border border-zinc-800 rounded-xl p-4 sm:p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-emerald-400" /> LLM providers
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Your agents run on your own keys. The order below is your organization&apos;s preference: agents set to Automatic use the first
          provider that is on and has a key, and switch to the next one when a provider is out of quota, overloaded or too slow. Agents
          locked to a provider only use that one. Keys are checked before they are saved, stored encrypted and never shown again.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </p>
      ) : (
        <div className="space-y-3">
          {providers.map((p, i) => (
            <div key={p.id} className={`p-3 sm:p-4 rounded-lg border bg-[#090b10] space-y-2 ${p.enabled ? 'border-zinc-800' : 'border-zinc-900 opacity-70'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-zinc-500 w-5 text-right">{i + 1}.</span>
                  <span className="text-sm font-semibold text-white truncate">{p.label}</span>
                  {!p.builtIn && <span className="text-[10px] px-1.5 py-0.5 rounded border border-sky-800 text-sky-300">your provider</span>}
                  {p.configured ? (
                    <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Key stored</span>
                  ) : (
                    <span className="text-xs text-zinc-500">No key</span>
                  )}
                  {p.locked_by.length > 0 && <span className="text-[10px] text-amber-300" title={p.locked_by.map((a) => a.name).join(', ')}>🔒 {p.locked_by.length} locked</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => move(i, -1)} disabled={i === 0 || busy !== null} className="p-1.5 rounded border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30" title="Move up"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === providers.length - 1 || busy !== null} className="p-1.5 rounded border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30" title="Move down"><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button
                    onClick={() => toggle(p)}
                    disabled={busy !== null}
                    className={`ml-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${p.enabled ? 'bg-emerald-950/50 border-emerald-700 text-emerald-300' : 'border-zinc-700 text-zinc-500'}`}
                    title={p.enabled ? 'On: agents may use it. Click to turn off.' : 'Off: agents skip it. Click to turn on.'}
                  >
                    {p.enabled ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
              <p className="text-xs text-zinc-500">
                {p.builtIn ? `Get one at ${p.keyWhere}.` : `${p.baseUrl}`} Default model <code className="text-zinc-300">{p.defaultModel}</code>
                {p.fastModel && p.fastModel !== p.defaultModel ? <>, calls use <code className="text-zinc-300">{p.fastModel}</code></> : null}.
                {NOTES[p.id] ? ` ${NOTES[p.id]}` : ''}
                {!p.builtIn && !p.supportsTools ? ' This model did not use tools in its check.' : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="password"
                  value={drafts[p.id] || ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                  placeholder={p.configured ? `Replace key${p.keyHint ? ` (${p.keyHint})` : ''}` : p.keyHint || 'API key'}
                  autoComplete="off"
                  spellCheck={false}
                  className={`flex-1 min-w-[180px] font-mono ${inputCls}`}
                />
                <button onClick={() => saveKey(p)} disabled={busy !== null || !(drafts[p.id] || '').trim()} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
                  {busy === p.id && <Loader2 className="w-4 h-4 animate-spin" />}
                  {p.configured ? 'Verify & replace' : 'Verify & save'}
                </button>
                {p.configured && (
                  <button onClick={() => test(p)} disabled={busy !== null} className="px-3 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white text-sm flex items-center gap-1.5 disabled:opacity-50" title="Send a small request with a tool">
                    <Zap className="w-3.5 h-3.5" /> Test
                  </button>
                )}
                {(p.configured || !p.builtIn) && (
                  <button onClick={() => removeProvider(p)} disabled={busy !== null} className="p-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-rose-400 hover:border-rose-900 disabled:opacity-50" title={p.builtIn ? 'Remove key' : 'Remove provider'}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <MsgLine id={p.id} />
            </div>
          ))}
          <MsgLine id="order" />

          {!adding ? (
            <button onClick={() => setAdding(true)} className="w-full p-3 rounded-lg border border-dashed border-zinc-700 text-sm text-zinc-300 hover:text-white hover:border-zinc-500 flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> Add your own provider (OpenAI-compatible: DeepSeek, Mistral, Groq, OpenRouter, …)
            </button>
          ) : (
            <div className="p-4 rounded-lg border border-sky-900 bg-sky-950/10 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">Add a provider</h3>
                <select className={inputCls} defaultValue="" onChange={(e) => usePreset(e.target.value)}>
                  <option value="">Start from…</option>
                  {presets.map((p) => <option key={p.slug} value={p.slug}>{p.label}</option>)}
                </select>
              </div>
              <p className="text-xs text-zinc-400">Any provider with an OpenAI-compatible Chat Completions API. We send a small request with a tool before saving, to check it answers and can use tools.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Name (e.g. DeepSeek)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
                <input className={`${inputCls} font-mono`} placeholder="id (e.g. deepseek)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} />
                <input className={`${inputCls} font-mono sm:col-span-2`} placeholder="Base URL (https://…, before /chat/completions)" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} />
                <input className={`${inputCls} font-mono`} placeholder="Default model" value={form.default_model} onChange={(e) => setForm({ ...form, default_model: e.target.value })} />
                <input className={`${inputCls} font-mono`} placeholder="Fast model for calls (optional)" value={form.fast_model} onChange={(e) => setForm({ ...form, fast_model: e.target.value })} />
                <input className={`${inputCls} font-mono sm:col-span-2`} type="password" autoComplete="off" placeholder="API key" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <button onClick={addProvider} disabled={busy !== null || !form.label || !form.base_url || !form.default_model || !form.api_key} className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
                  {busy === 'new' && <Loader2 className="w-4 h-4 animate-spin" />} Check & add
                </button>
                <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 text-sm">Cancel</button>
              </div>
            </div>
          )}
          <MsgLine id="new" />

          <h3 className="pt-3 text-sm font-semibold text-zinc-300">Voice keys <span className="font-normal text-zinc-500">(optional; voice profiles fall back to Gemini, then the browser)</span></h3>
          {VOICE_PROVIDERS.map((v) => {
            const meta = voiceStored.find((s) => s.provider === v.id);
            return (
              <div key={v.id} className="p-4 rounded-lg border border-zinc-800 bg-[#090b10] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">{v.label}</span>
                  {meta ? <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Stored</span> : <span className="text-xs text-zinc-500">Not set</span>}
                </div>
                <p className="text-xs text-zinc-500">Get one at {v.where}. {v.note}</p>
                <div className="flex gap-2">
                  <input type="password" value={drafts[v.id] || ''} onChange={(e) => setDrafts((d) => ({ ...d, [v.id]: e.target.value }))} placeholder={meta ? `Replace key (${v.hint})` : v.hint} autoComplete="off" spellCheck={false} className={`flex-1 font-mono ${inputCls}`} />
                  <button onClick={() => saveVoiceKey(v.id)} disabled={busy !== null || !(drafts[v.id] || '').trim()} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50">
                    {meta ? 'Verify & replace' : 'Verify & save'}
                  </button>
                </div>
                <MsgLine id={v.id} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
