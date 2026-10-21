'use client';

import React from 'react';

export interface PickerProvider {
  id: string;
  label: string;
  configured: boolean;
  enabled: boolean;
  defaultModel: string;
}

export type ProviderMode = 'auto' | 'preferred' | 'locked';

export interface ProviderChoice {
  /** null with mode null = "same as the team" (workers only). */
  provider: string | null;
  model: string;
  mode: ProviderMode | null;
}

const fieldCls = 'w-full bg-[#090b0f] border border-zinc-700 rounded-lg px-3 py-2 font-mono text-white text-xs disabled:opacity-60';

/**
 * Which provider an agent runs on: Automatic (the organization's order), a provider it
 * prefers (then the order), or a provider it is locked to (fails instead of switching).
 * Workers can also say "same as the team".
 */
export const ProviderPicker: React.FC<{
  providers: PickerProvider[];
  value: ProviderChoice;
  onChange: (next: ProviderChoice) => void;
  /** Label of the inherit option (workers); omit for instances and supervisors. */
  inheritLabel?: string;
  compact?: boolean;
}> = ({ providers, value, onChange, inheritLabel, compact }) => {
  const usable = providers.filter((p) => (p.configured && p.enabled) || p.id === value.provider);
  const inherit = !!inheritLabel && value.mode === null;
  const auto = value.mode === 'auto';
  const selectValue = inherit ? '__inherit' : auto ? '__auto' : value.provider ?? '__auto';
  const current = providers.find((p) => p.id === value.provider);

  const pick = (v: string) => {
    if (v === '__inherit') return onChange({ provider: null, model: '', mode: null });
    if (v === '__auto') return onChange({ provider: null, model: '', mode: 'auto' });
    const p = providers.find((x) => x.id === v);
    onChange({ provider: v, model: p?.defaultModel ?? '', mode: value.mode === 'locked' ? 'locked' : 'preferred' });
  };

  return (
    <div className="space-y-1.5">
      <div className={`grid ${compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2'} gap-2`}>
        <select value={selectValue} onChange={(e) => pick(e.target.value)} className={fieldCls} aria-label="LLM provider">
          {inheritLabel && <option value="__inherit">{inheritLabel}</option>}
          <option value="__auto">Automatic (organization order)</option>
          {usable.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {!p.enabled ? ' (off)' : !p.configured ? ' (no key)' : ''}
            </option>
          ))}
        </select>
        <input
          value={auto ? '' : value.model}
          disabled={auto}
          onChange={(e) => onChange({ ...value, model: e.target.value })}
          placeholder={inherit ? 'Team model' : auto ? 'Each provider’s default' : current?.defaultModel ?? 'Model'}
          className={fieldCls}
          aria-label="Model"
        />
      </div>
      {!inherit && !auto && (
        <label className="flex items-start gap-2 text-[11px] text-zinc-400 cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={value.mode === 'locked'} onChange={(e) => onChange({ ...value, mode: e.target.checked ? 'locked' : 'preferred' })} />
          <span>
            <span className="text-zinc-200">Lock to this provider and model.</span> Without the lock, it switches to the next provider in your organization&apos;s order when this one is out
            of quota or too slow. Locked, it fails instead.
          </span>
        </label>
      )}
      {auto && <p className="text-[11px] text-zinc-500">Uses the first provider that is on and has a key, in the order set in Account &amp; Billing → LLM providers.</p>}
    </div>
  );
};
