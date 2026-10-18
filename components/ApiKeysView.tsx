'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ApiKey } from '@/lib/types';
import { INITIAL_API_KEYS, isDemoMode } from '@/lib/demo';
import { PLATFORM_SCOPES, PLATFORM_TOOL_DEFINITIONS } from '@/lib/mcp/tool-catalog';

const DEMO = isDemoMode();
// Mirrors DEFAULT_API_KEY_SCOPES in lib/auth/api-keys.ts (server-only module).
const DEFAULT_KEY_SCOPES = ['mcp:profiles:read', 'mcp:tasks:read'];

import {
  KeyRound,
  Plus,
  Shield,
  Copy,
  Check,
  Trash2,
  Lock,
  Sparkles,
  Layers,
  Settings2,
  AlertTriangle,
  Activity,
  Gauge,
  Clock,
  CheckCircle2,
  X,
  ExternalLink,
  Info,
  Sliders,
  Filter,
  Flame,
  Radio,
  Cpu,
  Bot,
  Terminal,
} from 'lucide-react';

interface McpToolScopeDefinition {
  id: string;
  name: string;
  category: string;
  description: string;
  requiredScope: string;
  isDestructive?: boolean;
}

/** Platform tools a workspace key can call over /api/mcp/platform (from lib/mcp/tool-catalog). */
export const PLATFORM_MCP_SCOPES_CATALOG: McpToolScopeDefinition[] = PLATFORM_TOOL_DEFINITIONS.map((tool) => ({
  id: tool.name,
  name: tool.title,
  category: tool.requiredScope.split(':')[1] === 'profiles' ? 'Profiles' : tool.requiredScope.split(':')[1] === 'tasks' ? 'Tasks' : 'API Keys',
  description: tool.description,
  requiredScope: tool.requiredScope,
  isDestructive: tool.sideEffect === 'write',
}));

const SCOPE_LABELS: Record<string, string> = {
  'mcp:profiles:read': 'Read profiles',
  'mcp:profiles:write': 'Create / edit / archive profiles',
  'mcp:tasks:read': 'Read scheduled tasks',
  'mcp:tasks:write': 'Schedule / cancel tasks',
  'mcp:keys:read': 'List API keys (no secrets)',
  'mcp:board:read': 'Read Supervisor Board tasks',
  'mcp:board:write': 'Post / claim / complete board tasks',
  'agent:run': 'Chat with Agent Studio instances',
  'mcp:connectors:invoke': 'Call connected-app tools (Google, web search; limited to the key\'s profile if set)',
  'mcp:search:invoke': 'Agents may search the web (web_search, billed to your LLM key)',
  'mcp:functions:invoke': 'Call deployed functions (fn_* tools; limited to the key\'s profile if set)',
  'agent:sessions:write': 'Create / edit Agent Studio instances',
  'mcp:agents:read': 'Orchestration: list agents and runs, wait, read outputs',
  'mcp:agents:write': 'Orchestration: create agents, run batches, message, cancel, stop runs',
  'mcp:agents:admin': 'Orchestration: resume runs after an organization-wide stop',
  'mcp:rooms:read': 'Live calls: read call context and transcripts',
  'mcp:rooms:write': 'Live calls: notes, ask the team',
  'mcp:calls:write': 'Place outbound phone calls',
};

/** An external orchestrator (e.g. an IDE agent) running teams of agents: no admin, no calls. */
const ORCHESTRATOR_PRESET = ['mcp:agents:read', 'mcp:agents:write', 'mcp:board:read', 'mcp:board:write', 'mcp:tasks:read', 'mcp:search:invoke'];

const SCOPE_CATEGORIES = Array.from(new Set(PLATFORM_MCP_SCOPES_CATALOG.map((t) => t.category)));

interface ApiKeyRecordResponse {
  id: string;
  name: string;
  key_prefix: string;
  environment: 'live' | 'test';
  scopes: string[];
  tools_whitelist: string[];
  rate_limit_rpm: number;
  last_used_at?: string | null;
  expires_at?: string | null;
  created_at: string;
}

