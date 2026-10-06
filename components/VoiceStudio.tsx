'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, Mic, Play, Plus, Save, Trash2, Volume2, X } from 'lucide-react';
import {
  DEFAULT_REPLY_STYLE,
  DEFAULT_VOICE,
  VOICE_PROVIDERS,
  VOICE_PROVIDER_LABEL,
  voiceProfileSchema,
  type VoiceProfile,
  type VoiceProfileInput,
  type VoiceProviderId,
} from '@/lib/voice/profile-spec';
import { VoiceTalkButton } from '@/components/voice/VoiceTalkButton';
import { useVoice } from '@/components/voice/useVoice';
import { LlmKeysPanel } from '@/components/LlmKeysPanel';

/**
 * Voice page: voice profiles (who listens, which voice speaks, how spoken replies are
 * styled), the organization's voice keys, and a round-trip test with the microphone.
 */

interface VoiceInfo {
  id: string;
  name: string;
  description?: string;
  previewUrl?: string | null;
  custom?: boolean;
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

const PROVIDER_NOTES: Record<VoiceProviderId, string> = {
  gemini: 'Free tier with your Gemini key. 30 voices; describe the style in words.',
  elevenlabs: 'Free monthly allowance. Best voices; your cloned voices show up here.',
  openai: 'Paid. Natural voices; style via instructions.',
  xai: 'Paid. Grok voices (Eve, Ara, Leo, Rex, Sal).',
  browser: 'Free, built into the browser. Robotic voices; recognition works best in Chrome.',
};

const SAMPLE = 'Hi! This is how I will sound when your team answers out loud.';

function emptyDraft(): VoiceProfileInput {
  let language = 'en';
  try {
    language = navigator.language || 'en';
  } catch {
    /* server render */
  }
  return {
    name: '',
    language,
    stt: { provider: 'gemini', model: null },
    tts: { provider: 'gemini', voice_id: 'Kore', voice_name: 'Kore', model: null, speed: 1, style: '' },
    fallback: true,
    daily_caps: {},
    reply_style: '',
  };
}

function toDraft(p: VoiceProfile): VoiceProfileInput {
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = p;
  return { ...rest, reply_style: rest.reply_style ?? '' };
}

export const VoiceStudio: React.FC = () => {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [keys, setKeys] = useState<Record<VoiceProviderId, boolean>>({ gemini: false, elevenlabs: false, openai: false, xai: false, browser: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<VoiceProfileInput>(emptyDraft);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [testLog, setTestLog] = useState<Array<{ heard: string; stt: string; ms: number }>>([]);

  const load = useCallback(async (prefer?: string | null) => {
    const data = await api<{ profiles: VoiceProfile[]; providers: Record<VoiceProviderId, boolean> }>('/api/v1/voice/profiles');
    setProfiles(data.profiles);
    setKeys(data.providers);
    const pick = data.profiles.find((p) => p.id === prefer) ?? (prefer === null ? null : data.profiles[0]);
    setSelectedId(pick?.id ?? null);
    setDraft(pick ? toDraft(pick) : emptyDraft());
  }, []);

  useEffect(() => {
    load()
      .catch((err) => setNotice({ ok: false, text: err?.message || 'Could not load voice profiles' }))
      .finally(() => setLoading(false));
  }, [load]);

  // Voices for the chosen speaking provider.
  const ttsProvider = draft.tts.provider;
  useEffect(() => {
    setVoices([]);
    setVoicesError(null);
    if (ttsProvider === 'browser') return;
    api<{ voices: VoiceInfo[] }>(`/api/v1/voice/voices?provider=${ttsProvider}`)
      .then((r) => setVoices(r.voices))
      .catch((err) => setVoicesError(err?.message || 'Could not load voices'));
  }, [ttsProvider, keys]);

  const testTarget = useMemo(
    () => ({ profile: { language: draft.language, stt: draft.stt, tts: draft.tts, fallback: draft.fallback, daily_caps: draft.daily_caps } }),
    [draft]
  );
  const sampler = useVoice(testTarget);

  const setTts = (patch: Partial<VoiceProfileInput['tts']>) => setDraft((d) => ({ ...d, tts: { ...d.tts, ...patch } }));
  const setCap = (provider: VoiceProviderId, field: 'stt_seconds' | 'tts_chars', value: string) =>
    setDraft((d) => {
      const caps = { ...d.daily_caps };
      const entry = { ...(caps[provider] || {}) };
      if (value === '') delete entry[field];
      else entry[field] = Math.max(0, Math.round(Number(value) || 0));
      if (Object.keys(entry).length) caps[provider] = entry;
      else delete caps[provider];
      return { ...d, daily_caps: caps };
    });

  const validation = voiceProfileSchema.safeParse({ ...draft, reply_style: draft.reply_style?.trim() || null });

  const save = async () => {
    if (!validation.success) {
      setNotice({ ok: false, text: validation.error.issues.map((i) => `${i.path.join('.') || 'profile'}: ${i.message}`).join('; ') });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const { profile } = selectedId
        ? await api<{ profile: VoiceProfile }>(`/api/v1/voice/profiles/${selectedId}`, { method: 'PATCH', body: JSON.stringify(validation.data) })
        : await api<{ profile: VoiceProfile }>('/api/v1/voice/profiles', { method: 'POST', body: JSON.stringify(validation.data) });
      await load(profile.id);
      setNotice({ ok: true, text: 'Saved. Pick it in Team Builder (step 4) or in an Agent Studio instance.' });
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'Could not save' });
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!selectedId || !confirm(`Delete "${draft.name}"? Teams and instances using it go back to the platform default.`)) return;
    try {
      await api(`/api/v1/voice/profiles/${selectedId}`, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || 'Could not delete' });
    }
  };

