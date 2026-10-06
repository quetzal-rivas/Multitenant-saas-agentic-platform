'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Code2,
  Plus,
  Sparkles,
  Rocket,
  Play,
  Save,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  X,
  Wand2,
  History,
  Settings2,
  Braces,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types (mirror /api/v1/functions)
// ---------------------------------------------------------------------------

type Language = 'python' | 'typescript';
type Status = 'draft' | 'deploying' | 'deployed' | 'failed';

interface Fn {
  id: string;
  name: string;
  function_slug: string;
  description: string | null;
  language: Language;
  code: string;
  input_schema: Record<string, any>;
  status: Status;
  lambda_name: string | null;
  deployed_at: string | null;
  last_error: string | null;
  timeout_seconds: number;
  memory_mb: number;
  secret_names: string[];
  needs_deploy: boolean;
}

interface Invocation {
  id: string;
  caller: string;
  source: 'test' | 'agent' | 'mcp';
  status: 'ok' | 'error' | 'timeout';
  duration_ms: number | null;
  error: string | null;
  created_at: string;
}

interface TestResult {
  status: 'ok' | 'error' | 'timeout';
  output: unknown;
  error: string | null;
  logs: string;
  duration_ms: number;
}

interface Draft {
  name: string;
  description: string;
  language: Language;
  code: string;
  input_schema: Record<string, any>;
  explanation: string;
  tool_name: string;
}

const TEMPLATES: Record<Language, string> = {
  python: `def main(input: dict) -> dict:
    """Receives the tool input as a dict and returns a JSON-serializable dict."""
    name = input.get("name", "world")
    return {"greeting": f"Hello, {name}!"}
`,
  typescript: `export default async function main(input: { name?: string }) {
  // Receives the tool input and returns any JSON-serializable value.
  return { greeting: \`Hello, \${input.name ?? 'world'}!\` };
}
`,
};
const DEFAULT_SCHEMA = { type: 'object', properties: { name: { type: 'string', description: 'Who to greet' } } };
const CONTRACT: Record<Language, string> = {
  python: 'Python 3.12 · define main(input: dict) -> dict · standard library only · secrets in os.environ',
  typescript: 'TypeScript on Node.js 22 · export default async function main(input) · global fetch · secrets in process.env',
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, cache: 'no-store' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issues = Array.isArray(body?.issues) ? ` (${body.issues.map((i: any) => `${i.path}: ${i.message}`).join('; ')})` : '';
    throw new Error((body?.error || `Request failed (${res.status})`) + issues);
  }
  return body as T;
}

/** Sample input from a JSON schema, to prefill the test box. */
function sampleInput(schema: Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries((schema?.properties || {}) as Record<string, any>)) {
    if (prop?.enum?.length) out[key] = prop.enum[0];
    else if (prop?.type === 'number' || prop?.type === 'integer') out[key] = 1;
    else if (prop?.type === 'boolean') out[key] = true;
    else if (prop?.type === 'array') out[key] = [];
    else if (prop?.type === 'object') out[key] = {};
    else out[key] = 'example';
  }
  return out;
}

function statusBadge(fn: Fn) {
  if (fn.status === 'deploying') return { label: 'Deploying', cls: 'text-sky-300 border-sky-800 bg-sky-950/40' };
  if (fn.status === 'failed') return { label: 'Deploy failed', cls: 'text-rose-300 border-rose-800 bg-rose-950/40' };
  if (fn.status === 'deployed' && fn.needs_deploy) return { label: 'Changed since deploy', cls: 'text-amber-300 border-amber-800 bg-amber-950/40' };
  if (fn.status === 'deployed') return { label: 'Deployed', cls: 'text-emerald-300 border-emerald-800 bg-emerald-950/40' };
  return { label: 'Draft', cls: 'text-zinc-400 border-zinc-700 bg-zinc-900' };
}

const inputCls = 'w-full bg-[#090b0f] border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500';
const codeCls = 'w-full bg-[#06080b] border border-zinc-800 rounded-lg p-3 font-mono text-xs text-zinc-100 leading-relaxed focus:outline-none focus:border-emerald-600 resize-y';

// ---------------------------------------------------------------------------

