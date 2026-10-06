'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, Trash2, AlertTriangle } from 'lucide-react';

type Provider = 'anthropic' | 'openai' | 'gemini' | 'elevenlabs' | 'xai';

const PROVIDERS: Array<{ id: Provider; label: string; hint: string; where: string; note?: string }> = [
  { id: 'anthropic', label: 'Anthropic', hint: 'sk-ant-…', where: 'console.anthropic.com → API Keys' },
  { id: 'openai', label: 'OpenAI', hint: 'sk-…', where: 'platform.openai.com → API keys', note: 'Also used for voice (paid).' },
  { id: 'gemini', label: 'Google Gemini', hint: 'AIza… or AQ.…', where: 'aistudio.google.com → Get API key', note: 'Also the free fallback for voice.' },
];

const VOICE_PROVIDERS: typeof PROVIDERS = [
  { id: 'elevenlabs', label: 'ElevenLabs', hint: 'sk_…', where: 'elevenlabs.io → Developers → API keys', note: 'Free monthly allowance; your cloned voices appear in voice profiles.' },
  { id: 'xai', label: 'Grok (xAI)', hint: 'xai-…', where: 'console.x.ai → API keys', note: 'Paid per use.' },
];

interface SecretMetadata {
  provider: string;
  updatedAt?: string;
}

/**
 * Bring-your-own LLM keys used by Agent Studio. Keys are verified with the provider
 * before they are stored (envelope-encrypted with KMS) and are never shown again.
 */
export const LlmKeysPanel: React.FC = () => {
  const [stored, setStored] = useState<SecretMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<Provider, string>>({ anthropic: '', openai: '', gemini: '', elevenlabs: '', xai: '' });
  const [busy, setBusy] = useState<Provider | null>(null);
  const [messages, setMessages] = useState<Partial<Record<Provider, { ok: boolean; text: string }>>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/secrets', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) setStored(data.secrets || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (provider: Provider) => {
    const value = drafts[provider].trim();
    if (!value) return;
    setBusy(provider);
    setMessages((m) => ({ ...m, [provider]: undefined }));
    try {
      const res = await fetch('/api/v1/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, secretValue: value, testFirst: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setDrafts((d) => ({ ...d, [provider]: '' }));
      setMessages((m) => ({ ...m, [provider]: { ok: true, text: 'Verified with the provider and stored encrypted.' } }));
      await load();
    } catch (err: any) {
      setMessages((m) => ({ ...m, [provider]: { ok: false, text: err?.message || 'Could not save key' } }));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (provider: Provider) => {
    if (!confirm(`Remove the stored ${provider} key? Agent Studio instances using it will stop working.`)) return;
    setBusy(provider);
    try {
      const res = await fetch(`/api/v1/secrets?provider=${provider}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not remove key');
      setMessages((m) => ({ ...m, [provider]: { ok: true, text: 'Removed.' } }));
      await load();
    } catch (err: any) {
      setMessages((m) => ({ ...m, [provider]: { ok: false, text: err?.message || 'Could not remove key' } }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-[#0d1017] border border-zinc-800 rounded-xl p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-emerald-400" /> LLM keys
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Agent Studio runs on your own provider keys. Each key is checked with the provider before it is saved, stored
          encrypted, and never shown again. Saving a new key replaces the old one.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </p>
      ) : (
        <div className="space-y-4">
          {[...PROVIDERS, ...VOICE_PROVIDERS].map((p, i) => {
            const meta = stored.find((s) => s.provider === p.id);
            const msg = messages[p.id];
            return (
              <React.Fragment key={p.id}>
              {i === PROVIDERS.length && <h3 className="pt-2 text-sm font-semibold text-zinc-300">Voice keys <span className="font-normal text-zinc-500">(optional; voice profiles fall back to Gemini, then the browser)</span></h3>}
              <div className="p-4 rounded-lg border border-zinc-800 bg-[#090b10] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">{p.label}</span>
                  {meta ? (
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Stored
                      {meta.updatedAt ? ` · ${new Date(meta.updatedAt).toLocaleDateString()}` : ''}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-500">Not set</span>
                  )}
                </div>
                <p className="text-xs text-zinc-500">Get one at {p.where}.{p.note ? ` ${p.note}` : ''}</p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={drafts[p.id]}
                    onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                    placeholder={meta ? `Replace key (${p.hint})` : p.hint}
                    autoComplete="off"
                    spellCheck={false}
                    className="flex-1 bg-black/40 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={() => save(p.id)}
                    disabled={busy !== null || !drafts[p.id].trim()}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
                  >
                    {busy === p.id && <Loader2 className="w-4 h-4 animate-spin" />}
                    {meta ? 'Verify & replace' : 'Verify & save'}
                  </button>
                  {meta && (
                    <button
                      onClick={() => remove(p.id)}
                      disabled={busy !== null}
                      className="p-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-rose-400 hover:border-rose-900 disabled:opacity-50"
                      title="Remove key"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {msg && (
                  <p className={`text-xs flex items-start gap-1.5 ${msg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />}
                    <span className="break-all">{msg.text}</span>
                  </p>
                )}
              </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};