function toApiKey(record: ApiKeyRecordResponse): ApiKey {
  return {
    id: record.id,
    name: record.name,
    key: '',
    prefix: `${record.key_prefix}…`,
    environment: record.environment,
    createdAt: record.created_at,
    lastUsedAt: record.last_used_at ? new Date(record.last_used_at).toLocaleString() : 'Never',
    scopes: record.scopes || [],
    toolsWhitelist: record.tools_whitelist || [],
    rateLimitMax: record.rate_limit_rpm,
  };
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body?.code === 'NO_ORGANIZATION') return 'Finish onboarding to create an organization first.';
    return body?.error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export const ApiKeysView: React.FC = () => {
  const [keys, setKeys] = useState<ApiKey[]>(DEMO ? INITIAL_API_KEYS : []);
  const [keysLoading, setKeysLoading] = useState(!DEMO);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<{ name: string; rawKey: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    if (DEMO) return;
    setKeysLoading(true);
    try {
      const res = await fetch('/api/v1/api-keys', { cache: 'no-store' });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      setKeys((data.keys || []).map(toApiKey));
      setKeysError(null);
    } catch (err: any) {
      setKeysError(err?.message || 'Could not load API keys');
    } finally {
      setKeysLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  // Key creation state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyEnvironment, setNewKeyEnvironment] = useState<'live' | 'test'>('live');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(DEFAULT_KEY_SCOPES);
  const [newKeyTools, setNewKeyTools] = useState<string[]>([]);
  const [newKeyExpiryDays, setNewKeyExpiryDays] = useState<number | null>(90);
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Key Edit Scopes Dialog state
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [tempToolsWhitelist, setTempToolsWhitelist] = useState<string[]>([]);
  const [tempScopes, setTempScopes] = useState<string[]>([]);
  const [scopeCategoryFilter, setScopeCategoryFilter] = useState<string>('ALL');
  const [editError, setEditError] = useState<string | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const handleOpenEditScopes = (key: ApiKey) => {
    setEditingKey(key);
    setEditError(null);
    setTempToolsWhitelist(key.toolsWhitelist ? [...key.toolsWhitelist] : []);
    setTempScopes(key.scopes ? [...key.scopes] : []);
  };

  const handleSaveEditedScopes = async () => {
    if (!editingKey) return;
    if (DEMO) {
      setKeys((prev) =>
        prev.map((k) => (k.id === editingKey.id ? { ...k, toolsWhitelist: tempToolsWhitelist, scopes: tempScopes } : k))
      );
      setEditingKey(null);
      return;
    }
    if (tempScopes.length === 0) {
      setEditError('Grant at least one scope, or revoke the key instead.');
      return;
    }
    try {
      const res = await fetch(`/api/v1/api-keys/${editingKey.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopes: tempScopes, toolsWhitelist: tempToolsWhitelist }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const { apiKey } = await res.json();
      setKeys((prev) => prev.map((k) => (k.id === apiKey.id ? toApiKey(apiKey) : k)));
      setEditingKey(null);
    } catch (err: any) {
      setEditError(err?.message || 'Could not update key');
    }
  };

  const handleToggleScope = (toolId: string) => {
    setTempToolsWhitelist((prev) => toggle(prev, toolId));
  };

  const handleSelectAllScopes = () => {
    setTempToolsWhitelist(PLATFORM_MCP_SCOPES_CATALOG.map((t) => t.id));
  };

  const handleClearAllScopes = () => {
    setTempToolsWhitelist([]);
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm('Revoke this secret API key? Any server or MCP client using it will be blocked immediately.')) return;
    if (DEMO) {
      setKeys((prev) => prev.filter((k) => k.id !== keyId));
      return;
    }
    try {
      const res = await fetch(`/api/v1/api-keys/${keyId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res));
      setKeys((prev) => prev.filter((k) => k.id !== keyId));
    } catch (err: any) {
      setKeysError(err?.message || 'Could not revoke key');
    }
  };

  const resetCreateForm = () => {
    setNewKeyName('');
    setNewKeyScopes(DEFAULT_KEY_SCOPES);
    setNewKeyTools([]);
    setNewKeyExpiryDays(90);
    setCreateError(null);
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim() || newKeyScopes.length === 0) return;
    if (DEMO) {
      setCreateError('Key creation is disabled in demo mode.');
      return;
    }
    setIsCreatingKey(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyName.trim(),
          environment: newKeyEnvironment,
          scopes: newKeyScopes,
          toolsWhitelist: newKeyTools,
          expiresInDays: newKeyExpiryDays,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const { apiKey } = await res.json();
      setKeys((prev) => [toApiKey(apiKey), ...prev]);
      setRevealedKey({ name: apiKey.name, rawKey: apiKey.rawKey });
      setShowCreateModal(false);
      resetCreateForm();
    } catch (err: any) {
      setCreateError(err?.message || 'Could not create key');
    } finally {
      setIsCreatingKey(false);
    }
  };

  const filteredCatalogForDialog =
    scopeCategoryFilter === 'ALL'
      ? PLATFORM_MCP_SCOPES_CATALOG
      : PLATFORM_MCP_SCOPES_CATALOG.filter((t) => t.category === scopeCategoryFilter);


  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
              API Keys & Security Architecture
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700 font-semibold tracking-wider uppercase">
              Multi-Tenant RBAC
            </span>
          </div>
          <p className="text-zinc-400 text-sm">
            Workspace authorization for long-lived server backends (<code className="text-emerald-400 font-mono">ctx_live_...</code>) with tool-level whitelist enforcement and rate telemetry, plus short-lived scoped Context Tokens (<code className="text-cyan-400 font-mono">JWT</code>) for client widgets.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition-all shadow-md shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Create Workspace Secret</span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* SECTION 1: WORKSPACE SECRET KEYS WITH TOOL WHITELIST & RATE TELEMETRY */}
      {/* ==================================================================== */}
      <div className="p-6 rounded-xl bg-[#11151e] border border-zinc-800 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white uppercase font-mono tracking-wider">
              Workspace Secret Keys (Server Backends)
            </h2>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-zinc-500">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              <span>MCP Scope Whitelists Active</span>
            </span>
            <span>•</span>
            <span>{keys.length} Active Keys</span>
          </div>
        </div>

        {keysError && (
          <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-xs font-mono text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{keysError}</span>
          </div>
        )}
        {keysLoading && <p className="text-xs font-mono text-zinc-500">Loading keys…</p>}
        {!keysLoading && !keysError && keys.length === 0 && (
          <p className="text-xs font-mono text-zinc-500">
            No keys yet. Create one to connect an MCP client or call the API from a server.
          </p>
        )}

        <div className="divide-y divide-zinc-800/80">
          {keys.map((k) => {
            const max = k.rateLimitMax ?? 60;
            const whitelist = k.toolsWhitelist || [];
            const reachableTools = PLATFORM_MCP_SCOPES_CATALOG.filter(
              (t) => k.scopes.includes('*') || k.scopes.includes(t.requiredScope)
            ).filter((t) => whitelist.length === 0 || whitelist.includes(t.id));

            return (
              <div key={k.id} className="py-5 space-y-3.5">
                {/* Top line: Name, Env, and Actions */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-bold text-white">{k.name}</span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase ${
                          k.environment === 'live'
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/70'
                            : 'bg-amber-950/80 text-amber-400 border border-amber-800/70'
                        }`}
                      >
                        {k.environment}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-zinc-400">
                      <span className="text-zinc-300 font-semibold">{k.prefix}</span>
                      <span>•</span>
                      <span>Created {new Date(k.createdAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>Last used {k.lastUsedAt}</span>
                    </div>
                  </div>

                  {/* Right Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleOpenEditScopes(k)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/70 hover:bg-indigo-900/80 border border-indigo-700/80 text-indigo-200 text-xs font-mono transition-colors font-medium"
                      title="Configure allowed MCP tool permissions"
                    >
                      <Settings2 className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Edit Scopes</span>
                    </button>

                    <button
                      onClick={() => handleRevokeKey(k.id)}
                      className="p-1.5 rounded-lg bg-zinc-900 hover:bg-rose-950/80 border border-zinc-800 hover:border-rose-800 text-zinc-400 hover:text-rose-400 transition-colors"
                      title="Revoke key immediately"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Sub-grid: Tool Scopes Whitelist Badges & Rate Limit Telemetry */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1">
                  {/* Tool Scope Whitelist Matrix (8 cols) */}
                  <div className="lg:col-span-8 p-3 rounded-lg bg-[#0b0e15] border border-zinc-800/80 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-zinc-400 font-semibold flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Scopes ({k.scopes.length}) · Reachable tools ({reachableTools.length})</span>
                      </span>
                      <button
                        onClick={() => handleOpenEditScopes(k)}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300"
                      >
                        Modify permissions →
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {k.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono border bg-indigo-950/60 text-indigo-200 border-indigo-800/60"
                          title={SCOPE_LABELS[scope] || scope}
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {reachableTools.length > 0 ? (
                        reachableTools.map(({ id: toolId }) => {
                          const toolMeta = PLATFORM_MCP_SCOPES_CATALOG.find((t) => t.id === toolId);
                          const isDestructive = !!toolMeta?.isDestructive;
                          return (
                            <span
                              key={toolId}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border ${
                                isDestructive
                                  ? 'bg-rose-950/60 text-rose-300 border-rose-800/60'
                                  : 'bg-zinc-900 text-zinc-300 border-zinc-700/80'
                              }`}
                              title={toolMeta?.description || toolId}
                            >
                              <span className="text-zinc-500 font-bold">#</span>
                              <span>{toolId}</span>
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-[11px] font-mono text-rose-400 italic">
                          No tools reachable: the tool whitelist excludes every tool these scopes allow.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Rate Limit Telemetry Progression Bar (4 cols) */}
                  <div className="lg:col-span-4 p-3 rounded-lg bg-[#0b0e15] border border-zinc-800/80 flex flex-col justify-between space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-zinc-400 font-semibold flex items-center gap-1.5">
                        <Gauge className="w-3.5 h-3.5 text-amber-400" />
                        <span>Rate Limit</span>
                      </span>
                      <span className="font-bold text-emerald-400">{max} req/min</span>
                    </div>
                    <p className="text-[10px] font-mono text-zinc-500">
                      Burst limit enforced per server instance.
                      {whitelist.length === 0 ? ' No tool whitelist: every tool its scopes allow.' : ` Whitelist narrows to ${whitelist.length} tool(s).`}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* DIALOG 1: EDIT SCOPES DIALOG (FINE-GRAINED MCP TOOLS WHITELIST) */}
      {/* ==================================================================== */}
      {editingKey && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4">
          <div className="my-auto w-full max-w-2xl bg-[#0e131e] border border-zinc-700 rounded-2xl p-6 space-y-5 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Dialog Header */}
            <div className="flex items-start justify-between border-b border-zinc-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-base font-bold text-white">
                    Edit Key Scopes & Tool Whitelist
                  </h3>
                </div>
                <p className="text-xs text-zinc-400 mt-1 font-mono">
                  Key: <strong className="text-white">{editingKey.name}</strong> ({editingKey.prefix})
                </p>
              </div>

              <button
                onClick={() => setEditingKey(null)}
                className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scopes */}
            <div className="space-y-2">
              <p className="text-[11px] font-mono font-semibold uppercase text-zinc-400">Scopes</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {PLATFORM_SCOPES.map((scope) => (
                  <label key={scope} className="flex items-center gap-2 text-xs font-mono text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tempScopes.includes(scope) || tempScopes.includes('*')}
                      disabled={tempScopes.includes('*')}
                      onChange={() => setTempScopes((prev) => toggle(prev, scope))}
                      className="rounded bg-zinc-900 border-zinc-700 text-indigo-500"
                    />
                    <span title={scope}>{SCOPE_LABELS[scope] || scope}</span>
                  </label>
                ))}
              </div>
              {tempScopes.includes('*') && (
                <button
                  type="button"
                  onClick={() => setTempScopes(PLATFORM_SCOPES)}
                  className="text-[11px] font-mono text-amber-400 hover:text-amber-300"
                >
                  This key has full access (*). Switch to explicit scopes →
                </button>
              )}
              <p className="text-[11px] font-mono text-zinc-500 pt-1">
                Tool whitelist (optional): leave empty to allow every tool the scopes permit, or tick tools to narrow further.
              </p>
            </div>

            {/* Quick Actions & Filter */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              {/* Category Filter */}
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-zinc-400">Category:</span>
                <select
                  value={scopeCategoryFilter}
                  onChange={(e) => setScopeCategoryFilter(e.target.value)}
                  className="bg-[#121624] border border-zinc-700 rounded px-2.5 py-1 text-zinc-200"
                >
                  <option value="ALL">All Categories</option>
                  {SCOPE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Select/Clear buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllScopes}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px]"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleClearAllScopes}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px]"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Scopes Checklist Body */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {filteredCatalogForDialog.map((tool) => {
                const isChecked = tempToolsWhitelist.includes(tool.id);
                return (
                  <label
                    key={tool.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      isChecked
                        ? 'bg-indigo-950/40 border-indigo-700/80'
                        : 'bg-[#090c13] border-zinc-800/80 hover:border-zinc-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleScope(tool.id)}
                      className="mt-1 w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-indigo-500 focus:ring-indigo-500"
                    />

                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-white">
                            {tool.id}
                          </span>
                          <span className="text-[10px] font-mono text-indigo-400">{tool.requiredScope}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                            {tool.category}
                          </span>
                        </div>
                        {tool.isDestructive && (
                          <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-rose-950 text-rose-400 border border-rose-800">
                            Writes data
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                        {tool.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Dialog Footer */}
            <div className="border-t border-zinc-800 pt-4 flex items-center justify-between">
              <span className="text-xs font-mono text-zinc-400">
                Authorized:{' '}
                <strong className="text-indigo-400">{tempToolsWhitelist.length}</strong> of{' '}
                {PLATFORM_MCP_SCOPES_CATALOG.length} tools whitelisted
                {tempToolsWhitelist.length === 0 && ' (no narrowing)'}
              </span>
              {editError && <span className="text-xs font-mono text-rose-400">{editError}</span>}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingKey(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditedScopes}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: CREATE WORKSPACE KEY MODAL */}
      {/* ==================================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4">
          <div className="my-auto w-full max-w-lg bg-[#0e131e] border border-zinc-700 rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-white">Create Workspace Secret Key</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-1">
                  Key Description / Application Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Production Next.js Microservice"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full bg-[#090b0f] border border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-1">
                  Environment
                </label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="radio"
                      name="env"
                      checked={newKeyEnvironment === 'live'}
                      onChange={() => setNewKeyEnvironment('live')}
                      className="text-emerald-500"
                    />
                    <span>Production (ctx_live_...)</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="radio"
                      name="env"
                      checked={newKeyEnvironment === 'test'}
                      onChange={() => setNewKeyEnvironment('test')}
                      className="text-amber-500"
                    />
                    <span>Staging / Dev (ctx_test_...)</span>
                  </label>
                </div>
              </div>

              {/* Scopes */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-mono text-zinc-300 block">Scopes</label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewKeyScopes(ORCHESTRATOR_PRESET);
                      setNewKeyExpiryDays(30);
                      if (!newKeyName.trim()) setNewKeyName('Orchestrator');
                    }}
                    className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300"
                    title="Agents read/write + Board + tasks read; no resume, no calls; expires in 30 days"
                  >
                    Use Orchestrator preset
                  </button>
                </div>
                <div className="space-y-1.5 p-2 rounded-lg bg-[#07090f] border border-zinc-800">
                  {PLATFORM_SCOPES.map((scope) => (
                    <label key={scope} className="flex items-center gap-2 text-xs font-mono text-zinc-300 cursor-pointer hover:text-white">
                      <input
                        type="checkbox"
                        checked={newKeyScopes.includes(scope)}
                        onChange={() => setNewKeyScopes((prev) => toggle(prev, scope))}
                        className="rounded bg-zinc-900 border-zinc-700 text-emerald-500"
                      />
                      <span>{SCOPE_LABELS[scope] || scope}</span>
                      <span className="text-[10px] text-zinc-500">{scope}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Optional tool narrowing */}
              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-1.5">
                  Restrict to specific tools (optional)
                </label>
                <div className="max-h-32 overflow-y-auto space-y-1.5 p-2 rounded-lg bg-[#07090f] border border-zinc-800">
                  {PLATFORM_MCP_SCOPES_CATALOG.filter((t) => newKeyScopes.includes(t.requiredScope)).map((tool) => (
                    <label
                      key={tool.id}
                      className="flex items-center gap-2 text-xs font-mono text-zinc-300 cursor-pointer hover:text-white"
                    >
                      <input
                        type="checkbox"
                        checked={newKeyTools.includes(tool.id)}
                        onChange={() => setNewKeyTools((prev) => toggle(prev, tool.id))}
                        className="rounded bg-zinc-900 border-zinc-700 text-emerald-500"
                      />
                      <span>{tool.id}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[10px] font-mono text-zinc-500 mt-1">
                  {newKeyTools.length === 0 ? 'None ticked: all tools the scopes allow.' : `${newKeyTools.length} tool(s) selected.`}
                </p>
              </div>

              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-1">Expires</label>
                <select
                  value={newKeyExpiryDays ?? 'never'}
                  onChange={(e) => setNewKeyExpiryDays(e.target.value === 'never' ? null : Number(e.target.value))}
                  className="bg-[#090b0f] border border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-white"
                >
                  <option value={30}>In 30 days</option>
                  <option value={90}>In 90 days</option>
                  <option value={365}>In 1 year</option>
                  <option value="never">Never</option>
                </select>
              </div>

              {createError && <p className="text-xs font-mono text-rose-400">{createError}</p>}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => { setShowCreateModal(false); resetCreateForm(); }}
                className="px-3.5 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateKey}
                disabled={!newKeyName.trim() || newKeyScopes.length === 0 || isCreatingKey}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs disabled:opacity-50"
              >
                {isCreatingKey ? 'Generating…' : 'Generate Key'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ==================================================================== */}
      {/* MODAL 3: ONE-TIME SECRET REVEAL */}
      {/* ==================================================================== */}
      {revealedKey && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4">
          <div className="my-auto w-full max-w-lg bg-[#0e131e] border border-emerald-800/70 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <h3 className="text-base font-bold text-white">Key created: {revealedKey.name}</h3>
            </div>
            <p className="text-xs text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Copy it now. Only a hash is stored, so this secret cannot be shown again.
            </p>
            <p className="text-emerald-200 bg-black/60 p-3 rounded border border-zinc-800 font-mono text-xs break-all select-all">
              {revealedKey.rawKey}
            </p>
            <p className="text-[11px] font-mono text-zinc-400">
              Use it as <code className="text-emerald-400">Authorization: Bearer …</code>. The Platform MCP tab generates ready-to-paste client configs.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => handleCopy('revealed', revealedKey.rawKey)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono"
              >
                {copiedId === 'revealed' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedId === 'revealed' ? 'Copied' : 'Copy key'}</span>
              </button>
              <button
                onClick={() => setRevealedKey(null)}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs"
              >
                I saved it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
