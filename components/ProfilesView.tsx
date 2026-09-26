'use client';

import React from 'react';
import { ContextProfile } from '@/lib/types';
import {
  Plus,
  ArrowRight,
  Terminal,
  Cpu,
  Layers,
  Sparkles,
  Clock,
  Zap,
  Code,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Check,
} from 'lucide-react';

interface ProfilesViewProps {
  profiles: ContextProfile[];
  onSelectProfile: (profile: ContextProfile) => void;
  onOpenCreate: () => void;
  onQuickResolve: (profile: ContextProfile) => void;
}

export const ProfilesView: React.FC<ProfilesViewProps> = ({
  profiles,
  onSelectProfile,
  onOpenCreate,
  onQuickResolve,
}) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const handleCopyEndpoint = (e: React.MouseEvent, slug: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`POST /api/v1/context/resolve {"profile":"${slug}"}`);
    setCopiedId(slug);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalSourcesCount = profiles.reduce(
    (sum, p) => sum + p.pipeline.filter((s) => s.enabled).length,
    0
  );

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Top Banner / Hero */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-white">Context Control</h1>
            <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
              Universal Context Engine
            </span>
          </div>
          <p className="text-zinc-400 text-sm">
            Universal context infrastructure for AI applications. Give any AI model the right context, exactly when it needs it.
          </p>
        </div>

        <button
          onClick={onOpenCreate}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs tracking-wide transition-all shadow-md shadow-emerald-950/40 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Create Profile</span>
        </button>
      </div>

      {/* High-Level Infrastructure Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-[#11141c] border border-zinc-800/80">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
            Active Profiles
          </div>
          <div className="text-xl font-bold text-white font-mono flex items-baseline gap-1.5">
            {profiles.length}
            <span className="text-xs text-emerald-400 font-normal">in production</span>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-[#11141c] border border-zinc-800/80">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
            Connected Pipelines
          </div>
          <div className="text-xl font-bold text-white font-mono flex items-baseline gap-1.5">
            {totalSourcesCount}
            <span className="text-xs text-zinc-400 font-normal">active steps</span>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-[#11141c] border border-zinc-800/80">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
            Avg Compilation Latency
          </div>
          <div className="text-xl font-bold text-emerald-400 font-mono flex items-baseline gap-1.5">
            14.2 ms
            <span className="text-xs text-zinc-400 font-normal">p99 &lt; 35ms</span>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-[#11141c] border border-zinc-800/80">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
            Target Architecture
          </div>
          <div className="text-xl font-bold text-zinc-200 font-mono text-xs">
            Model-Agnostic Context
          </div>
        </div>
      </div>

      {/* Context Profiles Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold flex items-center gap-2">
            <span>Context Profiles</span>
            <span className="text-[11px] text-zinc-600 font-normal">({profiles.length})</span>
          </div>
          <span className="text-xs text-zinc-500 font-mono">POST /v1/context/resolve</span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {profiles.map((profile) => {
            const activeSteps = profile.pipeline.filter((s) => s.enabled);
            const isProd = profile.environment === 'production';

            return (
              <div
                key={profile.id}
                onClick={() => onSelectProfile(profile)}
                className="group relative p-5 rounded-xl bg-[#11151e] hover:bg-[#151a26] border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer shadow-sm hover:shadow-md hover:shadow-black/40"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Info */}
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors">
                        {profile.name}
                      </h3>

                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full ${
                          isProd
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                            : 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isProd ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                        {isProd ? 'Production' : 'Staging'} • v{profile.version}
                      </span>

                      <span className="text-xs text-zinc-500 font-mono">
                        {profile.budget.outputFormat.toUpperCase()}
                      </span>
                    </div>

                    <p className="text-zinc-400 text-xs leading-relaxed max-w-2xl">
                      {profile.description}
                    </p>

                    {/* Metadata strip */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400 pt-1 font-mono">
                      <div className="flex items-center gap-1.5 text-zinc-300">
                        <Layers className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{activeSteps.length} context sources</span>
                      </div>

                      <div className="flex items-center gap-1.5 text-zinc-300">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span>{(profile.avgTokens / 1000).toFixed(1)}k avg tokens</span>
                      </div>

                      <div className="flex items-center gap-1.5 text-zinc-500">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Last request {profile.lastRequestAt}</span>
                      </div>

                      {profile.contract.required.length > 0 && (
                        <div className="flex items-center gap-1 text-[11px] text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                          <span className="text-zinc-400">Req:</span>
                          <span className="text-emerald-400">{profile.contract.required.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Endpoint badge & Actions */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 shrink-0">
                    <button
                      onClick={(e) => handleCopyEndpoint(e, profile.slug)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-mono transition-colors"
                      title="Copy resolve endpoint"
                    >
                      {copiedId === profile.slug ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <span className="text-emerald-400 font-semibold">GET</span>
                          <span className="text-zinc-400">/context/{profile.slug}</span>
                          <Copy className="w-3 h-3 text-zinc-500 ml-1" />
                        </>
                      )}
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuickResolve(profile);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors border border-zinc-700"
                    >
                      <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Test Resolve</span>
                    </button>

                    <button
                      onClick={() => onSelectProfile(profile)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-semibold transition-all shadow-sm group-hover:translate-x-0.5"
                    >
                      <span>Open Builder</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
