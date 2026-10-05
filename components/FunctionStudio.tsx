'use client';

import React, { useState, useEffect } from 'react';
import {
  ServerlessFunction,
  FunctionExecutionResult,
} from '@/lib/types';
import {
  Zap,
  Play,
  Save,
  Plus,
  RefreshCw,
  Clock,
  Cpu,
  Layers,
  Terminal,
  ExternalLink,
  Code2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  FolderOpen,
  Trash2,
  KeyRound,
  Package,
} from 'lucide-react';

interface FunctionStudioProps {
  onToolRegistered?: (tool: ServerlessFunction) => void;
}

export function FunctionStudio({ onToolRegistered }: FunctionStudioProps) {
  const selectedOrg = ''; // organization comes from the session on the server

  // The API stores the definition; editor-only fields get local defaults.
  const withEditorDefaults = (f: any): ServerlessFunction => ({
    collection: 'Custom',
    organizationId: '',
    language: 'python',
    description: '',
    outputSchema: { type: 'object', properties: {} },
    envVars: {},
    dependencies: [],
    timeoutSeconds: 15,
    memoryMb: 128,
    version: '1.0.0',
    endpoint: '',
    mcpToolName: '',
    testInputJson: '{}',
    ...f,
    deployed: false,
  });
  const [functions, setFunctions] = useState<ServerlessFunction[]>([]);
  const [selectedFn, setSelectedFn] = useState<ServerlessFunction | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<FunctionExecutionResult | null>(null);
  const [copiedEndpoint, setCopiedEndpoint] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'code' | 'schema' | 'env' | 'test'>('code');

  // Load functions from API
  const fetchFunctions = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/functions');
      const data = await res.json();
      const list = (data.functions || []).map(withEditorDefaults);
      setFunctions(list);
      setSelectedFn((prev) => prev || list[0] || null);
    } catch (e) {
      console.error('Failed to load functions:', e);
    } finally {
      setIsLoading(false);
    }
  }, [selectedOrg]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await fetch('/api/functions');
        const data = await res.json();
        if (!ignore) {
          const list = (data.functions || []).map(withEditorDefaults);
          setFunctions(list);
          setSelectedFn((prev) => prev || list[0] || null);
          setIsLoading(false);
        }
      } catch (e) {
        console.error('Failed to load functions:', e);
        if (!ignore) setIsLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [selectedOrg]);

  // Group functions by collection
  const collections = functions.reduce((acc, fn) => {
    const coll = fn.collection || 'General';
    if (!acc[coll]) acc[coll] = [];
    acc[coll].push(fn);
    return acc;
  }, {} as Record<string, ServerlessFunction[]>);

  // Handle field update in current function
  const updateCurrentFn = (updates: Partial<ServerlessFunction>) => {
    if (!selectedFn) return;
    const updated = { ...selectedFn, ...updates };
    setSelectedFn(updated);
    setFunctions((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  };

  // Run test in ephemeral sandbox
  const handleTestExecute = async () => {
    if (!selectedFn) return;
    setIsExecuting(true);
    setExecutionResult(null);

    let parsedInput = {};
    try {
      parsedInput = JSON.parse(selectedFn.testInputJson || '{}');
    } catch {
      alert('Invalid JSON in test input payload');
      setIsExecuting(false);
      return;
    }

    try {
      const res = await fetch('/api/functions/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: selectedFn.language,
          code: selectedFn.code,
          input: parsedInput,
          envVars: selectedFn.envVars,
          timeoutSeconds: selectedFn.timeoutSeconds,
        }),
      });

      const data = await res.json();
      setExecutionResult(data);
      setActiveTab('test');
    } catch (err: any) {
      setExecutionResult({
        success: false,
        error: err.message,
        durationMs: 0,
        executionId: `err-${Date.now()}`,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // Deploy / Register as Serverless Lambda MCP Tool
  const handleDeploy = async () => {
    if (!selectedFn) return;
    setIsDeploying(true);

    try {
      const res = await fetch('/api/functions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedFn),
      });

      const data = await res.json();
      if (data.success) {
        const saved = withEditorDefaults({ ...selectedFn, ...data.function });
        setSelectedFn(saved);
        setFunctions((prev) => {
          const exists = prev.some((f) => f.id === selectedFn.id || f.id === saved.id);
          return exists ? prev.map((f) => (f.id === selectedFn.id || f.id === saved.id ? saved : f)) : [saved, ...prev];
        });
        onToolRegistered?.(data.function);
      }
    } catch (err) {
      console.error('Deploy failed:', err);
    } finally {
      setIsDeploying(false);
    }
  };

  // Create new function template
  const handleCreateNew = () => {
    const newName = `custom_tool_${Date.now().toString().slice(-4)}`;
    const newFn: ServerlessFunction = {
      id: `fn-${Date.now()}`,
      name: newName,
      collection: 'Custom',
      organizationId: selectedOrg,
      language: 'python',
      description: 'Arbitrary serverless tool running inside Context Control AWS Lambda container.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Input search or data query' },
        },
        required: ['query'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          result: { type: 'string' },
          status: { type: 'string' },
        },
      },
      envVars: {},
      dependencies: ['requests'],
      timeoutSeconds: 15,
      memoryMb: 128,
      version: '1.0.0',
      endpoint: '',
      mcpToolName: '',
      deployed: false,
      testInputJson: '{\n  "query": "test calculation"\n}',
      code: `def main(query: str):
    # Arbitrary user Python code in ephemeral AWS Lambda sandbox
    processed = query.upper()
    return {
        "query": query,
        "processed": processed,
        "status": "success",
        "lambda_runtime": "python3.12"
    }
`,
    };

    setFunctions((prev) => [newFn, ...prev]);
    setSelectedFn(newFn);
    setActiveTab('code');
  };

  const copyEndpoint = () => {
    if (selectedFn) {
      navigator.clipboard.writeText(selectedFn.endpoint);
      setCopiedEndpoint(true);
      setTimeout(() => setCopiedEndpoint(false), 2000);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0e17] text-slate-100 font-sans overflow-hidden">
      {/* Top Banner / Multi-Tenant Bar */}
      <div className="px-4 py-3 bg-[#0d131f] border-b border-[#1c2638] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-emerald-500 to-orange-600 flex items-center justify-center text-white shadow-sm">
            <Zap className="w-4 h-4 fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-wide">
                AI Function Studio
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                AWS Lambda Stateless JSON-RPC
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Build arbitrary Python/Node tools, package as serverless Lambdas, and auto-register via MCP.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Tool</span>
          </button>
        </div>
      </div>

      {/* Main Studio Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Collections & Tool Hierarchy */}
        <div className="w-72 bg-[#090d16] border-r border-[#1a2334] flex flex-col shrink-0">
          <div className="p-3 border-b border-[#182030] flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Tool Collections ({functions.length})
            </span>
            <button
              onClick={fetchFunctions}
              className="p-1 text-slate-400 hover:text-white transition-colors"
              title="Refresh collections"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-4">
            {Object.entries(collections).map(([collName, fns]) => (
              <div key={collName} className="space-y-1">
                <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold text-slate-400">
                  <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{collName} Collection</span>
                  <span className="text-[10px] text-slate-500 font-mono">({fns.length})</span>
                </div>

                <div className="space-y-0.5 pl-2">
                  {fns.map((fn) => {
                    const isSelected = selectedFn?.id === fn.id;
                    return (
                      <button
                        key={fn.id}
                        onClick={() => {
                          setSelectedFn(fn);
                          setExecutionResult(null);
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded text-xs flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'bg-emerald-600/15 border border-emerald-500/30 text-emerald-300 font-medium'
                            : 'text-slate-300 hover:bg-[#121927]'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <div className="flex items-center gap-1.5">
                            <Code2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="font-mono text-[11px] truncate">{fn.name}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 truncate mt-0.5">
                            {fn.language === 'python' ? 'Python 3.12' : 'Node.js 20'} • {fn.version}
                          </p>
                        </div>
                        {fn.deployed && (
                          <span
                            className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-sm"
                            title="Deployed as active MCP tool"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-[#0c121d] border-t border-[#182030] text-[11px] text-slate-500 leading-snug">
            Functions are saved as drafts. Running and deploying them (sandboxed, then offered to agents as MCP tools) is not available yet.
          </div>
        </div>

        {/* Center/Right: Function Editor, Parameters, and Test Console */}
        {selectedFn ? (
          <div className="flex-1 flex flex-col overflow-hidden bg-[#0c111a]">
            {/* Function Header & Metadata Bar */}
            <div className="px-5 py-3 border-b border-[#1b2536] bg-[#0f1522] flex items-center justify-between shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={selectedFn.name}
                    onChange={(e) => updateCurrentFn({ name: e.target.value })}
                    className="bg-transparent text-sm font-bold font-mono text-white outline-none border-b border-transparent hover:border-slate-600 focus:border-emerald-500 transition-colors"
                  />
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20 font-semibold">
                    Draft · not deployed
                  </span>
                  <span className="text-xs text-slate-500 font-mono">v{selectedFn.version}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>{selectedFn.timeoutSeconds}s max timeout</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-slate-400" />
                    <span>{selectedFn.memoryMb}MB RAM</span>
                  </span>
                  <span className="text-slate-500">|</span>
                  <span className="text-slate-500">No public endpoint until deployment is available</span>
                </div>
              </div>

              {/* Action Buttons: Deploy & Run Test */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTestExecute}
                  disabled
                  title="Running user code needs a sandbox; coming with the Function Studio rebuild"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition-colors disabled:opacity-50 shadow-sm"
                >
                  <Play className={`w-3.5 h-3.5 fill-white ${isExecuting ? 'animate-pulse' : ''}`} />
                  <span>Test (coming soon)</span>
                </button>

                <button
                  onClick={handleDeploy}
                  disabled={isDeploying}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition-colors disabled:opacity-50 shadow-sm"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isDeploying ? 'Saving...' : 'Save draft'}</span>
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 px-4 border-b border-[#1b2536] bg-[#0b0f17] text-xs shrink-0">
              <button
                onClick={() => setActiveTab('code')}
                className={`px-3 py-2 font-semibold border-b-2 transition-colors ${
                  activeTab === 'code'
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                Code Implementation
              </button>
              <button
                onClick={() => setActiveTab('schema')}
                className={`px-3 py-2 font-semibold border-b-2 transition-colors ${
                  activeTab === 'schema'
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                Input / Output Schema
              </button>
              <button
                onClick={() => setActiveTab('env')}
                className={`px-3 py-2 font-semibold border-b-2 transition-colors ${
                  activeTab === 'env'
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                Secrets & Dependencies
              </button>
              <button
                onClick={() => setActiveTab('test')}
                className={`px-3 py-2 font-semibold border-b-2 transition-colors ${
                  activeTab === 'test'
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                Test Console & Logs
              </button>
            </div>

            {/* Tab Body */}
            <div className="flex-1 flex overflow-hidden">
              {activeTab === 'code' && (
                <div className="flex-1 flex flex-col h-full bg-[#080c14]">
                  {/* Language switch */}
                  <div className="px-4 py-2 border-b border-[#182030] bg-[#0a0f19] flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <span>Runtime:</span>
                      <select
                        value={selectedFn.language}
                        onChange={(e) =>
                          updateCurrentFn({ language: e.target.value as 'python' | 'typescript' })
                        }
                        className="bg-[#121824] px-2 py-1 rounded text-slate-200 font-mono text-xs border border-[#222e44] outline-none"
                      >
                        <option value="python">Python 3.12 (AWS Lambda)</option>
                        <option value="typescript">Node.js 20 TypeScript (AWS Lambda)</option>
                      </select>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Entrypoint: def main(**kwargs)
                    </span>
                  </div>

                  <textarea
                    value={selectedFn.code}
                    onChange={(e) => updateCurrentFn({ code: e.target.value })}
                    className="flex-1 w-full bg-[#080c14] text-slate-100 font-mono text-xs p-4 outline-none resize-none leading-relaxed"
                    spellCheck={false}
                  />
                </div>
              )}

              {activeTab === 'schema' && (
                <div className="flex-1 p-5 overflow-y-auto space-y-5 bg-[#090d16]">
                  <div>
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                      Input JSON Schema (Agent Parameters)
                    </h3>
                    <textarea
                      value={JSON.stringify(selectedFn.inputSchema, null, 2)}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value);
                          updateCurrentFn({ inputSchema: parsed });
                        } catch {
                          // allow typing
                        }
                      }}
                      className="w-full h-48 bg-[#0e1422] border border-[#1e283b] rounded font-mono text-xs p-3 text-slate-200 outline-none"
                      spellCheck={false}
                    />
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                      Output JSON Schema
                    </h3>
                    <textarea
                      value={JSON.stringify(selectedFn.outputSchema, null, 2)}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value);
                          updateCurrentFn({ outputSchema: parsed });
                        } catch {
                          // allow typing
                        }
                      }}
                      className="w-full h-40 bg-[#0e1422] border border-[#1e283b] rounded font-mono text-xs p-3 text-slate-200 outline-none"
                      spellCheck={false}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'env' && (
                <div className="flex-1 p-5 overflow-y-auto space-y-6 bg-[#090d16]">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                          Environment Secrets & Configuration
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Injected directly into the Lambda sandbox process at execution time.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          const key = prompt('Secret Name (e.g. STRIPE_API_KEY):');
                          if (key) {
                            const val = prompt('Secret Value:');
                            updateCurrentFn({
                              envVars: { ...selectedFn.envVars, [key]: val || '' },
                            });
                          }
                        }}
                        className="px-2.5 py-1 bg-[#1a2335] hover:bg-[#25324c] text-white text-xs rounded border border-[#273652] transition-colors"
                      >
                        + Add Secret
                      </button>
                    </div>

                    <div className="space-y-2">
                      {Object.entries(selectedFn.envVars).length === 0 ? (
                        <p className="text-xs text-slate-500 italic p-3 bg-[#0d121c] rounded">
                          No environment secrets configured for this tool.
                        </p>
                      ) : (
                        Object.entries(selectedFn.envVars).map(([k, v]) => (
                          <div
                            key={k}
                            className="flex items-center justify-between p-2.5 bg-[#0e1422] border border-[#1f293d] rounded text-xs font-mono"
                          >
                            <span className="text-emerald-400 font-semibold">{k}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-400">••••••••••••</span>
                              <button
                                onClick={() => {
                                  const copy = { ...selectedFn.envVars };
                                  delete copy[k];
                                  updateCurrentFn({ envVars: copy });
                                }}
                                className="text-red-400 hover:text-red-300"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                      Package Dependencies
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      {selectedFn.dependencies.map((dep) => (
                        <span
                          key={dep}
                          className="px-2 py-1 bg-[#141b2a] border border-[#222d42] rounded text-xs font-mono text-slate-300"
                        >
                          {dep}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'test' && (
                <div className="flex-1 flex overflow-hidden">
                  {/* Left sub-panel: Test Input JSON */}
                  <div className="w-1/2 border-r border-[#1a2334] flex flex-col bg-[#090d16]">
                    <div className="px-4 py-2 bg-[#0e1422] border-b border-[#182030] text-xs font-bold text-slate-300 flex items-center justify-between">
                      <span>Test Arguments (JSON)</span>
                      <button
                        onClick={handleTestExecute}
                        disabled={isExecuting}
                        className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-semibold transition-colors"
                      >
                        {isExecuting ? 'Running...' : 'Run'}
                      </button>
                    </div>
                    <textarea
                      value={selectedFn.testInputJson || '{\n  \n}'}
                      onChange={(e) => updateCurrentFn({ testInputJson: e.target.value })}
                      className="flex-1 p-3 bg-[#080c14] text-slate-100 font-mono text-xs outline-none resize-none leading-relaxed"
                      spellCheck={false}
                    />
                  </div>

                  {/* Right sub-panel: Test Output & Latency */}
                  <div className="w-1/2 flex flex-col bg-[#090d16]">
                    <div className="px-4 py-2 bg-[#0e1422] border-b border-[#182030] text-xs font-bold text-slate-300 flex items-center justify-between">
                      <span>Execution Result</span>
                      {executionResult && (
                        <div className="flex items-center gap-2 text-[11px] font-mono">
                          <span
                            className={
                              executionResult.success ? 'text-emerald-400' : 'text-red-400'
                            }
                          >
                            {executionResult.success ? 'Success' : 'Error'}
                          </span>
                          <span className="text-slate-400">
                            {executionResult.durationMs}ms
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 p-3 overflow-y-auto space-y-3 font-mono text-xs bg-[#080c14]">
                      {executionResult ? (
                        <>
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-500 uppercase">Return Value:</span>
                            <pre className="p-2.5 bg-[#0e1420] border border-[#1a2334] rounded text-emerald-300 whitespace-pre-wrap">
                              {typeof executionResult.output === 'object'
                                ? JSON.stringify(executionResult.output, null, 2)
                                : String(executionResult.output || executionResult.error)}
                            </pre>
                          </div>

                          {executionResult.stdout && (
                            <div className="space-y-1">
                              <span className="text-[10px] text-slate-500 uppercase">Stdout:</span>
                              <pre className="p-2 bg-[#0e1420] border border-[#1a2334] rounded text-slate-300 whitespace-pre-wrap">
                                {executionResult.stdout}
                              </pre>
                            </div>
                          )}

                          {executionResult.stderr && (
                            <div className="space-y-1">
                              <span className="text-[10px] text-red-400 uppercase">Stderr:</span>
                              <pre className="p-2 bg-[#1f0f15] border border-red-900/40 rounded text-red-300 whitespace-pre-wrap">
                                {executionResult.stderr}
                              </pre>
                            </div>
                          )}

                          <div className="text-[10px] text-slate-500 pt-2 border-t border-[#182030]">
                            Execution ID: {executionResult.executionId} • Executed at {executionResult.timestamp}
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-12 text-slate-500 text-xs">
                          Test runs are not available yet: executing user code requires a sandbox, which comes with the Function Studio rebuild.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
            Select a tool from the left collection to inspect and edit.
          </div>
        )}
      </div>
    </div>
  );
}
