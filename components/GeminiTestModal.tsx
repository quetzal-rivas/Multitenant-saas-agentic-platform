'use client';

import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Play,
  RefreshCw,
  Copy,
  Check,
  Bot,
  Layers,
  ArrowRight,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface GeminiTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  compiledContext: string;
  defaultQuery: string;
}

export const GeminiTestModal: React.FC<GeminiTestModalProps> = ({
  isOpen,
  onClose,
  compiledContext,
  defaultQuery,
}) => {
  const [query, setQuery] = useState(defaultQuery);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [modelName, setModelName] = useState('gemini-3.7-flash');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleExecute = async () => {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/v1/context/test-llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextContent: compiledContext,
          userQuery: query,
          modelName,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setResult(data.response);
      } else {
        setResult(`Error: ${data.message || 'Failed to call model'}`);
      }
    } catch (err: any) {
      setResult(`Network Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-[#0e121a] border border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-[#111622]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-950 flex items-center justify-center border border-emerald-800 text-emerald-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Live LLM Execution Test
                </h3>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                  {modelName}
                </span>
              </div>
              <p className="text-xs text-zinc-400 font-mono">
                Context Control → Gemini 3.7 Flash
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 bg-[#090b0f]">
          {/* Query input */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono font-semibold uppercase text-zinc-300">
              User Runtime Query / Scenario Prompt:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter query to test with this compiled context..."
                className="flex-1 bg-[#121620] border border-zinc-700 rounded-lg px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={handleExecute}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition-all shadow-md shrink-0"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
                <span>Generate</span>
              </button>
            </div>
          </div>

          {/* Context Snippet preview */}
          <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs font-mono space-y-1">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="flex items-center gap-1.5 text-zinc-300">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                Compiled Context Attached
              </span>
              <span className="text-[11px] text-emerald-400">
                {Math.ceil(compiledContext.length / 3.8)} estimated tokens
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 line-clamp-2">
              {compiledContext.slice(0, 200)}...
            </p>
          </div>

          {/* Result Output */}
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-semibold uppercase text-zinc-300 flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-emerald-400" />
                Model Generation Output
              </label>

              {result && (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono border border-zinc-700 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-zinc-400" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="min-h-[220px] p-4 rounded-xl bg-[#11151e] border border-zinc-800 font-mono text-xs leading-relaxed text-zinc-200 overflow-y-auto">
              {loading ? (
                <div className="h-48 flex flex-col items-center justify-center space-y-3 text-zinc-400">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                  <p className="text-xs font-mono">Executing prompt with compiled context on Gemini 3.7 Flash...</p>
                </div>
              ) : result ? (
                <div className="prose prose-invert prose-emerald max-w-none text-xs">
                  <ReactMarkdown>{result}</ReactMarkdown>
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-zinc-500 space-y-2">
                  <Sparkles className="w-6 h-6 text-zinc-600" />
                  <p>Click &quot;Generate&quot; to test how Gemini utilizes the compiled context.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
