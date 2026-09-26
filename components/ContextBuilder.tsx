'use client';

import React, { useState, useEffect } from 'react';
import {
  ContextProfile,
  ContextPipelineStep,
  ContextSourceType,
  ResolveRequest,
  ResolveResponse,
} from '@/lib/types';
import { compileContext } from '@/lib/compiler';
import {
  ArrowLeft,
  Play,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ChevronUp,
  ChevronDown,
  Sliders,
  FileText,
  Code2,
  Zap,
  BarChart2,
  RefreshCw,
  Plus,
  Trash2,
  Eye,
  Terminal,
  Cpu,
  Shield,
  Clock,
  Settings2,
  Server,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ContextBuilderProps {
  profile: ContextProfile;
  onBack: () => void;
  onUpdateProfile: (updated: ContextProfile) => void;
  onPublishVersion: (profile: ContextProfile) => void;
  onTestLLM: (compiledMarkdown: string, queryText: string) => void;
}

export const ContextBuilder: React.FC<ContextBuilderProps> = ({
  profile,
  onBack,
  onUpdateProfile,
  onPublishVersion,
  onTestLLM,
}) => {
  const [activeTab, setActiveTab] = useState<'markdown' | 'rendered' | 'json' | 'waterfall'>('markdown');
  const [selectedStepId, setSelectedStepId] = useState<string | null>(profile.pipeline[0]?.id || null);
  const [copied, setCopied] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  // Simulated Test Request state for real-time compilation
  const [simulatedIdentity, setSimulatedIdentity] = useState({
    tenant_id: 'tenant_123',
    user_id: 'user_456',
    conversation_id: 'conversation_789',
  });
  const [simulatedQuery, setSimulatedQuery] = useState(
    "Analyze this month's cancellations and propose a VIP retention upgrade for Thanksgiving."
  );

  // Live compiled response computed with useMemo
  const compiled: ResolveResponse = React.useMemo(() => {
    return compileContext(profile, {
      profile: profile.slug,
      identity: simulatedIdentity,
      input: {
        query: simulatedQuery,
        trigger: {
          type: 'contract_cancelled',
          contract_id: 'CTR-9281',
        },
      },
      options: {
        format: activeTab === 'json' ? 'json' : 'markdown',
      },
    });
  }, [profile, simulatedIdentity, simulatedQuery, activeTab]);

  const handleCopyContext = () => {
    navigator.clipboard.writeText(compiled.context.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePublish = () => {
    const updated = {
      ...profile,
      version: profile.version + 1,
      publishedAt: new Date().toISOString(),
    };
    onUpdateProfile(updated);
    onPublishVersion(updated);
    setPublishSuccess(true);
    setTimeout(() => setPublishSuccess(false), 2500);
  };

  const toggleStep = (stepId: string) => {
    const updatedPipeline = profile.pipeline.map((s) =>
      s.id === stepId ? { ...s, enabled: !s.enabled } : s
    );
    onUpdateProfile({ ...profile, pipeline: updatedPipeline });
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= profile.pipeline.length) return;
    const newPipeline = [...profile.pipeline];
    const [moved] = newPipeline.splice(index, 1);
    newPipeline.splice(targetIndex, 0, moved);
    onUpdateProfile({ ...profile, pipeline: newPipeline });
  };

  const updateStepConfig = (stepId: string, newConfig: Partial<ContextPipelineStep['config']>) => {
    const updatedPipeline = profile.pipeline.map((s) => {
      if (s.id === stepId) {
        return {
          ...s,
          config: { ...s.config, ...newConfig },
        };
      }
      return s;
    });
    onUpdateProfile({ ...profile, pipeline: updatedPipeline });
  };

  const updateStepPriority = (stepId: string, priority: number) => {
    const updatedPipeline = profile.pipeline.map((s) =>
      s.id === stepId ? { ...s, priority } : s
    );
    onUpdateProfile({ ...profile, pipeline: updatedPipeline });
  };

  const selectedStep = profile.pipeline.find((s) => s.id === selectedStepId);
  const tokenPercentage = Math.min(
    100,
    Math.round((compiled.metadata.token_count / (profile.budget.maxTokens || 12000)) * 100)
  );

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-[#090b0f] text-zinc-200">
      {/* Top Profile Header Bar */}
      <div className="h-16 px-6 border-b border-zinc-800 bg-[#0d1016] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Back to Profiles"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">{profile.name}</h2>
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-emerald-950/90 text-emerald-400 border border-emerald-800/80">
                v{profile.version} Production
              </span>
              <span className="text-xs text-zinc-500 font-mono">
                {profile.slug}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center gap-1">
                <Server className="w-3 h-3 text-emerald-400" />
                MCP Exposed
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-none mt-0.5">
              Define exactly what your AI knows. Connect anything, we compile the context.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Token Budget Gauge */}
          <div className="hidden lg:flex flex-col items-end mr-2">
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-zinc-400">Tokens:</span>
              <span className="font-bold text-emerald-400">
                {compiled.metadata.token_count.toLocaleString()}
              </span>
              <span className="text-zinc-600">/</span>
              <span className="text-zinc-500">{profile.budget.maxTokens.toLocaleString()}</span>
            </div>
            <div className="w-32 h-1.5 bg-zinc-800 rounded-full mt-1 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  tokenPercentage > 90
                    ? 'bg-red-500'
                    : tokenPercentage > 70
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
                }`}
                style={{ width: `${tokenPercentage}%` }}
              />
            </div>
          </div>

          <button
            onClick={() => onTestLLM(compiled.context.content, simulatedQuery)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium border border-zinc-700 transition-colors"
            title="Execute context with live Gemini 3.7 Flash model"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Test with Gemini</span>
          </button>

          <button
            onClick={handlePublish}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold text-xs transition-all shadow-sm ${
              publishSuccess
                ? 'bg-emerald-500 text-zinc-950'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {publishSuccess ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Published v{profile.version}!</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5" />
                <span>Publish v{profile.version + 1}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Split Body: Recipe (Left) vs Output (Right) */}
      <div className="flex-1 flex overflow-hidden">
        {/* ================= LEFT: CONTEXT PIPELINE (The Recipe) ================= */}
        <div className="w-full md:w-1/2 lg:w-5/12 border-r border-zinc-800 flex flex-col bg-[#0c0f15] overflow-y-auto">
          <div className="p-4 border-b border-zinc-800/80 bg-[#0e121a] flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-300 font-bold">
                Context Pipeline
              </span>
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                {profile.pipeline.filter((s) => s.enabled).length} active steps
              </span>
            </div>

            <span className="text-[11px] text-zinc-500 font-mono">
              Priority P10 → P1
            </span>
          </div>

          {/* Pipeline Step List */}
          <div className="p-4 space-y-2.5">
            {profile.pipeline.map((step, idx) => {
              const isSelected = step.id === selectedStepId;
              const stepBreakdown = compiled.metadata.source_breakdown.find(
                (b) => b.step_id === step.id
              );

              return (
                <div
                  key={step.id}
                  onClick={() => setSelectedStepId(step.id)}
                  className={`relative p-3 rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#151b27] border-emerald-500/80 shadow-md shadow-black/40 ring-1 ring-emerald-500/30'
                      : step.enabled
                      ? 'bg-[#10141d] hover:bg-[#131823] border-zinc-800/80'
                      : 'bg-zinc-900/40 border-zinc-800/40 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-mono font-bold text-zinc-500">
                        {String(idx + 1).padStart(2, '0')}
                      </span>

                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-white">{step.title}</h4>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                            P{step.priority}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">
                          {step.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {stepBreakdown && step.enabled && (
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-800/50">
                          {stepBreakdown.tokens} tkn
                        </span>
                      )}

                      <button
                        onClick={() => moveStep(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 disabled:opacity-20"
                        title="Move Up"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => moveStep(idx, 'down')}
                        disabled={idx === profile.pipeline.length - 1}
                        className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 disabled:opacity-20"
                        title="Move Down"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => toggleStep(step.id)}
                        className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                          step.enabled
                            ? 'bg-emerald-500 border-emerald-400 text-zinc-950'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-500'
                        }`}
                        title={step.enabled ? 'Disable Step' : 'Enable Step'}
                      >
                        {step.enabled && <Check className="w-3 h-3 stroke-[3]" />}
                      </button>
                    </div>
                  </div>

                  {/* Config Drawer for Selected Step */}
                  {isSelected && (
                    <div className="mt-3 pt-3 border-t border-zinc-800 text-xs space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-semibold flex items-center gap-1.5">
                          <Settings2 className="w-3.5 h-3.5 text-emerald-400" />
                          Step Configuration
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500">
                          Type: {step.type}
                        </span>
                      </div>

                      {/* Static Content Editor */}
                      {step.config.staticContent !== undefined && (
                        <div className="space-y-1">
                          <label className="text-[11px] text-zinc-400 font-mono">
                            Directive / Content Template:
                          </label>
                          <textarea
                            value={step.config.staticContent}
                            onChange={(e) =>
                              updateStepConfig(step.id, { staticContent: e.target.value })
                            }
                            rows={3}
                            className="w-full bg-[#0a0c10] border border-zinc-700/80 rounded-md p-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      )}

                      {/* Retrieval & Budget Sliders */}
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        {step.config.topK !== undefined && (
                          <div>
                            <label className="text-[11px] text-zinc-400 font-mono flex justify-between">
                              <span>Top K Retrieval:</span>
                              <span className="text-emerald-400 font-bold">{step.config.topK}</span>
                            </label>
                            <input
                              type="range"
                              min="1"
                              max="12"
                              value={step.config.topK}
                              onChange={(e) =>
                                updateStepConfig(step.id, { topK: Number(e.target.value) })
                              }
                              className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded cursor-pointer"
                            />
                          </div>
                        )}

                        {step.config.minimumScore !== undefined && (
                          <div>
                            <label className="text-[11px] text-zinc-400 font-mono flex justify-between">
                              <span>Min Relevance:</span>
                              <span className="text-emerald-400 font-bold">
                                {(step.config.minimumScore * 100).toFixed(0)}%
                              </span>
                            </label>
                            <input
                              type="range"
                              min="0.5"
                              max="0.95"
                              step="0.05"
                              value={step.config.minimumScore}
                              onChange={(e) =>
                                updateStepConfig(step.id, {
                                  minimumScore: Number(e.target.value),
                                })
                              }
                              className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded cursor-pointer"
                            />
                          </div>
                        )}

                        <div>
                          <label className="text-[11px] text-zinc-400 font-mono flex justify-between">
                            <span>Priority Weight:</span>
                            <span className="text-emerald-400 font-bold">P{step.priority}</span>
                          </label>
                          <input
                            type="range"
                            min="1"
                            max="10"
                            value={step.priority}
                            onChange={(e) => updateStepPriority(step.id, Number(e.target.value))}
                            className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded cursor-pointer"
                          />
                        </div>

                        {step.config.tokenBudget !== undefined && (
                          <div>
                            <label className="text-[11px] text-zinc-400 font-mono flex justify-between">
                              <span>Max Step Tokens:</span>
                              <span className="text-emerald-400 font-bold">
                                {step.config.tokenBudget}
                              </span>
                            </label>
                            <input
                              type="range"
                              min="100"
                              max="4000"
                              step="50"
                              value={step.config.tokenBudget}
                              onChange={(e) =>
                                updateStepConfig(step.id, {
                                  tokenBudget: Number(e.target.value),
                                })
                              }
                              className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded cursor-pointer"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom Contract Verification Box */}
          <div className="p-4 border-t border-zinc-800/80 bg-[#0a0d14] mt-auto">
            <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-zinc-400 mb-2 flex items-center justify-between">
              <span>Context Contract Check</span>
              <span className="text-emerald-400 flex items-center gap-1 font-normal">
                <CheckCircle2 className="w-3 h-3" /> Valid
              </span>
            </div>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex items-center justify-between text-zinc-400">
                <span>Required:</span>
                <span className="text-emerald-400">
                  {profile.contract.required.join(', ') || 'None'}
                </span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Simulated Inputs:</span>
                <span className="text-zinc-300">
                  tenant_id, user_id, conversation_id, query
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ================= RIGHT: COMPILED CONTEXT (The Output) ================= */}
        <div className="w-full md:w-1/2 lg:w-7/12 flex flex-col bg-[#080a0e] overflow-hidden">
          {/* Output Header Controls */}
          <div className="h-12 px-4 border-b border-zinc-800 bg-[#0e121a] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-bold">
                Compiled Context
              </span>

              <div className="flex items-center bg-zinc-900 rounded-md p-0.5 border border-zinc-800">
                <button
                  onClick={() => setActiveTab('markdown')}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-all ${
                    activeTab === 'markdown'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Markdown
                </button>
                <button
                  onClick={() => setActiveTab('rendered')}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-all ${
                    activeTab === 'rendered'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Rendered
                </button>
                <button
                  onClick={() => setActiveTab('json')}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-all ${
                    activeTab === 'json'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  JSON
                </button>
                <button
                  onClick={() => setActiveTab('waterfall')}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-all ${
                    activeTab === 'waterfall'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Sources
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-zinc-500">
                {compiled.metadata.resolution_time_ms}ms resolution
              </span>

              <button
                onClick={handleCopyContext}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono border border-zinc-700 transition-colors"
                title="Copy Compiled Context"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-zinc-400" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick Simulation Bar */}
          <div className="p-3 bg-[#0a0d13] border-b border-zinc-800/80 flex flex-col sm:flex-row items-center gap-3 text-xs">
            <div className="flex items-center gap-2 flex-1 w-full font-mono">
              <span className="text-zinc-500 shrink-0">Input Query:</span>
              <input
                type="text"
                value={simulatedQuery}
                onChange={(e) => setSimulatedQuery(e.target.value)}
                placeholder="Simulate user prompt / trigger query..."
                className="w-full bg-[#121620] border border-zinc-700/80 rounded px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex items-center gap-2 text-zinc-400 shrink-0 font-mono text-[11px]">
              <span>Tenant:</span>
              <span className="text-emerald-400">{simulatedIdentity.tenant_id}</span>
              <span>•</span>
              <span>User:</span>
              <span className="text-emerald-400">{simulatedIdentity.user_id}</span>
            </div>
          </div>

          {/* Main Context Output Area */}
          <div className="flex-1 overflow-y-auto p-5 font-mono text-xs text-zinc-300 leading-relaxed">
            {activeTab === 'markdown' && (
              <pre className="whitespace-pre-wrap selection:bg-emerald-900 selection:text-emerald-200 text-zinc-300 font-mono">
                {compiled.context.content}
              </pre>
            )}

            {activeTab === 'rendered' && (
              <div className="prose prose-invert prose-emerald max-w-none prose-headings:font-bold prose-headings:text-emerald-400 prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-p:text-xs prose-p:leading-relaxed prose-table:text-xs">
                <ReactMarkdown>{compiled.context.content}</ReactMarkdown>
              </div>
            )}

            {activeTab === 'json' && (
              <pre className="whitespace-pre-wrap text-emerald-400/90 font-mono">
                {compiled.context.content}
              </pre>
            )}

            {activeTab === 'waterfall' && (
              <div className="space-y-4">
                <div className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold mb-2">
                  Resolution Pipeline Waterfall & Latency Breakdown
                </div>
                <div className="space-y-2">
                  {compiled.metadata.source_breakdown.map((item, idx) => (
                    <div
                      key={item.step_id || idx}
                      className="p-3 rounded-lg bg-[#11151e] border border-zinc-800 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white">{item.name}</span>
                        <span className="text-emerald-400 font-mono">
                          {item.latency_ms} ms
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                        <span>
                          Source: <code className="text-zinc-300">{item.source_id}</code>
                        </span>
                        <span>{item.tokens.toLocaleString()} tokens</span>
                      </div>
                      {item.relevance_score && (
                        <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full"
                            style={{ width: `${item.relevance_score * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