export function FunctionStudio() {
  const [functions, setFunctions] = useState<Fn[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<null | 'choose' | 'ai' | 'blank'>(null);

  const load = useCallback(async (selectId?: string) => {
    try {
      const { functions: list } = await api<{ functions: Fn[] }>('/api/v1/functions');
      setFunctions(list);
      setSelectedId((cur) => selectId ?? (cur && list.some((f) => f.id === cur) ? cur : list[0]?.id ?? null));
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Could not load functions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = functions.find((f) => f.id === selectedId) ?? null;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-zinc-400 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading functions…
      </div>
    );
  }

  return (
    <div className="h-full flex bg-[#090b10] text-zinc-100 overflow-hidden">
      <aside className="w-64 shrink-0 border-r border-zinc-800 bg-[#0d1017] flex flex-col">
        <div className="px-4 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-white flex items-center gap-1.5"><Code2 className="w-4 h-4 text-emerald-400" /> AI Function Studio</h1>
            <p className="text-[11px] text-zinc-500 mt-0.5">Your code as tools for agents</p>
          </div>
          <button onClick={() => setCreating('choose')} className="p-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white" title="New function">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {functions.length === 0 && <p className="text-xs text-zinc-500 p-3">No functions yet.</p>}
          {functions.map((fn) => {
            const badge = statusBadge(fn);
            return (
              <button
                key={fn.id}
                onClick={() => setSelectedId(fn.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border ${fn.id === selectedId ? 'bg-zinc-800/70 border-zinc-600' : 'border-transparent hover:bg-zinc-900'}`}
              >
                <div className="text-sm text-white truncate">{fn.name}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] text-zinc-500">{fn.language === 'python' ? 'Python' : 'TypeScript'}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">
        {error && (
          <div className="m-6 p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </div>
        )}
        {selected ? (
          <Editor key={selected.id} fn={selected} onChanged={(id) => load(id)} onArchived={() => load()} />
        ) : (
          <div className="h-full flex items-center justify-center p-6">
            <div className="max-w-md text-center space-y-3">
              <Code2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <h2 className="text-lg font-semibold text-white">Write a function, give it to your agents</h2>
              <p className="text-sm text-zinc-400">
                Each function runs in its own isolated AWS Lambda. Describe what you need and AI drafts it, or start blank.
                Then add it to an MCP profile and every instance or team using that profile can call it as a tool.
              </p>
              <button onClick={() => setCreating('choose')} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">
                Create your first function
              </button>
            </div>
          </div>
        )}
      </main>

      {creating && (
        <NewFunctionModal
          mode={creating}
          setMode={setCreating}
          onCreated={(id) => {
            setCreating(null);
            load(id);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New function: AI draft or blank
// ---------------------------------------------------------------------------

const NewFunctionModal: React.FC<{
  mode: 'choose' | 'ai' | 'blank';
  setMode: (m: null | 'choose' | 'ai' | 'blank') => void;
  onCreated: (id: string) => void;
}> = ({ mode, setMode, onCreated }) => {
  const [language, setLanguage] = useState<Language>('python');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [providers, setProviders] = useState<Array<{ id: string; configured: boolean }>>([]);
  const [provider, setProvider] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'ai') return;
    api<{ providers: Array<{ id: string; configured: boolean }> }>('/api/v1/llm-providers')
      .then(({ providers: list }) => {
        const ready = list.filter((p) => p.configured);
        setProviders(ready);
        setProvider(ready.find((p) => p.id === 'gemini')?.id ?? ready[0]?.id ?? '');
      })
      .catch(() => setProviders([]));
  }, [mode]);

  const create = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const { function: fn } = await api<{ function: Fn }>('/api/v1/functions', { method: 'POST', body: JSON.stringify(body) });
      onCreated(fn.id);
    } catch (err: any) {
      setError(err?.message || 'Could not create the function');
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    setBusy(true);
    setError(null);
    setDraft(null);
    try {
      const res = await api<{ draft: Draft }>('/api/v1/functions/draft', {
        method: 'POST',
        body: JSON.stringify({ description, language, ...(provider ? { provider } : {}) }),
      });
      setDraft(res.draft);
    } catch (err: any) {
      setError(err?.message || 'The draft failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0e131e] border border-zinc-700 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">New function</h3>
          <button onClick={() => setMode(null)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {mode === 'choose' && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setMode('ai')} className="p-4 rounded-xl border border-emerald-800 bg-emerald-950/20 text-left hover:border-emerald-600">
              <Sparkles className="w-5 h-5 text-emerald-400 mb-2" />
              <div className="text-sm font-semibold text-white">Describe it (AI)</div>
              <div className="text-xs text-zinc-400 mt-1">Your LLM key drafts the code and input schema. You review before saving.</div>
            </button>
            <button onClick={() => setMode('blank')} className="p-4 rounded-xl border border-zinc-700 text-left hover:border-zinc-500">
              <Code2 className="w-5 h-5 text-zinc-300 mb-2" />
              <div className="text-sm font-semibold text-white">Blank</div>
              <div className="text-xs text-zinc-400 mt-1">Start from a small template.</div>
            </button>
          </div>
        )}

        {mode !== 'choose' && (
          <div className="flex gap-2">
            {(['python', 'typescript'] as const).map((l) => (
              <button key={l} onClick={() => setLanguage(l)} className={`px-3 py-1.5 rounded-lg text-xs border ${language === l ? 'bg-zinc-800 border-zinc-500 text-white' : 'border-zinc-800 text-zinc-400'}`}>
                {l === 'python' ? 'Python' : 'TypeScript'}
              </button>
            ))}
          </div>
        )}

        {mode === 'blank' && (
          <>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Convert temperature" autoFocus />
            <div className="flex justify-end">
              <button
                disabled={busy || !name.trim()}
                onClick={() => create({ name: name.trim(), language, code: TEMPLATES[language], input_schema: DEFAULT_SCHEMA, description: '' })}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50"
              >
                {busy ? 'Creating…' : 'Create'}
              </button>
            </div>
          </>
        )}

        {mode === 'ai' && (
          <>
            <textarea
              className={`${inputCls} min-h-[110px]`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What should it do? e.g. Convert a temperature between Celsius and Fahrenheit. Input: value and the unit it is in."
              autoFocus
            />
            <div className="flex items-center justify-between gap-3">
              {providers.length > 0 ? (
                <select className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs" value={provider} onChange={(e) => setProvider(e.target.value)}>
                  {providers.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
                </select>
              ) : (
                <span className="text-xs text-amber-400">No LLM key stored. Add one in Account &amp; Billing → LLM keys.</span>
              )}
              <button
                disabled={busy || description.trim().length < 5 || providers.length === 0}
                onClick={generate}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} {draft ? 'Regenerate' : 'Draft it'}
              </button>
            </div>
            {draft && (
              <div className="space-y-3 border-t border-zinc-800 pt-4">
                <div>
                  <div className="text-sm font-semibold text-white">{draft.name} <span className="font-mono text-xs text-zinc-500">{draft.tool_name}</span></div>
                  <div className="text-xs text-zinc-400">{draft.description}</div>
                  {draft.explanation && <div className="text-xs text-emerald-300 mt-1">{draft.explanation}</div>}
                </div>
                <pre className={`${codeCls} max-h-64 overflow-auto`}>{draft.code}</pre>
                <pre className={`${codeCls} max-h-40 overflow-auto`}>{JSON.stringify(draft.input_schema, null, 2)}</pre>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setDraft(null)} className="px-3 py-2 text-xs text-zinc-400 hover:text-white">Discard</button>
                  <button
                    disabled={busy}
                    onClick={() => create({ name: draft.name, description: draft.description, language: draft.language, code: draft.code, input_schema: draft.input_schema })}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    Save as new function
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

type Tab = 'code' | 'schema' | 'secrets' | 'settings' | 'usage';

const Editor: React.FC<{ fn: Fn; onChanged: (id: string) => void; onArchived: () => void }> = ({ fn, onChanged, onArchived }) => {
  const [name, setName] = useState(fn.name);
  const [description, setDescription] = useState(fn.description ?? '');
  const [language, setLanguage] = useState<Language>(fn.language);
  const [code, setCode] = useState(fn.code);
  const [schemaText, setSchemaText] = useState(JSON.stringify(fn.input_schema ?? {}, null, 2));
  const [timeout, setTimeoutSeconds] = useState(fn.timeout_seconds);
  const [memory, setMemory] = useState(fn.memory_mb);
  const [tab, setTab] = useState<Tab>('code');
  const [busy, setBusy] = useState<null | 'save' | 'deploy' | 'test' | 'fix' | 'archive'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testInput, setTestInput] = useState(JSON.stringify(sampleInput(fn.input_schema ?? {}), null, 2));
  const [result, setResult] = useState<(TestResult & { redeployed?: boolean }) | null>(null);
  const [fix, setFix] = useState<{ code: string; explanation: string } | null>(null);

  const schemaError = useMemo(() => {
    try {
      const parsed = JSON.parse(schemaText);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? null : 'Must be a JSON object';
    } catch (err: any) {
      return err.message;
    }
  }, [schemaText]);

  const dirty =
    name !== fn.name || description !== (fn.description ?? '') || language !== fn.language || code !== fn.code ||
    schemaText !== JSON.stringify(fn.input_schema ?? {}, null, 2) || timeout !== fn.timeout_seconds || memory !== fn.memory_mb;

  const run = async <T,>(kind: NonNullable<typeof busy>, work: () => Promise<T>): Promise<T | null> => {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      return await work();
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    api<{ function: Fn }>(`/api/v1/functions/${fn.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, description, language, code, input_schema: JSON.parse(schemaText), timeout_seconds: timeout, memory_mb: memory }),
    });

  const onSave = () => run('save', async () => {
    await save();
    setNotice('Draft saved.');
    onChanged(fn.id);
  });

  const onDeploy = () => run('deploy', async () => {
    if (dirty) await save();
    await api(`/api/v1/functions/${fn.id}/deploy`, { method: 'POST', body: '{}' });
    setNotice('Deployed. It runs in its own Lambda now.');
    onChanged(fn.id);
  });

  const onTest = () => run('test', async () => {
    let input: unknown;
    try {
      input = JSON.parse(testInput || '{}');
    } catch {
      throw new Error('Test input is not valid JSON.');
    }
    if (dirty) await save();
    const res = await api<{ result: TestResult; redeployed: boolean }>(`/api/v1/functions/${fn.id}/test`, { method: 'POST', body: JSON.stringify({ input }) });
    setResult({ ...res.result, redeployed: res.redeployed });
    setFix(null);
    onChanged(fn.id);
  });

  const onFix = () => run('fix', async () => {
    if (!result?.error) return;
    let input: unknown;
    try {
      input = JSON.parse(testInput || '{}');
    } catch {
      input = undefined;
    }
    const res = await api<{ fix: { code: string; explanation: string } }>(`/api/v1/functions/${fn.id}/fix`, {
      method: 'POST',
      body: JSON.stringify({ error: result.error, input, code }),
    });
    setFix(res.fix);
  });

  const onArchive = () => run('archive', async () => {
    if (!window.confirm(`Archive "${fn.name}"? Its Lambda is deleted and agents lose the tool.`)) return;
    await api(`/api/v1/functions/${fn.id}`, { method: 'DELETE' });
    onArchived();
  });

  const badge = statusBadge(fn);

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <input value={name} onChange={(e) => setName(e.target.value)} className="bg-transparent text-lg font-semibold text-white focus:outline-none border-b border-transparent focus:border-zinc-600 w-full" />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>
            <span className="font-mono text-zinc-400">fn_{fn.function_slug}</span>
            {fn.deployed_at && <span className="text-zinc-500">deployed {new Date(fn.deployed_at).toLocaleString()}</span>}
            {dirty && <span className="text-amber-400">unsaved changes</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onSave} disabled={!!busy || !dirty || !!schemaError} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-200 hover:border-zinc-500 disabled:opacity-40">
            {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save draft
          </button>
          <button onClick={onDeploy} disabled={!!busy || !!schemaError || (!dirty && !fn.needs_deploy)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white disabled:opacity-40">
            {busy === 'deploy' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />} {busy === 'deploy' ? 'Deploying…' : 'Deploy'}
          </button>
          <button onClick={onArchive} disabled={!!busy} className="p-2 rounded-lg border border-zinc-800 text-zinc-500 hover:text-rose-400" title="Archive">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="Description the agent reads to decide when to call this tool" />

      {fn.status === 'failed' && fn.last_error && (
        <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-900 text-xs text-rose-300 whitespace-pre-wrap">Last deploy failed: {fn.last_error}</div>
      )}
      {error && <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-900 text-xs text-rose-300 whitespace-pre-wrap">{error}</div>}
      {notice && <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-900 text-xs text-emerald-300 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> {notice}</div>}

      <div className="flex gap-1 border-b border-zinc-800">
        {([
          ['code', 'Code', Code2],
          ['schema', 'Input schema', Braces],
          ['secrets', `Secrets (${fn.secret_names.length})`, KeyRound],
          ['settings', 'Settings', Settings2],
          ['usage', 'Usage', History],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 -mb-px ${tab === id ? 'border-emerald-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'code' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-zinc-500">{CONTRACT[language]}</p>
            <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1 text-xs">
              <option value="python">Python 3.12</option>
              <option value="typescript">TypeScript (Node 22)</option>
            </select>
          </div>
          <textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} className={`${codeCls} min-h-[320px]`} />
        </div>
      )}

      {tab === 'schema' && (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500">JSON Schema for the tool input. Agents see it as the tool's parameters; calls that don't match are rejected before your code runs.</p>
          <textarea value={schemaText} onChange={(e) => setSchemaText(e.target.value)} spellCheck={false} className={`${codeCls} min-h-[260px]`} />
          {schemaError && <p className="text-xs text-rose-400">{schemaError}</p>}
        </div>
      )}

      {tab === 'secrets' && <SecretsTab fn={fn} onChanged={() => onChanged(fn.id)} />}

      {tab === 'settings' && (
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <label className="text-xs text-zinc-400 space-y-1">
            <span>Timeout (seconds, 1–30)</span>
            <input type="number" min={1} max={30} value={timeout} onChange={(e) => setTimeoutSeconds(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} className={inputCls} />
          </label>
          <label className="text-xs text-zinc-400 space-y-1">
            <span>Memory (MB)</span>
            <select value={memory} onChange={(e) => setMemory(Number(e.target.value))} className={inputCls}>
              {[128, 256, 512, 1024].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <p className="col-span-2 text-[11px] text-zinc-500">
            Runs in an isolated AWS Lambda (arm64) with no access to platform resources. To give it to agents, add it to an MCP profile in MCP Hub.
          </p>
        </div>
      )}

      {tab === 'usage' && <UsageTab fnId={fn.id} />}

      <section className="rounded-xl border border-zinc-800 bg-[#0d1017] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-1.5"><Play className="w-4 h-4 text-emerald-400" /> Test in the sandbox</h3>
          <button onClick={onTest} disabled={!!busy || !!schemaError} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-semibold disabled:opacity-40">
            {busy === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {busy === 'test' ? 'Running…' : dirty || fn.needs_deploy ? 'Deploy & test' : 'Run test'}
          </button>
        </div>
        <textarea value={testInput} onChange={(e) => setTestInput(e.target.value)} spellCheck={false} className={`${codeCls} min-h-[90px]`} />
        {result && (
          <div className="space-y-2">
            <div className={`text-xs flex items-center gap-2 ${result.status === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {result.status === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              {result.status === 'ok' ? 'Success' : result.status === 'timeout' ? 'Timed out' : 'Error'} · {result.duration_ms} ms
              {result.redeployed && <span className="text-zinc-500">· redeployed first</span>}
            </div>
            {result.status === 'ok' ? (
              <pre className={`${codeCls} max-h-64 overflow-auto`}>{JSON.stringify(result.output, null, 2)}</pre>
            ) : (
              <>
                <pre className={`${codeCls} max-h-64 overflow-auto text-rose-200`}>{result.error}</pre>
                <button onClick={onFix} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-800 text-emerald-300 text-xs hover:border-emerald-600 disabled:opacity-40">
                  {busy === 'fix' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Fix with AI
                </button>
              </>
            )}
            {result.logs && (
              <details className="text-xs text-zinc-400">
                <summary className="cursor-pointer">Logs</summary>
                <pre className={`${codeCls} max-h-40 overflow-auto mt-1`}>{result.logs}</pre>
              </details>
            )}
          </div>
        )}
        {fix && (
          <div className="space-y-2 border-t border-zinc-800 pt-3">
            <p className="text-xs text-emerald-300">{fix.explanation || 'Proposed fix:'}</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] text-zinc-500 mb-1">Current</div>
                <pre className={`${codeCls} max-h-72 overflow-auto`}>{code}</pre>
              </div>
              <div>
                <div className="text-[10px] text-emerald-400 mb-1">Proposed</div>
                <pre className={`${codeCls} max-h-72 overflow-auto border-emerald-900`}>{fix.code}</pre>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setFix(null)} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white">Discard</button>
              <button
                onClick={() => {
                  setCode(fix.code);
                  setFix(null);
                  setTab('code');
                  setNotice('Fix applied to the editor. Run the test again to deploy and check it.');
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
              >
                Accept fix
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

const SecretsTab: React.FC<{ fn: Fn; onChanged: () => void }> = ({ fn, onChanged }) => {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      onChanged();
    } catch (err: any) {
      setError(err?.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 max-w-xl">
      <p className="text-[11px] text-zinc-500">
        Environment variables for API tokens and similar. Values are encrypted with KMS, never shown again, and applied on the next deploy.
      </p>
      {fn.secret_names.length === 0 && <p className="text-xs text-zinc-500">No secrets.</p>}
      {fn.secret_names.map((s) => (
        <div key={s} className="flex items-center justify-between px-3 py-2 rounded-lg border border-zinc-800 text-xs">
          <span className="font-mono text-zinc-200">{s}</span>
          <span className="text-zinc-600">••••••••</span>
          <button disabled={busy} onClick={() => act(() => api(`/api/v1/functions/${fn.id}/secrets?name=${encodeURIComponent(s)}`, { method: 'DELETE' }))} className="text-zinc-500 hover:text-rose-400">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <input value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="NAME" className={`${inputCls} font-mono`} />
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" type="password" autoComplete="off" className={inputCls} />
        <button
          disabled={busy || !name || !value}
          onClick={() => act(async () => {
            await api(`/api/v1/functions/${fn.id}/secrets`, { method: 'POST', body: JSON.stringify({ name, value }) });
            setName('');
            setValue('');
          })}
          className="px-3 rounded-lg bg-zinc-100 text-zinc-900 text-xs font-semibold disabled:opacity-40"
        >
          Set
        </button>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
};

const UsageTab: React.FC<{ fnId: string }> = ({ fnId }) => {
  const [rows, setRows] = useState<Invocation[] | null>(null);
  useEffect(() => {
    api<{ invocations: Invocation[] }>(`/api/v1/functions/${fnId}/invocations?limit=30`)
      .then((r) => setRows(r.invocations))
      .catch(() => setRows([]));
  }, [fnId]);
  if (!rows) return <p className="text-xs text-zinc-500">Loading…</p>;
  if (!rows.length) return <p className="text-xs text-zinc-500">Not called yet.</p>;
  const who = (caller: string) => (caller.startsWith('team:') ? 'a team' : caller.startsWith('api_key:') ? 'an API key' : caller.startsWith('user:') ? 'a person' : 'the system');
  return (
    <table className="w-full text-xs">
      <thead className="text-zinc-500 text-left">
        <tr><th className="py-1.5 font-normal">When</th><th className="font-normal">Source</th><th className="font-normal">Caller</th><th className="font-normal">Result</th><th className="font-normal text-right">Duration</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-zinc-800/70" title={r.error ?? ''}>
            <td className="py-1.5 text-zinc-400">{new Date(r.created_at).toLocaleString()}</td>
            <td className="text-zinc-300">{r.source}</td>
            <td className="text-zinc-300">{who(r.caller)}</td>
            <td className={r.status === 'ok' ? 'text-emerald-400' : 'text-rose-400'}>{r.status}</td>
            <td className="text-right text-zinc-400">{r.duration_ms ?? '—'} ms</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
