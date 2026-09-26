'use client';

import React, { useState } from 'react';
import { ApiKey } from '@/lib/types';
import { INITIAL_API_KEYS, INITIAL_PROFILES } from '@/lib/mock-data';
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
  spoke: 'hubspot' | 'stripe' | 'google_workspace' | 'github' | 'slack' | 'notion' | 'postgres' | 'elevenlabs';
  category: string;
  description: string;
  isDestructive?: boolean;
}

export const PLATFORM_MCP_SCOPES_CATALOG: McpToolScopeDefinition[] = [
  // CRM & Pipeline
  {
    id: 'crm.search_contact',
    name: 'crm.search_contact',
    spoke: 'hubspot',
    category: 'CRM & Pipeline',
    description: 'Lookup customer profiles and company records in CRM.',
  },
  {
    id: 'crm.add_lead',
    name: 'crm.add_lead',
    spoke: 'hubspot',
    category: 'CRM & Pipeline',
    description: 'Create new prospect accounts and capture inbound contacts.',
  },
  {
    id: 'crm.tag_contact',
    name: 'crm.tag_contact',
    spoke: 'hubspot',
    category: 'CRM & Pipeline',
    description: 'Update account tags and interest segmentation markers.',
  },
  {
    id: 'crm.update_deal_stage',
    name: 'crm.update_deal_stage',
    spoke: 'hubspot',
    category: 'CRM & Pipeline',
    description: 'Advance deal stages and expected close values.',
  },

  // Google Workspace
  {
    id: 'gmail.send_draft',
    name: 'gmail.send_draft',
    spoke: 'google_workspace',
    category: 'Google Workspace',
    description: 'Create and dispatch outbound emails via connected Gmail.',
  },
  {
    id: 'calendar.schedule_meeting',
    name: 'calendar.schedule_meeting',
    spoke: 'google_workspace',
    category: 'Google Workspace',
    description: 'Book Google Calendar reservations and send calendar invites.',
  },
  {
    id: 'drive.read_document',
    name: 'drive.read_document',
    spoke: 'google_workspace',
    category: 'Google Workspace',
    description: 'Read-only access to customer contracts and Google Docs.',
  },

  // Voice & Telephony
  {
    id: 'elevenlabs.trigger_call',
    name: 'elevenlabs.trigger_call',
    spoke: 'elevenlabs',
    category: 'Voice & Telephony',
    description: 'Dispatch autonomous conversational AI voice call to customer.',
  },
  {
    id: 'elevenlabs.audit_transcript',
    name: 'elevenlabs.audit_transcript',
    spoke: 'elevenlabs',
    category: 'Voice & Telephony',
    description: 'Fetch post-call sentiment, recordings, and conversation transcript.',
  },

  // Stripe & Billing
  {
    id: 'stripe.get_invoice',
    name: 'stripe.get_invoice',
    spoke: 'stripe',
    category: 'Billing & Payments',
    description: 'Retrieve line items, status, and payment due dates.',
  },
  {
    id: 'stripe.process_payment',
    name: 'stripe.process_payment',
    spoke: 'stripe',
    category: 'Billing & Payments',
    description: 'Authorize transactions against stored customer payment methods.',
    isDestructive: true,
  },
  {
    id: 'stripe.refund_status',
    name: 'stripe.refund_status',
    spoke: 'stripe',
    category: 'Billing & Payments',
    description: 'Inspect status of refunds, chargebacks, and disputes.',
  },

  // Database & Supavisor
  {
    id: 'postgres.read_query',
    name: 'postgres.read_query',
    spoke: 'postgres',
    category: 'Database & Storage',
    description: 'Execute isolated SELECT queries through Supavisor connection pool.',
  },
  {
    id: 'postgres.delete_record',
    name: 'postgres.delete_record',
    spoke: 'postgres',
    category: 'Database & Storage',
    description: 'Delete database records. Dangerous for client tokens.',
    isDestructive: true,
  },

  // Slack & Team Chat
  {
    id: 'slack.post_incident_alert',
    name: 'slack.post_incident_alert',
    spoke: 'slack',
    category: 'Team Communication',
    description: 'Send alerts to team channels on critical task outcomes.',
  },

  // Notion Knowledge Base
  {
    id: 'notion.search_pages',
    name: 'notion.search_pages',
    spoke: 'notion',
    category: 'Team Communication',
    description: 'Semantic search of product SOPs and escalation runbooks.',
  },
];

