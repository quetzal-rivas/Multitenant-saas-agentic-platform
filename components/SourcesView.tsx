'use client';

import React, { useState, useEffect } from 'react';
import { ContextSource, IngestionEngineType } from '@/lib/types';
import { getSources } from '@/lib/data-service';
import { INITIAL_SOURCES } from '@/lib/mock-data';
import {
  Database,
  Brain,
  MessageSquare,
  BookOpen,
  Radio,
  FileCode,
  CheckCircle2,
  RefreshCw,
  Plus,
  ArrowUpRight,
  ExternalLink,
  ShieldCheck,
  Zap,
  Settings,
  Terminal,
  Clock,
  Lock,
  Key,
  Eye,
  Copy,
  Check,
  X,
  Search,
  Filter,
  Server,
  HardDrive,
  Layers,
  Activity,
  Sparkles,
  AlertTriangle,
  ChevronRight,
  Sliders,
} from 'lucide-react';

interface SourcesViewProps {
  sources?: ContextSource[];
  onAddSource?: () => void;
}

export const SourcesView: React.FC<SourcesViewProps> = ({
  sources: initialSources = INITIAL_SOURCES,
}) => {
  const [sources, setSources] = useState<ContextSource[]>(initialSources);

  useEffect(() => {
    async function loadSources() {
      const data = await getSources();
      if (data && data.length > 0) {
        setSources(data);
      }
    }
    loadSources();
  }, []);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterEngine, setFilterEngine] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Sheet / Drawer States
  const [configDrawerSource, setConfigDrawerSource] = useState<ContextSource | null>(null);
  const [previewSheetSource, setPreviewSheetSource] = useState<ContextSource | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [copiedRecordIdx, setCopiedRecordIdx] = useState<number | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Configuration Form State (synced when opening drawer)
  const [formData, setFormData] = useState<{
    ingestionEngine: IngestionEngineType;
    connectionString: string;
    baseUrl: string;
    apiKeyOrSecret: string;
    collectionName: string;
    dimension: number;
    sslMode: 'require' | 'prefer' | 'disable';
    mcpToolMapping: string;
    mcpGatewayEndpoint: string;
    cacheTtlSeconds: number;
    syncSchedule: '15m' | '1h' | '6h' | '24h';
    embeddingModel: string;
    chunkSize: number;
  }>({
    ingestionEngine: 'live_runtime',
    connectionString: '',
    baseUrl: '',
    apiKeyOrSecret: '',
    collectionName: '',
    dimension: 1536,
    sslMode: 'require',
    mcpToolMapping: '',
    mcpGatewayEndpoint: '',
    cacheTtlSeconds: 60,
    syncSchedule: '1h',
    embeddingModel: 'text-embedding-3-small',
    chunkSize: 512,
  });

  const categories = [
    { id: 'all', label: 'All Sources' },
    { id: 'database', label: 'Databases' },
    { id: 'live_data', label: 'Live APIs & CRM' },
    { id: 'knowledge', label: 'Knowledge (RAG)' },
    { id: 'memory', label: 'Memory' },
    { id: 'conversation', label: 'Chat Logs' },
    { id: 'static', label: 'Static Policies' },
  ];

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'database':
        return <Database className="w-4 h-4 text-sky-400" />;
      case 'memory':
        return <Brain className="w-4 h-4 text-purple-400" />;
      case 'conversation':
        return <MessageSquare className="w-4 h-4 text-emerald-400" />;
      case 'knowledge':
        return <BookOpen className="w-4 h-4 text-amber-400" />;
      case 'live_data':
        return <Radio className="w-4 h-4 text-rose-400" />;
      default:
        return <FileCode className="w-4 h-4 text-zinc-400" />;
    }
  };

  // Open Configuration Drawer
  const handleOpenConfig = (source: ContextSource) => {
    setConfigDrawerSource(source);
    setSaveSuccessMsg(null);
    setFormData({
      ingestionEngine: source.ingestionEngine,
      connectionString: source.credentials?.connectionString || '',
      baseUrl: source.credentials?.baseUrl || '',
      apiKeyOrSecret: source.credentials?.apiKeyOrSecret || '',
      collectionName: source.credentials?.collectionName || '',
      dimension: source.credentials?.dimension || 1536,
      sslMode: source.credentials?.sslMode || 'require',
      mcpToolMapping: source.liveRuntimeConfig?.mcpToolMapping || source.mcpMappingKey || '',
      mcpGatewayEndpoint: source.liveRuntimeConfig?.mcpGatewayEndpoint || '',
      cacheTtlSeconds: source.liveRuntimeConfig?.cacheTtlSeconds ?? 60,
      syncSchedule: source.batchSyncConfig?.schedule || '1h',
      embeddingModel: source.batchSyncConfig?.embeddingModel || 'text-embedding-3-small',
      chunkSize: source.batchSyncConfig?.chunkSize || 512,
    });
  };

  // Save Configuration to Local State + Simulated Supabase RLS Vault
  const handleSaveConfig = () => {
    if (!configDrawerSource) return;

    const updatedSources = sources.map((s) => {
      if (s.id !== configDrawerSource.id) return s;

      const updated: ContextSource = {
        ...s,
        ingestionEngine: formData.ingestionEngine,
        mcpMappingKey: formData.mcpToolMapping,
        credentials: {
          ...s.credentials,
          connectionString: formData.connectionString || s.credentials?.connectionString,
          baseUrl: formData.baseUrl || s.credentials?.baseUrl,
          apiKeyOrSecret: formData.apiKeyOrSecret || s.credentials?.apiKeyOrSecret,
          collectionName: formData.collectionName || s.credentials?.collectionName,
          dimension: formData.dimension || s.credentials?.dimension,
          sslMode: formData.sslMode,
          encryptedInVault: true,
        },
      };

      if (formData.ingestionEngine === 'batch_sync') {
        const cronMap = {
          '15m': '*/15 * * * *',
          '1h': '0 * * * *',
          '6h': '0 */6 * * *',
          '24h': '0 0 * * *',
        };
        updated.batchSyncConfig = {
          schedule: formData.syncSchedule,
          cronExpression: cronMap[formData.syncSchedule],
          nextSyncAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
          embeddingModel: formData.embeddingModel,
          chunkSize: formData.chunkSize,
          targetTable: s.batchSyncConfig?.targetTable || `${s.id}_embeddings`,
          bullmqQueue: s.batchSyncConfig?.bullmqQueue || `bullmq:sync_${s.id}`,
          status: 'scheduled',
        };
      } else {
        updated.liveRuntimeConfig = {
          mcpToolMapping: formData.mcpToolMapping,
          mcpGatewayEndpoint: formData.mcpGatewayEndpoint || `https://gateway.mcp.local/v1/tools/${formData.mcpToolMapping}`,
          cacheTtlSeconds: formData.cacheTtlSeconds,
          timeoutMs: s.liveRuntimeConfig?.timeoutMs || 2500,
        };
      }

      return updated;
    });

    setSources(updatedSources);
    setSaveSuccessMsg('Configuration encrypted & saved to Supabase Vault under tenant_enterprise_corp');
    setTimeout(() => {
      setSaveSuccessMsg(null);
      setConfigDrawerSource(null);
    }, 1400);
  };

  // Open Test Ping Data Preview
  const handleOpenTestPing = (source: ContextSource) => {
    setPreviewSheetSource(source);
    setIsPinging(true);
    setPingLatency(null);

    // Realistic verification latency simulation
    const simulatedLatency = Math.floor(Math.random() * 25) + source.latencyMs;
    setTimeout(() => {
      setIsPinging(false);
      setPingLatency(simulatedLatency);
    }, 650);
  };

  // Copy helper
  const handleCopyRecord = (idx: number, data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedRecordIdx(idx);
    setTimeout(() => setCopiedRecordIdx(null), 2000);
  };

  // Filter sources
  const filteredSources = sources.filter((s) => {
    if (filterCategory !== 'all' && s.category !== filterCategory) return false;
    if (filterEngine !== 'all' && s.ingestionEngine !== filterEngine) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesName = s.name.toLowerCase().includes(q);
      const matchesDesc = s.description.toLowerCase().includes(q);
      const matchesProvider = s.provider.toLowerCase().includes(q);
      const matchesMcp = s.mcpMappingKey?.toLowerCase().includes(q) ?? false;
      return matchesName || matchesDesc || matchesProvider || matchesMcp;
    }
    return true;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 font-sans">
      {/* ==================================================================== */}
      {/* HEADER */}
      {/* ==================================================================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
              Context Sources & Data Mapping Workspace
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 font-semibold uppercase tracking-wider">
              Supabase Vault · RLS Isolated
            </span>
          </div>
          <p className="text-zinc-400 text-sm max-w-3xl">
            Configure dynamic ingestion behavior for multi-tenant data pipelines: schedule background vector syncs with BullMQ/Redis, or map live Model Context Protocol (MCP) endpoints for real-time runtime pulls.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-mono px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>{sources.length} Connected Providers</span>
          </span>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* FILTER & ENGINE TOGGLES */}
      {/* ==================================================================== */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 text-xs font-mono">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilterCategory(c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all shrink-0 ${
                filterCategory === c.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-zinc-900/90 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Engine Filter + Search */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center rounded-lg bg-[#11151e] border border-zinc-800 p-0.5 text-xs font-mono">
            <button
              onClick={() => setFilterEngine('all')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                filterEngine === 'all' ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All Engines
            </button>
            <button
              onClick={() => setFilterEngine('live_runtime')}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                filterEngine === 'live_runtime' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Zap className="w-3 h-3 text-amber-400" />
              <span>⚡ Live</span>
            </button>
            <button
              onClick={() => setFilterEngine('batch_sync')}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                filterEngine === 'batch_sync' ? 'bg-amber-950 text-amber-300 border border-amber-700 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Clock className="w-3 h-3 text-amber-400" />
              <span>⏳ Batch</span>
            </button>
          </div>

          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search providers or tools..."
              className="w-full bg-[#11151e] border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SOURCES GRID */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredSources.map((source) => {
          const isLive = source.ingestionEngine === 'live_runtime';

          return (
            <div
              key={source.id}
              className="p-5 rounded-2xl bg-[#11151e] border border-zinc-800 hover:border-zinc-700 transition-all space-y-4 shadow-sm"
            >
              {/* Top Row: Icon, Name, Provider & Status */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                    {getCategoryIcon(source.category)}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">{source.name}</h3>
                    <span className="text-[11px] font-mono text-zinc-500 uppercase">
                      Provider: <strong className="text-zinc-400">{source.provider}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 font-bold">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Connected
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {source.recordsCount.toLocaleString()} records • {source.latencyMs}ms avg
                  </span>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-zinc-300 font-sans leading-relaxed">
                {source.description}
              </p>

              {/* Ingestion Engine & Vault Security Status Bar */}
              <div className="p-3 rounded-xl bg-[#090c13] border border-zinc-800/80 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 text-[11px] uppercase">Connection Type:</span>
                  {isLive ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-700/80">
                      <Zap className="w-3 h-3 text-amber-400" />
                      <span>Live Ingestion (On-Demand Runtime Pull)</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-700/80">
                      <Clock className="w-3 h-3 text-indigo-400" />
                      <span>Batch Sync Ingestion (BullMQ / Scheduled)</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-800/60 text-[11px]">
                  {/* Security / Vault Tag */}
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    <Lock className="w-3 h-3 text-emerald-400" />
                    <span>Vault Auth:</span>
                    <span className="text-emerald-300 font-semibold">
                      {source.vaultAuthStatus === 'oauth2_validated'
                        ? '[ OAuth2 Validated ]'
                        : source.vaultAuthStatus === 'rls_sandboxed'
                        ? '[ RLS Sandboxed ]'
                        : '[ Vault Encrypted ]'}
                    </span>
                  </div>

                  {/* Mapping or Schedule indicator */}
                  <div className="text-zinc-400">
                    {isLive ? (
                      <span>MCP Tool: <code className="text-indigo-300 bg-black/40 px-1.5 py-0.5 rounded border border-zinc-800">{source.mcpMappingKey || 'live.query'}</code></span>
                    ) : (
                      <span>Sync: <strong className="text-amber-300">Every {source.batchSyncConfig?.schedule || '1h'}</strong></span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons: Configure API Endpoints & Inspect Data Payload */}
              <div className="pt-2 flex items-center justify-between gap-3 border-t border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => handleOpenConfig(source)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-mono font-medium transition-colors"
                >
                  <Settings className="w-3.5 h-3.5 text-indigo-400" />
                  <span>⚙️ Configure Endpoints</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenTestPing(source)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-950 hover:bg-indigo-900 border border-indigo-700 text-indigo-200 text-xs font-mono font-semibold transition-colors shadow-sm"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>🔍 Inspect Payload (Test Ping)</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ==================================================================== */}
      {/* 1. CONNECTION SETUP PANEL (SLIDE-OUT DRAWER / SHEET) */}
      {/* ==================================================================== */}
      {configDrawerSource && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-xl h-full bg-[#0d1017] border-l border-zinc-800 shadow-2xl flex flex-col justify-between overflow-y-auto font-sans animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-6 border-b border-zinc-800 space-y-2 bg-[#10141f]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white">
                    {getCategoryIcon(configDrawerSource.category)}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">
                      Configure: {configDrawerSource.name}
                    </h2>
                    <span className="text-xs font-mono text-zinc-400">
                      Provider: <code className="text-emerald-400">{configDrawerSource.provider}</code>
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setConfigDrawerSource(null)}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-zinc-400">
                Credentials and parameters are encrypted into the Supabase multi-tenant vault using isolated Row-Level Security policies.
              </p>
            </div>

            {/* Drawer Body Form */}
            <div className="p-6 space-y-6 flex-1 text-xs font-mono">
              {/* Save Success Alert */}
              {saveSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{saveSuccessMsg}</span>
                </div>
              )}

              {/* 1. Ingestion Engine Selection Toggle */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-200 uppercase tracking-wider block">
                  Ingestion Engine Paradigm:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, ingestionEngine: 'live_runtime' })}
                    className={`p-3 rounded-xl border text-left space-y-1 transition-all ${
                      formData.ingestionEngine === 'live_runtime'
                        ? 'bg-amber-950/40 border-amber-500 text-white shadow-md'
                        : 'bg-[#121622] border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-amber-300">
                      <Zap className="w-3.5 h-3.5" />
                      <span>Live Runtime Pull</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 font-sans">
                      On-demand fetch over MCP Gateway when an agent tool triggers. Zero delay.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, ingestionEngine: 'batch_sync' })}
                    className={`p-3 rounded-xl border text-left space-y-1 transition-all ${
                      formData.ingestionEngine === 'batch_sync'
                        ? 'bg-indigo-950/40 border-indigo-500 text-white shadow-md'
                        : 'bg-[#121622] border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-indigo-300">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Batch Sync Ingestion</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 font-sans">
                      Scheduled cron sync to BullMQ/Redis worker. Scrapes, chunks, & embeds into pgvector.
                    </p>
                  </button>
                </div>
              </div>

              {/* 2. Dynamic Inputs based on Provider Type */}
              <div className="space-y-4 pt-2 border-t border-zinc-800">
                <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider block">
                  Provider Connection & Credentials:
                </span>

                {/* Database Specific (Postgres / Supabase / Redis) */}
                {(configDrawerSource.category === 'database' || configDrawerSource.provider === 'postgres') && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1">
                        PostgreSQL Connection URI (with SSL):
                      </label>
                      <input
                        type="password"
                        value={formData.connectionString}
                        onChange={(e) => setFormData({ ...formData, connectionString: e.target.value })}
                        placeholder="postgresql://postgres:password@db.supabase.co:5432/postgres?sslmode=require"
                        className="w-full bg-[#121725] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-emerald-300 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-zinc-400 block mb-1">SSL Mode:</label>
                        <select
                          value={formData.sslMode}
                          onChange={(e) => setFormData({ ...formData, sslMode: e.target.value as any })}
                          className="w-full bg-[#121725] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                        >
                          <option value="require">require (recommended)</option>
                          <option value="prefer">prefer</option>
                          <option value="disable">disable</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] text-zinc-400 block mb-1">Vault Key ID:</label>
                        <input
                          type="text"
                          disabled
                          value={configDrawerSource.credentials?.vaultKeyId || 'vault_auto_assigned'}
                          className="w-full bg-[#0a0d14] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Live REST API / CRM Specific */}
                {configDrawerSource.category === 'live_data' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1">API Base URL:</label>
                      <input
                        type="text"
                        value={formData.baseUrl}
                        onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                        placeholder="https://api.salesforce.com/services/data/v58.0"
                        className="w-full bg-[#121725] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1">
                        Bearer Token / OAuth Client Secret:
                      </label>
                      <input
                        type="password"
                        value={formData.apiKeyOrSecret}
                        onChange={(e) => setFormData({ ...formData, apiKeyOrSecret: e.target.value })}
                        placeholder="sk_live_••••••••••••••••"
                        className="w-full bg-[#121725] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-emerald-300 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}

                {/* Vector DB Specific (Qdrant / RAG) */}
                {configDrawerSource.category === 'knowledge' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1">Vector DB Base Endpoint:</label>
                      <input
                        type="text"
                        value={formData.baseUrl}
                        onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                        placeholder="https://qdrant.cluster.cloud.qdrant.io:6333"
                        className="w-full bg-[#121725] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-zinc-400 block mb-1">Collection Name:</label>
                        <input
                          type="text"
                          value={formData.collectionName}
                          onChange={(e) => setFormData({ ...formData, collectionName: e.target.value })}
                          placeholder="knowledge_base_v2"
                          className="w-full bg-[#121725] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-zinc-400 block mb-1">Vector Dimension:</label>
                        <input
                          type="number"
                          value={formData.dimension}
                          onChange={(e) => setFormData({ ...formData, dimension: Number(e.target.value) })}
                          className="w-full bg-[#121725] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Conditional Engine Settings */}
              {formData.ingestionEngine === 'batch_sync' ? (
                /* Batch Sync (BullMQ) Settings */
                <div className="p-4 rounded-xl bg-[#090c13] border border-indigo-900/60 space-y-3">
                  <div className="flex items-center gap-2 text-indigo-300 font-bold">
                    <Clock className="w-4 h-4 text-indigo-400" />
                    <span>BullMQ & Redis Scheduling Parameters</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1">Sync Schedule:</label>
                      <select
                        value={formData.syncSchedule}
                        onChange={(e) => setFormData({ ...formData, syncSchedule: e.target.value as any })}
                        className="w-full bg-[#121725] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="15m">Every 15 Minutes (*/15 * * * *)</option>
                        <option value="1h">Hourly (0 * * * *)</option>
                        <option value="6h">Every 6 Hours (0 */6 * * *)</option>
                        <option value="24h">Daily at Midnight (0 0 * * *)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1">Embedding Chunk Size:</label>
                      <select
                        value={formData.chunkSize}
                        onChange={(e) => setFormData({ ...formData, chunkSize: Number(e.target.value) })}
                        className="w-full bg-[#121725] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value={256}>256 Tokens (Precise Sentences)</option>
                        <option value={512}>512 Tokens (Standard Paragraphs)</option>
                        <option value={1024}>1,024 Tokens (Deep Documents)</option>
                      </select>
                    </div>
                  </div>

                  <div className="text-[11px] text-zinc-500 space-y-1 pt-1 border-t border-zinc-800">
                    <div>Connected Queue: <code className="text-zinc-300">{configDrawerSource.batchSyncConfig?.bullmqQueue || `bullmq:sync_${configDrawerSource.id}`}</code></div>
                    <div>Target Table: <code className="text-zinc-300">{configDrawerSource.batchSyncConfig?.targetTable || 'supabase_ephemeral_user_cache'}</code></div>
                  </div>
                </div>
              ) : (
                /* Live Runtime Ingestion (MCP Tool) Settings */
                <div className="p-4 rounded-xl bg-[#090c13] border border-amber-900/60 space-y-3">
                  <div className="flex items-center gap-2 text-amber-300 font-bold">
                    <Terminal className="w-4 h-4 text-amber-400" />
                    <span>Model Context Protocol (MCP) Tool Mapping</span>
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">MCP Tool Function Key:</label>
                    <input
                      type="text"
                      value={formData.mcpToolMapping}
                      onChange={(e) => setFormData({ ...formData, mcpToolMapping: e.target.value })}
                      placeholder="rest_api.get_contract"
                      className="w-full bg-[#121725] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-indigo-300 focus:outline-none focus:border-indigo-500 font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1">Gateway Endpoint:</label>
                      <input
                        type="text"
                        value={formData.mcpGatewayEndpoint}
                        onChange={(e) => setFormData({ ...formData, mcpGatewayEndpoint: e.target.value })}
                        placeholder="https://gateway.mcp.local/v1/tools"
                        className="w-full bg-[#121725] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1">Cache TTL (seconds):</label>
                      <input
                        type="number"
                        value={formData.cacheTtlSeconds}
                        onChange={(e) => setFormData({ ...formData, cacheTtlSeconds: Number(e.target.value) })}
                        placeholder="0 (Pure Live)"
                        className="w-full bg-[#121725] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-6 border-t border-zinc-800 bg-[#10141f] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfigDrawerSource(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveConfig}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5 text-emerald-300" />
                <span>Save to Encrypted Vault</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. TEST PING DATA PREVIEW OVERLAY (DATA EXPLORER SHEET) */}
      {/* ==================================================================== */}
      {previewSheetSource && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-[#0b0e16] border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] font-mono animate-in zoom-in-95 duration-150 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-zinc-800 bg-[#101421] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-950 border border-indigo-700 flex items-center justify-center text-indigo-400">
                  <Terminal className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                      Data Explorer Sheet: {previewSheetSource.name}
                    </h2>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      Live Test Ping
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 font-sans">
                    Inspecting top 3 raw records returned through the authentication gateway.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setPreviewSheetSource(null)}
                className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Telemetry Status Strip */}
            <div className="p-4 bg-[#080b11] border-b border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-[#111520] border border-zinc-800 space-y-0.5">
                <span className="text-[10px] text-zinc-500 uppercase block">Auth Verification</span>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-bold text-emerald-400 text-xs">Authenticated</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#111520] border border-zinc-800 space-y-0.5">
                <span className="text-[10px] text-zinc-500 uppercase block">Ping Roundtrip</span>
                <div className="flex items-center gap-1.5">
                  {isPinging ? (
                    <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span className="font-bold text-white text-xs">
                    {isPinging ? 'Pinging...' : `${pingLatency || previewSheetSource.latencyMs}ms`}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#111520] border border-zinc-800 space-y-0.5">
                <span className="text-[10px] text-zinc-500 uppercase block">Transport Security</span>
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-bold text-zinc-200 text-xs">TLS 1.3 / AES-256</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#111520] border border-zinc-800 space-y-0.5">
                <span className="text-[10px] text-zinc-500 uppercase block">Contract Schema</span>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="font-bold text-indigo-300 text-xs">Schema Conformed</span>
                </div>
              </div>
            </div>

            {/* Modal Body: Raw JSON Inspector */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Top 3 Records Snippet (Sample Payload):</span>
                <span className="text-[11px] text-zinc-500">
                  Provider: {previewSheetSource.provider} • Engine: {previewSheetSource.ingestionEngine}
                </span>
              </div>

              {isPinging ? (
                <div className="py-16 flex flex-col items-center justify-center space-y-3 text-zinc-400 text-xs">
                  <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin" />
                  <p>Handshaking with provider & decrypting credentials...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(previewSheetSource.testPingRecords || [
                    { record_id: 'rec_01', message: 'Connection verified successfully', status: 'ACTIVE' },
                  ]).map((record, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-[#06080e] border border-zinc-800 space-y-2 relative group"
                    >
                      <div className="flex items-center justify-between text-[11px] text-zinc-500 pb-1.5 border-b border-zinc-800/80">
                        <span className="font-semibold text-zinc-400">
                          Record #{idx + 1}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleCopyRecord(idx, record)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] transition-colors"
                        >
                          {copiedRecordIdx === idx ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-zinc-400" />
                              <span>Copy JSON</span>
                            </>
                          )}
                        </button>
                      </div>

                      <pre className="text-xs text-emerald-400 overflow-x-auto leading-relaxed select-text">
                        {JSON.stringify(record, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-800 bg-[#101421] flex items-center justify-between text-xs">
              <span className="text-zinc-500">
                Verified against active tenant sandbox: <code className="text-zinc-300">tenant_enterprise_corp</code>
              </span>

              <button
                type="button"
                onClick={() => setPreviewSheetSource(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold transition-colors"
              >
                Close Data Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