  const playSample = async (voice?: VoiceInfo) => {
    if (voice?.previewUrl) {
      void new Audio(voice.previewUrl).play();
      return;
    }
    const provider = await sampler.speak(SAMPLE);
    if (provider && provider !== draft.tts.provider) {
      setNotice({ ok: false, text: `${VOICE_PROVIDER_LABEL[draft.tts.provider]} was not available, so ${VOICE_PROVIDER_LABEL[provider as VoiceProviderId] ?? provider} spoke instead.` });
    }
  };

  const missingKey = (p: VoiceProviderId) => p !== 'browser' && !keys[p];
  const usedProviders = [...new Set([draft.stt.provider, draft.tts.provider, ...(draft.fallback ? (['gemini'] as VoiceProviderId[]) : [])])].filter(
    (p) => p !== 'browser'
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-zinc-400 gap-2 bg-[#090b10]">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading voice…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#090b10] text-zinc-100">
      <header className="px-6 py-4 border-b border-zinc-800 bg-[#0d1017] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-rose-950/70 border border-rose-800/80 flex items-center justify-center text-rose-300">
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">Voice</h1>
            <p className="text-xs text-zinc-400">Talk to your agents and teams: speech to text, the normal agent run, then the reply read aloud.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {(['gemini', 'elevenlabs', 'openai', 'xai'] as const).map((p) => (
            <span key={p} className={`px-2 py-1 rounded-md border ${keys[p] ? 'border-emerald-800 text-emerald-300 bg-emerald-950/30' : 'border-zinc-800 text-zinc-500'}`}>
              {keys[p] ? <CheckCircle2 className="inline w-3 h-3 mr-1" /> : null}
              {VOICE_PROVIDER_LABEL[p]}
              {keys[p] ? '' : ': no key'}
            </span>
          ))}
          <button onClick={() => setShowKeys((v) => !v)} className="flex items-center gap-1 px-2 py-1 rounded-md border border-zinc-700 text-zinc-300 hover:text-white">
            <KeyRound className="w-3 h-3" /> {showKeys ? 'Hide keys' : 'Manage keys'}
          </button>
        </div>
      </header>

      {showKeys && (
        <div className="p-6 pb-0">
          <LlmKeysPanel />
          <button onClick={() => load(selectedId).catch(() => undefined)} className="mt-2 text-xs text-emerald-400 hover:text-emerald-300">Refresh key status</button>
        </div>
      )}

      <div className="p-6 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        {/* Profiles */}
        <aside className="space-y-2">
          <button
            onClick={() => {
              setSelectedId(null);
              setDraft(emptyDraft());
              setNotice(null);
            }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> New voice profile
          </button>
          {profiles.length === 0 && (
            <p className="text-xs text-zinc-500 p-2">
              No profiles yet. Without one, agents use the platform default: Gemini (your key, free tier) and then the browser.
            </p>
          )}
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setSelectedId(p.id);
                setDraft(toDraft(p));
                setNotice(null);
              }}
              className={`w-full text-left p-3 rounded-lg border text-xs ${selectedId === p.id ? 'border-emerald-600 bg-emerald-950/20' : 'border-zinc-800 bg-[#0d1017] hover:border-zinc-600'}`}
            >
              <div className="text-sm text-white">{p.name}</div>
              <div className="text-zinc-500 mt-0.5">
                hears with {VOICE_PROVIDER_LABEL[p.stt.provider]} · speaks with {VOICE_PROVIDER_LABEL[p.tts.provider]}
                {p.tts.voice_name || p.tts.voice_id ? ` (${p.tts.voice_name || p.tts.voice_id})` : ''}
              </div>
            </button>
          ))}
        </aside>

        {/* Editor */}
        <main className="space-y-5 max-w-3xl">
          {notice && (
            <div className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${notice.ok ? 'border-emerald-900 bg-emerald-950/30 text-emerald-300' : 'border-rose-900 bg-rose-950/30 text-rose-300'}`}>
              {notice.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />}
              <span className="flex-1">{notice.text}</span>
              <button onClick={() => setNotice(null)}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Name</label>
              <input className={inputCls} value={draft.name} placeholder="e.g. Support voice" onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Language</label>
              <input className={inputCls} value={draft.language} placeholder="en, es-MX…" onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value }))} />
            </div>
          </div>

          <section className="p-4 rounded-xl border border-zinc-800 bg-[#0d1017] space-y-3">
            <h2 className="text-sm font-semibold text-white">Listening (speech to text)</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {VOICE_PROVIDERS.map((p) => (
                <button
                  key={p}
                  onClick={() => setDraft((d) => ({ ...d, stt: { provider: p, model: null } }))}
                  className={`p-2 rounded-lg border text-xs text-left ${draft.stt.provider === p ? 'border-emerald-600 bg-emerald-950/30 text-white' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}
                >
                  {VOICE_PROVIDER_LABEL[p]}
                  {missingKey(p) && <span className="block text-[10px] text-amber-400">no key</span>}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-zinc-500">{PROVIDER_NOTES[draft.stt.provider]}</p>
          </section>

          <section className="p-4 rounded-xl border border-zinc-800 bg-[#0d1017] space-y-3">
            <h2 className="text-sm font-semibold text-white">Speaking (text to speech)</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {VOICE_PROVIDERS.map((p) => (
                <button
                  key={p}
                  onClick={() => setTts({ provider: p, voice_id: DEFAULT_VOICE[p] ?? null, voice_name: DEFAULT_VOICE[p] ?? null, model: null })}
                  className={`p-2 rounded-lg border text-xs text-left ${draft.tts.provider === p ? 'border-emerald-600 bg-emerald-950/30 text-white' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}
                >
                  {VOICE_PROVIDER_LABEL[p]}
                  {missingKey(p) && <span className="block text-[10px] text-amber-400">no key</span>}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-zinc-500">{PROVIDER_NOTES[draft.tts.provider]}</p>

            {draft.tts.provider !== 'browser' && (
              <div>
                <label className={labelCls}>Voice</label>
                {voicesError && <p className="text-xs text-rose-400 mb-1">{voicesError}</p>}
                {draft.tts.provider === 'elevenlabs' && !keys.elevenlabs && <p className="text-xs text-amber-400 mb-1">Add an ElevenLabs key to list its voices.</p>}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-56 overflow-y-auto pr-1">
                  {voices.map((v) => (
                    <div
                      key={v.id}
                      className={`flex items-center justify-between gap-1 p-2 rounded-lg border text-xs cursor-pointer ${draft.tts.voice_id === v.id ? 'border-emerald-600 bg-emerald-950/30' : 'border-zinc-800 hover:border-zinc-600'}`}
                      onClick={() => setTts({ voice_id: v.id, voice_name: v.name })}
                    >
                      <span className="min-w-0">
                        <span className="block text-zinc-100 truncate">
                          {v.name}
                          {v.custom && <span className="ml-1 text-[9px] text-violet-300">custom</span>}
                        </span>
                        {v.description && <span className="block text-[10px] text-zinc-500 truncate">{v.description}</span>}
                      </span>
                      {v.previewUrl && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void playSample(v);
                          }}
                          className="text-zinc-500 hover:text-emerald-400"
                          title="Preview"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Speed ({(draft.tts.speed ?? 1).toFixed(2)}×)</label>
                <input type="range" min={0.7} max={1.3} step={0.05} value={draft.tts.speed ?? 1} onChange={(e) => setTts({ speed: Number(e.target.value) })} className="w-full" />
              </div>
              <div>
                <label className={labelCls}>Style {draft.tts.provider === 'elevenlabs' || draft.tts.provider === 'xai' ? '(not supported by this provider)' : ''}</label>
                <input
                  className={inputCls}
                  value={draft.tts.style ?? ''}
                  placeholder="e.g. Warm and calm, like a helpful receptionist"
                  onChange={(e) => setTts({ style: e.target.value })}
                />
              </div>
            </div>
            <button onClick={() => playSample()} disabled={sampler.phase === 'speaking'} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-200 hover:text-white disabled:opacity-50">
              {sampler.phase === 'speaking' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />} Play sample
              {sampler.lastSpeaker && <span className="text-zinc-500">· last spoken by {VOICE_PROVIDER_LABEL[sampler.lastSpeaker as VoiceProviderId] ?? sampler.lastSpeaker}</span>}
            </button>
            {sampler.error && <p className="text-xs text-rose-400">{sampler.error}</p>}
          </section>

          <section className="p-4 rounded-xl border border-zinc-800 bg-[#0d1017] space-y-3">
            <h2 className="text-sm font-semibold text-white">Spoken replies</h2>
            <textarea
              className={`${inputCls} min-h-[70px]`}
              value={draft.reply_style ?? ''}
              placeholder={DEFAULT_REPLY_STYLE}
              onChange={(e) => setDraft((d) => ({ ...d, reply_style: e.target.value }))}
            />
            <p className="text-[11px] text-zinc-500">Added to the agent&apos;s instructions only on voice turns. Leave empty for the default shown above.</p>
          </section>

          <section className="p-4 rounded-xl border border-zinc-800 bg-[#0d1017] space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Fallback and free-tier limits</h2>
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input type="checkbox" checked={draft.fallback} onChange={(e) => setDraft((d) => ({ ...d, fallback: e.target.checked }))} />
                Fall back to Gemini, then the browser
              </label>
            </div>
            <p className="text-[11px] text-zinc-500">
              When a provider has no key, rejects the key, is over quota, times out, or reaches a daily limit below, the next one takes over.
            </p>
            {usedProviders.length > 0 && (
              <div className="space-y-2">
                {usedProviders.map((p) => (
                  <div key={p} className="grid grid-cols-[110px_1fr_1fr] items-center gap-2 text-xs">
                    <span className="text-zinc-300">{VOICE_PROVIDER_LABEL[p]}</span>
                    <input
                      type="number"
                      min={0}
                      className={inputCls}
                      placeholder="listening sec/day (no limit)"
                      value={draft.daily_caps[p]?.stt_seconds ?? ''}
                      onChange={(e) => setCap(p, 'stt_seconds', e.target.value)}
                    />
                    <input
                      type="number"
                      min={0}
                      className={inputCls}
                      placeholder="spoken chars/day (no limit)"
                      value={draft.daily_caps[p]?.tts_chars ?? ''}
                      onChange={(e) => setCap(p, 'tts_chars', e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="p-4 rounded-xl border border-zinc-800 bg-[#0d1017] space-y-3">
            <h2 className="text-sm font-semibold text-white">Test the round trip</h2>
            <p className="text-[11px] text-zinc-500">Tap, say something, pause. It is transcribed with this profile and read back to you (no agent involved).</p>
            <VoiceTalkButton
              target={testTarget}
              onHeard={async (heard) => {
                setTestLog((l) => [{ heard: heard.text, stt: heard.provider, ms: heard.latencyMs }, ...l].slice(0, 5));
                return `You said: ${heard.text}`;
              }}
              onError={(m) => setNotice({ ok: false, text: m })}
            />
            {testLog.map((t, i) => (
              <div key={i} className="text-xs text-zinc-300 border-l-2 border-zinc-700 pl-2">
                “{t.heard}” <span className="text-zinc-500">· heard by {VOICE_PROVIDER_LABEL[t.stt as VoiceProviderId] ?? t.stt}{t.ms ? ` in ${(t.ms / 1000).toFixed(1)} s` : ''}</span>
              </div>
            ))}
          </section>

          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {selectedId ? 'Save changes' : 'Create profile'}
            </button>
            {selectedId && (
              <button onClick={archive} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-400 hover:text-rose-400">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