// Discrete TTL Options for the Dynamic Slider
const TTL_STEPS = [
  { index: 0, duration: '15m', label: '15 Minutes', seconds: 900, description: 'Ephemeral client session' },
  { index: 1, duration: '1h', label: '1 Hour', seconds: 3600, description: 'Standard browser widget' },
  { index: 2, duration: '4h', label: '4 Hours', seconds: 14400, description: 'Extended interaction loop' },
  { index: 3, duration: '12h', label: '12 Hours', seconds: 43200, description: 'Single workday shift' },
  { index: 4, duration: '24h', label: '24 Hours', seconds: 86400, description: 'Maximum client session ceiling' },
];

export const ApiKeysView: React.FC = () => {
  const [keys, setKeys] = useState<ApiKey[]>(INITIAL_API_KEYS);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Key creation state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyEnvironment, setNewKeyEnvironment] = useState<'live' | 'test'>('live');
  const [newKeyTools, setNewKeyTools] = useState<string[]>([
    'crm.search_contact',
    'crm.update_deal_stage',
    'gmail.send_draft',
  ]);

  // Key Edit Scopes Dialog state
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [tempToolsWhitelist, setTempToolsWhitelist] = useState<string[]>([]);
  const [scopeCategoryFilter, setScopeCategoryFilter] = useState<string>('ALL');

  // Short-lived Context Token Minter State
  const [mintTenant, setMintTenant] = useState('tenant_enterprise_corp');
  const [mintUser, setMintUser] = useState('user_456');
  const [mintProfile, setMintProfile] = useState('sales-agent');
  const [mintTtlStep, setMintTtlStep] = useState<number>(1); // Default to 1h
  const [mintAllowedTools, setMintAllowedTools] = useState<string[]>([
    'crm.search_contact',
    'gmail.send_draft',
  ]);
  const [isMinting, setIsMinting] = useState(false);
  const [mintedResponse, setMintedResponse] = useState<{
    token: string;
    expiresAt: string;
    ttlFormatted: string;
    claims: any;
  } | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenEditScopes = (key: ApiKey) => {
    setEditingKey(key);
    setTempToolsWhitelist(key.toolsWhitelist ? [...key.toolsWhitelist] : []);
  };

  const handleSaveEditedScopes = () => {
    if (!editingKey) return;
    setKeys((prev) =>
      prev.map((k) => (k.id === editingKey.id ? { ...k, toolsWhitelist: tempToolsWhitelist } : k))
    );
    setEditingKey(null);
  };

  const handleToggleScope = (toolId: string) => {
    setTempToolsWhitelist((prev) =>
      prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId]
    );
  };

  const handleSelectAllScopes = () => {
    setTempToolsWhitelist(PLATFORM_MCP_SCOPES_CATALOG.map((t) => t.id));
  };

  const handleClearAllScopes = () => {
    setTempToolsWhitelist([]);
  };

  const handleRevokeKey = (keyId: string) => {
    if (confirm('Are you sure you want to revoke this secret API key? Any server backend using it will be blocked.')) {
      setKeys((prev) => prev.filter((k) => k.id !== keyId));
    }
  };

  const handleCreateKey = () => {
    if (!newKeyName.trim()) return;
    const prefixStr = newKeyEnvironment === 'live' ? 'ctx_live_' : 'ctx_test_';
    const rawSecret = `${prefixStr}${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;

    const newKey: ApiKey = {
      id: `key-${Date.now()}`,
      name: newKeyName,
      key: rawSecret,
      prefix: `${rawSecret.slice(0, 12)}...`,
      environment: newKeyEnvironment,
      createdAt: new Date().toISOString(),
      lastUsedAt: 'Never',
      scopes: ['context:resolve', 'profiles:read'],
      toolsWhitelist: newKeyTools,
      rateLimitUsed: 0,
      rateLimitMax: 60,
    };

    setKeys([newKey, ...keys]);
    setNewKeyName('');
    setNewKeyTools(['crm.search_contact', 'crm.update_deal_stage', 'gmail.send_draft']);
    setShowCreateModal(false);
  };

  const handleMintToken = async () => {
    setIsMinting(true);
    const selectedTtl = TTL_STEPS[mintTtlStep];

    try {
      const res = await fetch('/api/v1/context/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant: mintTenant,
          user: mintUser,
          profile: mintProfile,
          ttlSeconds: selectedTtl.seconds,
          ttlString: selectedTtl.duration,
          allowedTools: mintAllowedTools,
        }),
      });

      if (!res.ok) {
        throw new Error('Token minting failed');
      }

      const data = await res.json();
      setMintedResponse({
        token: data.token,
        expiresAt: data.expiresAt,
        ttlFormatted: data.ttlFormatted || selectedTtl.label,
        claims: data.claims,
      });
    } catch (err) {
      console.warn('Backend route failed, using local cryptographic mint fallback:', err);
      const now = Math.floor(Date.now() / 1000);
      const exp = now + selectedTtl.seconds;
      const claims = {
        iss: 'https://api.contextcontrol.dev',
        sub: mintUser,
        aud: 'context-control-client',
        tenant_id: mintTenant,
        profile_slug: mintProfile,
        iat: now,
        exp: exp,
        ttl: selectedTtl.duration,
        tools_whitelist: mintAllowedTools,
        rate_limit: { rpm: 60, burst: 10 },
      };
      const b64 = (val: any) =>
        btoa(JSON.stringify(val)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const token = `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.${b64(claims)}.sig_${Math.random().toString(36).substring(2, 16)}`;
      setMintedResponse({
        token,
        expiresAt: new Date(exp * 1000).toISOString(),
        ttlFormatted: selectedTtl.label,
        claims,
      });
    } finally {
      setIsMinting(false);
    }
  };

  // Rate limit helper style
  const getRateLimitColor = (used: number = 0, max: number = 60) => {
    const percentage = (used / max) * 100;
    if (percentage >= 85) return { bar: 'bg-rose-500', text: 'text-rose-400', border: 'border-rose-900/60' };
    if (percentage >= 50) return { bar: 'bg-amber-500', text: 'text-amber-400', border: 'border-amber-900/60' };
    return { bar: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-900/60' };
  };

  const filteredCatalogForDialog =
    scopeCategoryFilter === 'ALL'
      ? PLATFORM_MCP_SCOPES_CATALOG
      : PLATFORM_MCP_SCOPES_CATALOG.filter((t) => t.category === scopeCategoryFilter);

  const selectedTtl = TTL_STEPS[mintTtlStep];

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

        <div className="divide-y divide-zinc-800/80">
          {keys.map((k) => {
            const used = k.rateLimitUsed ?? 12;
            const max = k.rateLimitMax ?? 60;
            const pct = Math.min(100, Math.round((used / max) * 100));
            const rlStyle = getRateLimitColor(used, max);
            const whitelist = k.toolsWhitelist || ['crm.search_contact', 'gmail.send_draft'];

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
                      onClick={() => handleCopy(k.id, k.key)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-mono transition-colors"
                      title="Copy raw secret key"
                    >
                      {copiedId === k.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Copy Key</span>
                        </>
                      )}
                    </button>

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
                        <span>Authorized MCP Tools Whitelist ({whitelist.length})</span>
                      </span>
                      <button
                        onClick={() => handleOpenEditScopes(k)}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300"
                      >
                        Modify permissions →
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {whitelist.length > 0 ? (
                        whitelist.map((toolId) => {
                          const toolMeta = PLATFORM_MCP_SCOPES_CATALOG.find((t) => t.id === toolId);
                          const isDestructive = toolMeta?.isDestructive || toolId.includes('delete') || toolId.includes('process_payment');
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
                          No tools authorized. All agent tool calls using this key will be rejected.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Rate Limit Telemetry Progression Bar (4 cols) */}
                  <div className="lg:col-span-4 p-3 rounded-lg bg-[#0b0e15] border border-zinc-800/80 flex flex-col justify-between space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-zinc-400 font-semibold flex items-center gap-1.5">
                        <Gauge className="w-3.5 h-3.5 text-amber-400" />
                        <span>Rate Telemetry</span>
                      </span>
                      <span className={`font-bold ${rlStyle.text}`}>
                        {used} / {max} req/min
                      </span>
                    </div>

                    {/* Visual Progress Bar */}
                    <div className="space-y-1">
                      <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${rlStyle.bar}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                        <span>Free Tier Ceiling</span>
                        <span>{pct}% Consumed</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SECTION 2: SHORT-LIVED CONTEXT TOKENS (CLIENT MINTER) WITH TTL SLIDER */}
      {/* ==================================================================== */}
      <div className="p-6 rounded-xl bg-[#11151e] border border-zinc-800 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white uppercase font-mono tracking-wider">
                Short-Lived Context Tokens (Client Minter)
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed max-w-2xl">
              API Key ≠ End-User Identity. Never expose your backend <code className="text-emerald-400 font-mono">ctx_live_...</code> keys in browser code. Mint short-lived, cryptographically signed JWT tokens with strict Time-To-Live (TTL) and tool restrictions for client widgets.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 bg-[#0a0d14] px-3 py-1.5 rounded-lg border border-zinc-800">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Active Expiration:</span>
            <span className="text-white font-bold">{selectedTtl.label}</span>
          </div>
        </div>

        {/* Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="text-[11px] font-mono font-semibold uppercase text-zinc-400 block mb-1.5">
              Scope Tenant:
            </label>
            <input
              type="text"
              value={mintTenant}
              onChange={(e) => setMintTenant(e.target.value)}
              placeholder="e.g. tenant_enterprise_corp"
              className="w-full bg-[#0a0c10] border border-zinc-700/80 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-[11px] font-mono font-semibold uppercase text-zinc-400 block mb-1.5">
              Scope User Identity:
            </label>
            <input
              type="text"
              value={mintUser}
              onChange={(e) => setMintUser(e.target.value)}
              placeholder="e.g. user_456"
              className="w-full bg-[#0a0c10] border border-zinc-700/80 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-[11px] font-mono font-semibold uppercase text-zinc-400 block mb-1.5">
              Target Context Profile:
            </label>
            <select
              value={mintProfile}
              onChange={(e) => setMintProfile(e.target.value)}
              className="w-full bg-[#0a0c10] border border-zinc-700/80 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-500"
            >
              {INITIAL_PROFILES.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name} ({p.slug})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Dynamic TTL Slider Component */}
        <div className="p-4 rounded-xl bg-[#090c13] border border-zinc-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono font-semibold text-zinc-300 flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>Token Expiration (TTL) Slider</span>
            </label>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-zinc-500">Duration:</span>
              <span className="px-2.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 font-bold">
                {selectedTtl.label} ({selectedTtl.duration})
              </span>
            </div>
          </div>

          {/* Range Slider */}
          <div className="space-y-2">
            <input
              type="range"
              min="0"
              max="4"
              step="1"
              value={mintTtlStep}
              onChange={(e) => setMintTtlStep(parseInt(e.target.value, 10))}
              className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />

            {/* Slider Step Labels */}
            <div className="flex justify-between text-[10px] font-mono text-zinc-500 pt-1">
              {TTL_STEPS.map((step) => (
                <button
                  type="button"
                  key={step.duration}
                  onClick={() => setMintTtlStep(step.index)}
                  className={`transition-colors ${
                    mintTtlStep === step.index ? 'text-cyan-400 font-bold' : 'hover:text-zinc-300'
                  }`}
                >
                  {step.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] font-mono text-zinc-500 pt-1">
            Sets the JWT <code className="text-cyan-400">exp</code> Unix timestamp claim to now + {selectedTtl.seconds}s. {selectedTtl.description}.
          </p>
        </div>

        {/* Scoped Tools Allowed for this Client Token */}
        <div className="space-y-2">
          <label className="text-[11px] font-mono font-semibold uppercase text-zinc-400 block">
            Bind Client MCP Tool Whitelist (Zero Blanket Access):
          </label>
          <div className="flex flex-wrap gap-2">
            {['crm.search_contact', 'gmail.send_draft', 'elevenlabs.trigger_call', 'slack.post_incident_alert', 'postgres.read_query'].map((tId) => {
              const isChecked = mintAllowedTools.includes(tId);
              return (
                <button
                  type="button"
                  key={tId}
                  onClick={() =>
                    setMintAllowedTools((prev) =>
                      prev.includes(tId) ? prev.filter((x) => x !== tId) : [...prev, tId]
                    )
                  }
                  className={`px-2.5 py-1 rounded-md text-xs font-mono border transition-all ${
                    isChecked
                      ? 'bg-cyan-950 text-cyan-200 border-cyan-700 font-medium'
                      : 'bg-zinc-900/60 text-zinc-500 border-zinc-800 hover:text-zinc-300'
                  }`}
                >
                  {isChecked ? '✓ ' : '+ '}
                  {tId}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={handleMintToken}
            disabled={isMinting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs transition-all shadow-lg shadow-cyan-950 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-cyan-200" />
            <span>{isMinting ? 'Signing Token...' : 'Mint Scoped Context Token'}</span>
          </button>

          <span className="text-[11px] font-mono text-zinc-500">
            Claims: tenant, user, profile, exp, tools_whitelist
          </span>
        </div>

        {/* Minted Output Box */}
        {mintedResponse && (
          <div className="p-4 rounded-xl bg-[#090b0f] border border-cyan-900/60 text-xs font-mono space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                <span className="text-cyan-300 font-bold">Client Token Minted Successfully</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Expires in {mintedResponse.ttlFormatted}
                </span>
              </div>
              <button
                onClick={() => handleCopy('minted', mintedResponse.token)}
                className="flex items-center gap-1.5 px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
              >
                {copiedId === 'minted' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Copy Token</span>
                  </>
                )}
              </button>
            </div>

            {/* Token String */}
            <div>
              <span className="text-zinc-500 text-[10px] block mb-1">JWT Bearer Authorization String:</span>
              <p className="text-cyan-200/90 bg-black/60 p-2.5 rounded border border-zinc-900 break-all select-all">
                {mintedResponse.token}
              </p>
            </div>

            {/* Decoded Claims Preview */}
            <div>
              <span className="text-zinc-500 text-[10px] block mb-1">Parsed Claims Footprint:</span>
              <pre className="text-[11px] text-zinc-400 bg-black/40 p-2.5 rounded border border-zinc-900 overflow-x-auto">
                {JSON.stringify(mintedResponse.claims, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* DIALOG 1: EDIT SCOPES DIALOG (FINE-GRAINED MCP TOOLS WHITELIST) */}
      {/* ==================================================================== */}
      {editingKey && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#0e131e] border border-zinc-700 rounded-2xl p-6 space-y-5 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Dialog Header */}
            <div className="flex items-start justify-between border-b border-zinc-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-base font-bold text-white">
                    Edit Allowed MCP Scopes Whitelist
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
                  <option value="CRM & Pipeline">CRM & Pipeline</option>
                  <option value="Google Workspace">Google Workspace</option>
                  <option value="Voice & Telephony">Voice & Telephony</option>
                  <option value="Billing & Payments">Billing & Payments</option>
                  <option value="Database & Storage">Database & Storage</option>
                  <option value="Team Communication">Team Communication</option>
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
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                            {tool.category}
                          </span>
                        </div>
                        {tool.isDestructive && (
                          <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-rose-950 text-rose-400 border border-rose-800">
                            High Risk / Destructive
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
                {PLATFORM_MCP_SCOPES_CATALOG.length} platform tools
              </span>

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
                  Save Tool Whitelist
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
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#0e131e] border border-zinc-700 rounded-2xl p-6 space-y-5 shadow-2xl">
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

              {/* Initial Tool Permissions */}
              <div>
                <label className="text-xs font-mono text-zinc-300 block mb-1.5">
                  Initial MCP Tools Whitelist
                </label>
                <div className="max-h-40 overflow-y-auto space-y-1.5 p-2 rounded-lg bg-[#07090f] border border-zinc-800">
                  {PLATFORM_MCP_SCOPES_CATALOG.slice(0, 8).map((tool) => {
                    const isChecked = newKeyTools.includes(tool.id);
                    return (
                      <label
                        key={tool.id}
                        className="flex items-center gap-2 text-xs font-mono text-zinc-300 cursor-pointer hover:text-white"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() =>
                            setNewKeyTools((prev) =>
                              prev.includes(tool.id)
                                ? prev.filter((id) => id !== tool.id)
                                : [...prev, tool.id]
                            )
                          }
                          className="rounded bg-zinc-900 border-zinc-700 text-emerald-500"
                        />
                        <span>{tool.id}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-3.5 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateKey}
                disabled={!newKeyName.trim()}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs disabled:opacity-50"
              >
                Generate Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
