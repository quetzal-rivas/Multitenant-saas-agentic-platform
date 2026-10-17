'use client';

import React, { useState } from 'react';
import { SlidersHorizontal, CheckCircle2, Shield, Zap, Save, Check } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [globalMaxBudget, setGlobalMaxBudget] = useState(16000);
  const [cacheEnabled, setCacheEnabled] = useState(true);
  const [cacheTtl, setCacheTtl] = useState(300);
  const [defaultFormat, setDefaultFormat] = useState<'markdown' | 'json'>('markdown');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div className="pb-6 border-b border-zinc-800">
        <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
          Compiler Policies & Settings
        </h1>
        <p className="text-zinc-400 text-sm">
          Global defaults for context assembly, cache TTLs, and token budget policies.
        </p>
      </div>

      <div className="p-6 rounded-xl bg-[#11151e] border border-zinc-800 space-y-6">
        <div className="space-y-4">
          <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-300 font-bold">
            Token Budget & Output Settings
          </h2>

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Global Maximum Token Budget Per Resolve:
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={globalMaxBudget}
                onChange={(e) => setGlobalMaxBudget(Number(e.target.value))}
                className="bg-[#090b0f] border border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-white w-48"
              />
              <span className="text-xs text-zinc-500 font-mono">tokens maximum</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Default Output Format:
            </label>
            <select
              value={defaultFormat}
              onChange={(e) => setDefaultFormat(e.target.value as any)}
              className="bg-[#090b0f] border border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-white w-48"
            >
              <option value="markdown">Markdown (Prompt-ready)</option>
              <option value="json">Structured JSON</option>
            </select>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-zinc-800">
          <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-300 font-bold">
            Context Caching & Invalidation
          </h2>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-white block">
                Enable Context Layer Caching
              </span>
              <span className="text-xs text-zinc-400">
                Caches static rules & tenant policies to reduce DB roundtrips.
              </span>
            </div>
            <input
              type="checkbox"
              checked={cacheEnabled}
              onChange={(e) => setCacheEnabled(e.target.checked)}
              className="accent-emerald-500 w-4 h-4 rounded"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Cache TTL (seconds):
            </label>
            <input
              type="number"
              value={cacheTtl}
              onChange={(e) => setCacheTtl(Number(e.target.value))}
              className="bg-[#090b0f] border border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-white w-48"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-zinc-800 flex justify-end">
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition-all"
          >
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{saved ? 'Saved Policies' : 'Save Policies'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
