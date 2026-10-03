'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Server,
  Layers,
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Plus,
  Trash2,
  Edit3,
  Copy,
  Check,
  Play,
  Terminal,
  Cpu,
  Sparkles,
  RefreshCw,
  FolderGit2,
  Mail,
  MessageSquare,
  BookOpen,
  Database,
  Sliders,
  ChevronRight,
  Info,
  Zap,
  ArrowRight,
  LogOut,
  SlidersHorizontal,
  User,
} from 'lucide-react';
import {
  HostedMcpServer,
  McpServerProfile,
  McpTool,
  OAuthProvider,
  McpSkill,
} from '@/lib/demo/legacy_mocks/types';
import { HOSTED_MCP_SERVERS, MCP_SKILLS } from '@/lib/demo/legacy_mocks/hosted-servers';
import { McpProfileManager } from '@/lib/demo/legacy_mocks/profile-manager';
import { ContextProfile } from '@/lib/types';
import { PlatformMcpServerView } from './PlatformMcpServerView';

interface McpHubViewProps {
  contextProfiles: ContextProfile[];
  onNavigateToContextProfile?: (profile: ContextProfile) => void;
}

export const McpHubView: React.FC<McpHubViewProps> = ({
  contextProfiles,
  onNavigateToContextProfile,
}) => {
  // State
  const [servers, setServers] = useState<HostedMcpServer[]>(HOSTED_MCP_SERVERS);
  const [mcpProfiles, setMcpProfiles] = useState<McpServerProfile[]>(() => McpProfileManager.listProfiles());
  const [selectedProfileId, setSelectedProfileId] = useState<string>(() => McpProfileManager.listProfiles()[0]?.id || '');
  const [activeTab, setActiveTab] = useState<'servers' | 'profiles' | 'clients' | 'tester' | 'platform-control'>('servers');
  const [isCopied, setIsCopied] = useState<string | null>(null);
  const [isConnectingOAuth, setIsConnectingOAuth] = useState<string | null>(null);
  const [oauthToast, setOauthToast] = useState<{ title: string; message: string } | null>(null);

  // Inspector & Tester state
  const [testerMethod, setTesterMethod] = useState<'tools/list' | 'tools/call' | 'prompts/list' | 'prompts/get' | 'resources/list' | 'initialize'>('tools/call');
  const [testerToolName, setTesterToolName] = useState<string>('context_resolve_profile');
  const [testerArgsJson, setTesterArgsJson] = useState<string>(
    JSON.stringify(
      {
        profile_slug: 'sales-agent',
        tenant_id: 'acme-corp',
        user_id: 'usr_vip_9482',
        query: 'What is our refund and SLA policy for enterprise?',
      },
      null,
      2
    )
  );
  const [testerOutput, setTesterOutput] = useState<any>(null);
  const [isExecutingTool, setIsExecutingTool] = useState(false);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null);

  // New profile modal
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileSlug, setNewProfileSlug] = useState('');
  const [newProfileDesc, setNewProfileDesc] = useState('');

  // Tool details modal
  const [inspectingTool, setInspectingTool] = useState<McpTool | null>(null);

  const fetchServers = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp/servers');
      if (res.ok) {
        const data = await res.json();
        setServers(data.servers);
      }
    } catch {
      setServers(HOSTED_MCP_SERVERS);
    }
  }, []);

  const fetchMcpProfiles = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp/profiles');
      if (res.ok) {
        const data = await res.json();
        setMcpProfiles(data.profiles);
      }
    } catch {
      setMcpProfiles(McpProfileManager.listProfiles());
    }
  }, []);

  // Fetch profiles on mount asynchronously
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [resP, resS] = await Promise.all([
          fetch('/api/mcp/profiles'),
          fetch('/api/mcp/servers'),
        ]);
        if (isMounted && resP.ok) {
          const dataP = await resP.json();
          if (Array.isArray(dataP.profiles) && dataP.profiles.length > 0) {
            setMcpProfiles(dataP.profiles);
          }
        }
        if (isMounted && resS.ok) {
          const dataS = await resS.json();
          if (Array.isArray(dataS.servers)) {
            setServers(dataS.servers);
          }
        }
      } catch {
        // Fallback already in initial state
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Listen for OAuth success postMessage from popup window (as per AI Studio OAuth skill)
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      // Validate origin if applicable or check data type
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const provider = event.data.provider;
        const account = event.data.accountName || event.data.accountEmail || 'Connected Account';
        
        setIsConnectingOAuth(null);
        setOauthToast({
          title: `Connected to ${provider.toUpperCase()}`,
          message: `Successfully authenticated account "${account}". Tools are now unlocked!`,
        });

        // Refresh servers
        fetchServers();

        // Clear toast after 5s
        setTimeout(() => setOauthToast(null), 5000);
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [fetchServers]);

  const selectedProfile = mcpProfiles.find((p) => p.id === selectedProfileId) || mcpProfiles[0];

  // 1-Click OAuth Trigger
  const handleConnectOAuth = async (server: HostedMcpServer) => {
    if (!server.oauthProvider) return;
    setIsConnectingOAuth(server.id);

    try {
      const res = await fetch(`/api/oauth/url?provider=${server.oauthProvider}`);
      if (!res.ok) throw new Error('Failed to obtain auth URL');
      const data = await res.json();

      // Open popup window directly to OAuth provider/handler
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        data.url,
        `oauth_${server.oauthProvider}`,
        `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=yes`
      );

      if (!popup) {
        alert('Popup was blocked by your browser. Please allow popups to connect your account.');
        setIsConnectingOAuth(null);
      }
    } catch (err: any) {
      console.error('OAuth initiation failed:', err);
      setIsConnectingOAuth(null);
      alert(`Could not initiate OAuth: ${err?.message}`);
    }
  };

  // Toggle Subscription
  const handleToggleSubscribe = async (server: HostedMcpServer) => {
    try {
      const res = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId: server.id, action: 'toggle-subscribe' }),
      });
      if (res.ok) {
        fetchServers();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Disconnect OAuth
  const handleDisconnect = async (server: HostedMcpServer) => {
    try {
      const res = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId: server.id, action: 'disconnect' }),
      });
      if (res.ok) {
        fetchServers();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Toggle Tool in MCP Profile
  const handleToggleToolInProfile = async (toolName: string) => {
    if (!selectedProfile) return;

    const currentTools = selectedProfile.selectedToolNames;
    const nextTools = currentTools.includes(toolName)
      ? currentTools.filter((t) => t !== toolName)
      : [...currentTools, toolName];

    const updated = {
      ...selectedProfile,
      selectedToolNames: nextTools,
    };

    setMcpProfiles((prev) => prev.map((p) => (p.id === selectedProfile.id ? updated : p)));

    await fetch('/api/mcp/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update',
        id: selectedProfile.id,
        data: { selectedToolNames: nextTools },
      }),
    });
  };

  // Toggle Context Control Profile Binding
  const handleToggleContextBinding = async (slug: string) => {
    if (!selectedProfile) return;

    const currentBindings = selectedProfile.boundContextProfileSlugs;
    const nextBindings = currentBindings.includes(slug)
      ? currentBindings.filter((s) => s !== slug)
      : [...currentBindings, slug];

    const updated = {
      ...selectedProfile,
      boundContextProfileSlugs: nextBindings,
    };

    setMcpProfiles((prev) => prev.map((p) => (p.id === selectedProfile.id ? updated : p)));

    await fetch('/api/mcp/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update',
        id: selectedProfile.id,
        data: { boundContextProfileSlugs: nextBindings },
      }),
    });
  };

  // Toggle Skill in Profile
  const handleToggleSkill = async (skillId: string) => {
    if (!selectedProfile) return;

    const currentSkills = selectedProfile.selectedSkillNames;
    const nextSkills = currentSkills.includes(skillId)
      ? currentSkills.filter((s) => s !== skillId)
      : [...currentSkills, skillId];

    const updated = {
      ...selectedProfile,
      selectedSkillNames: nextSkills,
    };

    setMcpProfiles((prev) => prev.map((p) => (p.id === selectedProfile.id ? updated : p)));

    await fetch('/api/mcp/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update',
        id: selectedProfile.id,
        data: { selectedSkillNames: nextSkills },
      }),
    });
  };

  // Create Profile
  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName) return;

    const slug = newProfileSlug || newProfileName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const defaultTools = servers.flatMap((s) => (s.isSubscribed ? s.tools.slice(0, 2).map((t) => t.name) : []));

    const res = await fetch('/api/mcp/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newProfileName,
        slug,
        description: newProfileDesc,
        selectedToolNames: defaultTools,
        selectedSkillNames: ['skill-context-guard'],
        boundContextProfileSlugs: [contextProfiles[0]?.slug || 'sales-agent'],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setMcpProfiles([data.profile, ...mcpProfiles]);
      setSelectedProfileId(data.profile.id);
      setIsCreatingProfile(false);
      setNewProfileName('');
      setNewProfileSlug('');
      setNewProfileDesc('');
    }
  };

  // Execute MCP Test Call
  const handleExecuteTester = async () => {
    setIsExecutingTool(true);
    setTesterOutput(null);
    const start = performance.now();

    try {
      let parsedArgs = {};
      if (testerMethod === 'tools/call') {
        try {
          parsedArgs = JSON.parse(testerArgsJson);
        } catch {
          alert('Invalid JSON in tool arguments');
          setIsExecutingTool(false);
          return;
        }
      }

      const jsonRpcPayload: any = {
        jsonrpc: '2.0',
        id: `test_${Date.now()}`,
        method: testerMethod,
        params:
          testerMethod === 'tools/call'
            ? {
                name: testerToolName,
                arguments: parsedArgs,
              }
            : testerMethod === 'prompts/get'
            ? {
                name: `context-prompt-${contextProfiles[0]?.slug || 'sales-agent'}`,
                arguments: { tenant_id: 'acme-corp', user_id: 'usr_vip_9482', query: 'Status update' },
              }
            : {},
      };

      const res = await fetch(`/api/mcp?profile=${selectedProfile?.slug || 'fullstack-dev'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${selectedProfile?.apiKey || 'test_token'}`,
        },
        body: JSON.stringify(jsonRpcPayload),
      });

      const data = await res.json();
      setExecutionTimeMs(Math.round(performance.now() - start));
      setTesterOutput(data);
    } catch (err: any) {
      setTesterOutput({ error: err.message });
      setExecutionTimeMs(Math.round(performance.now() - start));
    } finally {
      setIsExecutingTool(false);
    }
  };

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(id);
    setTimeout(() => setIsCopied(null), 2000);
  };

  // Base URL helper
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.run.app';
  const mcpEndpointUrl = `${origin}/api/mcp?profile=${selectedProfile?.slug || 'default'}`;

  // Server icon resolver
  const renderServerIcon = (icon: string) => {
    switch (icon) {
      case 'Layers':
        return <Layers className="w-5 h-5 text-emerald-400" />;
      case 'Mail':
        return <Mail className="w-5 h-5 text-red-400" />;
      case 'Github':
        return <FolderGit2 className="w-5 h-5 text-purple-400" />;
      case 'MessageSquare':
        return <MessageSquare className="w-5 h-5 text-amber-400" />;
      case 'BookOpen':
        return <BookOpen className="w-5 h-5 text-blue-400" />;
      case 'Database':
        return <Database className="w-5 h-5 text-cyan-400" />;
      default:
        return <Server className="w-5 h-5 text-zinc-400" />;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn">
      {/* Toast Notification for OAuth */}
      {oauthToast && (
        <div className="fixed top-16 right-8 z-50 flex items-start gap-3 p-4 bg-emerald-950/90 border border-emerald-600/60 rounded-xl shadow-2xl backdrop-blur-md text-emerald-100 max-w-md animate-slideDown">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-white">{oauthToast.title}</h4>
            <p className="text-xs text-emerald-200/90 leading-relaxed">{oauthToast.message}</p>
          </div>
          <button
            onClick={() => setOauthToast(null)}
            className="text-emerald-400 hover:text-white text-xs ml-auto"
          >
            ✕
          </button>
        </div>
      )}

      {/* Hero Header */}
      <div className="border border-zinc-800 bg-[#0e1117] rounded-xl p-6 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-emerald-500/10 via-teal-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-0.5 text-[11px] font-mono font-medium rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/80">
                PROPRIETARY MCP BACKEND
              </span>
              <span className="text-xs font-mono text-zinc-500">v2024-11-05 Protocol</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              Hosted MCP Hub & Tool Profiles
            </h1>
            <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
              Subscribe to hosted MCP servers (Google Workspace, GitHub, Postgres), connect your accounts with 1-click OAuth, and assign targeted toolsets & Context Control profiles directly to your AI agents.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCreatingProfile(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-all shadow-md shadow-emerald-950"
            >
              <Plus className="w-4 h-4" />
              <span>Create MCP Profile</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-zinc-800/80">
          <div className="space-y-1">
            <div className="text-[11px] uppercase font-mono text-zinc-500">Available Hosted Servers</div>
            <div className="text-xl font-bold text-white font-mono">{servers.length}</div>
          </div>
          <div className="space-y-1">
            <div className="text-[11px] uppercase font-mono text-zinc-500">Subscribed Servers</div>
            <div className="text-xl font-bold text-emerald-400 font-mono">
              {servers.filter((s) => s.isSubscribed).length} Active
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[11px] uppercase font-mono text-zinc-500">Connected OAuth Accounts</div>
            <div className="text-xl font-bold text-teal-400 font-mono">
              {servers.filter((s) => s.requiresOAuth && s.isConnected).length} Connected
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[11px] uppercase font-mono text-zinc-500">Assigned MCP Profiles</div>
            <div className="text-xl font-bold text-zinc-200 font-mono">{mcpProfiles.length} Configured</div>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-zinc-800">
        <button
          onClick={() => setActiveTab('servers')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
            activeTab === 'servers'
              ? 'border-emerald-500 text-emerald-400 font-semibold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Server className="w-4 h-4" />
          <span>1. Hosted MCP Servers & OAuth</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">
            {servers.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('profiles')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
            activeTab === 'profiles'
              ? 'border-emerald-500 text-emerald-400 font-semibold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>2. Assign MCP Profiles & Tools</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">
            {mcpProfiles.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('clients')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
            activeTab === 'clients'
              ? 'border-emerald-500 text-emerald-400 font-semibold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>3. Connect Clients (Claude, Cursor, Agents)</span>
        </button>

        <button
          onClick={() => setActiveTab('tester')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
            activeTab === 'tester'
              ? 'border-emerald-500 text-emerald-400 font-semibold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>4. MCP Protocol Inspector & Test Runner</span>
        </button>

        <button
          onClick={() => setActiveTab('platform-control')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
            activeTab === 'platform-control'
              ? 'border-emerald-500 text-emerald-400 font-semibold bg-emerald-950/20'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Zap className="w-4 h-4 text-emerald-400" />
          <span>5. Platform Control Server (&lt;5ms Controllers)</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
            STDIO
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: HOSTED MCP SERVERS CATALOG & 1-CLICK OAUTH                         */}
      {/* ========================================================================= */}
      {activeTab === 'servers' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Hosted MCP Server Subscriptions</h2>
              <p className="text-xs text-zinc-400">
                Subscribe to managed MCP servers and link your developer or corporate accounts with one-click OAuth authentication.
              </p>
            </div>
            <div className="text-xs text-zinc-500 font-mono flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              All servers powered by Context Control Gateway
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {servers.map((server) => {
              const isConnecting = isConnectingOAuth === server.id;

              return (
                <div
                  key={server.id}
                  className={`rounded-xl border p-5 flex flex-col justify-between transition-all ${
                    server.isSubscribed
                      ? 'border-zinc-700/80 bg-[#0f131a] shadow-lg'
                      : 'border-zinc-800/60 bg-[#0a0d13] opacity-80'
                  }`}
                >
                  <div className="space-y-4">
                    {/* Card Top: Icon & Status */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-zinc-800/80 border border-zinc-700 flex items-center justify-center">
                          {renderServerIcon(server.icon)}
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-white">{server.name}</h3>
                          <span className="text-[10px] font-mono text-zinc-400 capitalize">
                            {server.category} MCP
                          </span>
                        </div>
                      </div>

                      {/* Subscription Switch */}
                      <button
                        onClick={() => handleToggleSubscribe(server)}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium font-mono transition-colors ${
                          server.isSubscribed
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/70'
                            : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-zinc-200'
                        }`}
                      >
                        {server.isSubscribed ? 'Subscribed' : 'Subscribe'}
                      </button>
                    </div>

                    <p className="text-xs text-zinc-400 leading-relaxed min-h-[38px]">
                      {server.description}
                    </p>

                    {/* OAuth Connection Status Box */}
                    {server.requiresOAuth && (
                      <div className="p-3 rounded-lg bg-zinc-900/90 border border-zinc-800 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-400 font-medium">OAuth Account:</span>
                          {server.isConnected ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Connected
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-mono">
                              <AlertCircle className="w-3.5 h-3.5" />
                              Unconnected
                            </span>
                          )}
                        </div>

                        {server.isConnected && server.connectedUser ? (
                          <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded-full bg-emerald-950 border border-emerald-700/60 flex items-center justify-center text-[10px] text-emerald-400 font-bold">
                                {server.connectedUser.name ? server.connectedUser.name.charAt(0).toUpperCase() : <User className="w-3 h-3 text-emerald-400" />}
                              </div>
                              <span className="text-xs text-zinc-200 font-medium truncate max-w-[150px]">
                                {server.connectedUser.name || server.connectedUser.email}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDisconnect(server)}
                              className="text-[11px] text-zinc-500 hover:text-red-400 transition-colors"
                              title="Disconnect account"
                            >
                              Disconnect
                            </button>
                          </div>
                        ) : (
                          <div className="pt-1">
                            <button
                              onClick={() => handleConnectOAuth(server)}
                              disabled={isConnecting}
                              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium transition-colors border border-zinc-700"
                            >
                              <Key className="w-3.5 h-3.5 text-teal-400" />
                              <span>{isConnecting ? 'Connecting in popup...' : `1-Click OAuth Connect`}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Proprietary Core Info */}
                    {!server.requiresOAuth && (
                      <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-900/50 flex items-center justify-between text-xs">
                        <span className="text-emerald-300 font-mono text-[11px]">Direct Gateway Execution</span>
                        <span className="text-[10px] text-emerald-400 font-semibold">100% READY</span>
                      </div>
                    )}

                    {/* Tools count & Preview */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs text-zinc-400">
                        <span>Available Tools ({server.tools.length}):</span>
                        <span className="text-[11px] text-zinc-500">JSON-RPC 2.0</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {server.tools.map((t) => (
                          <button
                            key={t.name}
                            onClick={() => setInspectingTool(t)}
                            className="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition-colors"
                          >
                            {t.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom Action */}
                  <div className="mt-5 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                    <span className="text-zinc-500 font-mono text-[11px]">
                      {server.scopesRequired.length > 0 ? `${server.scopesRequired.length} scopes` : 'Zero-config'}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedProfileId(selectedProfile.id);
                        setActiveTab('profiles');
                      }}
                      className="text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center gap-1 text-[11px]"
                    >
                      Assign to Profile
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ASSIGN MCP PROFILES & SELECTED TOOLS                               */}
      {/* ========================================================================= */}
      {activeTab === 'profiles' && selectedProfile && (
        <div className="space-y-8">
          {/* Profile Selector Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400 font-medium">Active MCP Profile:</span>
              <div className="flex items-center gap-2">
                {mcpProfiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProfileId(p.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      p.id === selectedProfile.id
                        ? 'bg-emerald-600 text-white font-semibold shadow-md shadow-emerald-950'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 font-mono">
                API Key: <code className="text-emerald-400">{selectedProfile.apiKey.slice(0, 14)}...</code>
              </span>
              <button
                onClick={() => handleCopy(selectedProfile.apiKey, 'api-key')}
                className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs"
                title="Copy API Key"
              >
                {isCopied === 'api-key' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Profile Overview Card */}
          <div className="p-6 rounded-xl bg-[#0e1117] border border-zinc-800 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">{selectedProfile.name}</h3>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                    /{selectedProfile.slug}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1 max-w-2xl">{selectedProfile.description}</p>
              </div>

              <div className="text-right space-y-1">
                <span className="text-[11px] font-mono text-zinc-500 uppercase">Token Budget Cap</span>
                <div className="text-sm font-bold text-emerald-400 font-mono">
                  {selectedProfile.tokenBudget.toLocaleString()} tokens
                </div>
              </div>
            </div>
          </div>

          {/* Main 2-Column Assignment Board */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left 2 Cols: Tools Selector (The Chosen Tools) */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>1. Assigned Tools</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                      {selectedProfile.selectedToolNames.length} Selected
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Select exactly the tools this MCP profile exposes to Claude Desktop, Cursor, or your agents.
                  </p>
                </div>
              </div>

              {/* Grouped Tools by Server */}
              <div className="space-y-4">
                {servers.map((server) => {
                  const serverTools = server.tools;
                  const selectedInServer = serverTools.filter((t) =>
                    selectedProfile.selectedToolNames.includes(t.name)
                  );

                  return (
                    <div
                      key={server.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden"
                    >
                      {/* Server Group Header */}
                      <div className="px-4 py-3 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          {renderServerIcon(server.icon)}
                          <div>
                            <span className="text-xs font-semibold text-white">{server.name}</span>
                            <span className="text-[10px] font-mono text-zinc-500 ml-2">
                              {server.isSubscribed ? 'Subscribed' : 'Not Subscribed'}
                            </span>
                          </div>
                        </div>

                        <span className="text-xs font-mono text-zinc-400">
                          {selectedInServer.length} / {serverTools.length} enabled
                        </span>
                      </div>

                      {/* Tool Checkbox List */}
                      <div className="divide-y divide-zinc-800/60 p-2">
                        {serverTools.map((tool) => {
                          const isChecked = selectedProfile.selectedToolNames.includes(tool.name);

                          return (
                            <div
                              key={tool.name}
                              className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
                                isChecked ? 'bg-emerald-950/20' : 'hover:bg-zinc-800/30'
                              }`}
                            >
                              <input
                                type="checkbox"
                                id={`tool-${tool.name}`}
                                checked={isChecked}
                                onChange={() => handleToggleToolInProfile(tool.name)}
                                className="mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              />

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <label
                                    htmlFor={`tool-${tool.name}`}
                                    className="text-xs font-mono font-semibold text-white cursor-pointer hover:text-emerald-400"
                                  >
                                    {tool.name}
                                  </label>
                                  <button
                                    onClick={() => setInspectingTool(tool)}
                                    className="text-[11px] text-zinc-500 hover:text-zinc-300"
                                  >
                                    Schema →
                                  </button>
                                </div>
                                <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                                  {tool.description}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Col: Bound Context Profiles & Skills */}
            <div className="space-y-6">
              {/* Bound Context Control Profiles */}
              <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-sm font-bold text-white">Bound Context Profiles</h4>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Our proprietary MCP server surfaces these profiles as native MCP prompts and resources for your agent.
                  </p>
                </div>

                <div className="space-y-2">
                  {contextProfiles.map((cp) => {
                    const isBound = selectedProfile.boundContextProfileSlugs.includes(cp.slug);

                    return (
                      <div
                        key={cp.slug}
                        onClick={() => handleToggleContextBinding(cp.slug)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          isBound
                            ? 'border-emerald-600/70 bg-emerald-950/30'
                            : 'border-zinc-800 bg-zinc-800/40 hover:bg-zinc-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white">{cp.name}</span>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                              isBound ? 'bg-emerald-900 text-emerald-300' : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {isBound ? 'Active in MCP' : 'Disabled'}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-1 line-clamp-1">
                          Environment: {cp.environment} • Budget: {cp.budget.maxTokens.toLocaleString()} tokens • {cp.pipeline.length} pipeline steps
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Assigned Skills */}
              <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-teal-400" />
                    <h4 className="text-sm font-bold text-white">Assigned Agent Skills</h4>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Behavioral directives dynamically injected into the MCP protocol resources and prompt templates.
                  </p>
                </div>

                <div className="space-y-2">
                  {MCP_SKILLS.map((skill) => {
                    const isEnabled = selectedProfile.selectedSkillNames.includes(skill.id);

                    return (
                      <div
                        key={skill.id}
                        onClick={() => handleToggleSkill(skill.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          isEnabled
                            ? 'border-teal-600/70 bg-teal-950/20'
                            : 'border-zinc-800 bg-zinc-800/40 hover:bg-zinc-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white">{skill.name}</span>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                              isEnabled ? 'bg-teal-900 text-teal-300' : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {isEnabled ? 'Enabled' : 'Off'}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1">{skill.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CONNECT CLIENTS (CLAUDE DESKTOP, CURSOR, WINDSURF)                 */}
      {/* ========================================================================= */}
      {activeTab === 'clients' && selectedProfile && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-bold text-white">Connect Your MCP Clients</h2>
            <p className="text-xs text-zinc-400">
              Configure Claude Desktop, Cursor IDE, Windsurf, or your custom agents to stream tools and context from this MCP profile.
            </p>
          </div>

          {/* Quick Endpoint Bar */}
          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[11px] uppercase font-mono text-zinc-500">Universal MCP Server URL</span>
              <div className="text-xs font-mono text-emerald-400 break-all">{mcpEndpointUrl}</div>
            </div>
            <button
              onClick={() => handleCopy(mcpEndpointUrl, 'endpoint')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono transition-colors shrink-0"
            >
              {isCopied === 'endpoint' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>Copy Endpoint</span>
            </button>
          </div>

          {/* Configuration Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Claude Desktop Config */}
            <div className="rounded-xl border border-zinc-800 bg-[#0e1117] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <h4 className="text-sm font-bold text-white">Claude Desktop Configuration</h4>
                </div>
                <button
                  onClick={() =>
                    handleCopy(
                      JSON.stringify(
                        {
                          mcpServers: {
                            'context-control': {
                              url: mcpEndpointUrl,
                              headers: {
                                Authorization: `Bearer ${selectedProfile.apiKey}`,
                              },
                            },
                          },
                        },
                        null,
                        2
                      ),
                      'claude'
                    )
                  }
                  className="text-xs text-zinc-400 hover:text-white flex items-center gap-1"
                >
                  {isCopied === 'claude' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copy</span>
                </button>
              </div>

              <p className="text-xs text-zinc-400">
                Paste into your <code className="text-zinc-300">claude_desktop_config.json</code> file:
              </p>

              <pre className="p-3 rounded-lg bg-zinc-950 font-mono text-[11px] text-emerald-400 overflow-x-auto border border-zinc-800/80">
{`{
  "mcpServers": {
    "context-control": {
      "url": "${mcpEndpointUrl}",
      "headers": {
        "Authorization": "Bearer ${selectedProfile.apiKey}"
      }
    }
  }
}`}
              </pre>
            </div>

            {/* Cursor IDE Config */}
            <div className="rounded-xl border border-zinc-800 bg-[#0e1117] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-cyan-500"></div>
                  <h4 className="text-sm font-bold text-white">Cursor IDE MCP Settings</h4>
                </div>
                <button
                  onClick={() =>
                    handleCopy(
                      JSON.stringify(
                        {
                          mcp: {
                            servers: {
                              'context-control': {
                                url: mcpEndpointUrl,
                                headers: {
                                  Authorization: `Bearer ${selectedProfile.apiKey}`,
                                },
                              },
                            },
                          },
                        },
                        null,
                        2
                      ),
                      'cursor'
                    )
                  }
                  className="text-xs text-zinc-400 hover:text-white flex items-center gap-1"
                >
                  {isCopied === 'cursor' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copy</span>
                </button>
              </div>

              <p className="text-xs text-zinc-400">
                Paste into <code className="text-zinc-300">.cursor/mcp.json</code> or Cursor Settings &gt; MCP:
              </p>

              <pre className="p-3 rounded-lg bg-zinc-950 font-mono text-[11px] text-cyan-300 overflow-x-auto border border-zinc-800/80">
{`{
  "mcp": {
    "servers": {
      "context-control": {
        "url": "${mcpEndpointUrl}",
        "headers": {
          "Authorization": "Bearer ${selectedProfile.apiKey}"
        }
      }
    }
  }
}`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: MCP PROTOCOL INSPECTOR & TEST RUNNER                               */}
      {/* ========================================================================= */}
      {activeTab === 'tester' && selectedProfile && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-bold text-white">MCP Protocol Inspector & Live Tester</h2>
            <p className="text-xs text-zinc-400">
              Directly invoke JSON-RPC 2.0 methods (<code className="text-emerald-400">tools/list</code>, <code className="text-emerald-400">tools/call</code>, <code className="text-emerald-400">prompts/list</code>) against the proprietary MCP server engine.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Request Builder */}
            <div className="p-5 rounded-xl border border-zinc-800 bg-[#0e1117] space-y-4">
              <h3 className="text-sm font-bold text-white">1. Configure JSON-RPC Request</h3>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-zinc-400 block mb-1">MCP Method:</label>
                  <select
                    value={testerMethod}
                    onChange={(e: any) => setTesterMethod(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-md p-2 text-white font-mono"
                  >
                    <option value="tools/call">tools/call (Execute Tool)</option>
                    <option value="tools/list">tools/list (List Assigned Tools)</option>
                    <option value="prompts/list">prompts/list (List Context Prompts)</option>
                    <option value="resources/list">resources/list (List Resources)</option>
                    <option value="initialize">initialize (Handshake)</option>
                  </select>
                </div>

                {testerMethod === 'tools/call' && (
                  <>
                    <div>
                      <label className="text-zinc-400 block mb-1">Select Tool to Call:</label>
                      <select
                        value={testerToolName}
                        onChange={(e) => setTesterToolName(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-md p-2 text-white font-mono"
                      >
                        {selectedProfile.selectedToolNames.map((tool) => (
                          <option key={tool} value={tool}>
                            {tool}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-zinc-400 block mb-1">Arguments (JSON):</label>
                      <textarea
                        rows={8}
                        value={testerArgsJson}
                        onChange={(e) => setTesterArgsJson(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-md p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </>
                )}

                <div className="pt-2">
                  <button
                    onClick={handleExecuteTester}
                    disabled={isExecutingTool}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-all shadow-md shadow-emerald-950"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>{isExecutingTool ? 'Dispatching to MCP Engine...' : 'Execute MCP Request'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Response Viewer */}
            <div className="p-5 rounded-xl border border-zinc-800 bg-[#0e1117] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">2. Raw JSON-RPC 2.0 Response</h3>
                {executionTimeMs !== null && (
                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                    {executionTimeMs}ms latency
                  </span>
                )}
              </div>

              <div className="h-[360px] rounded-lg bg-zinc-950 border border-zinc-800/80 p-3 overflow-y-auto font-mono text-[11px] text-zinc-300">
                {testerOutput ? (
                  <pre>{JSON.stringify(testerOutput, null, 2)}</pre>
                ) : (
                  <div className="h-full flex items-center justify-center text-zinc-600">
                    Click &quot;Execute MCP Request&quot; to inspect the live response packet
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: PLATFORM CONTROL MCP SERVER (DIRECT IN-MEMORY CONTROLLERS)          */}
      {/* ========================================================================= */}
      {activeTab === 'platform-control' && (
        <PlatformMcpServerView />
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE PROFILE                                                     */}
      {/* ========================================================================= */}
      {isCreatingProfile && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#12161f] border border-zinc-800 rounded-xl max-w-md w-full p-6 space-y-5">
            <h3 className="text-base font-bold text-white">Create New MCP Server Profile</h3>
            <form onSubmit={handleCreateProfile} className="space-y-4 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Profile Name:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DevOps Assistant Suite"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-md p-2 text-white"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Slug:</label>
                <input
                  type="text"
                  placeholder="e.g. devops-suite"
                  value={newProfileSlug}
                  onChange={(e) => setNewProfileSlug(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-md p-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Description:</label>
                <textarea
                  rows={3}
                  placeholder="Brief description of what tools and skills this profile exposes..."
                  value={newProfileDesc}
                  onChange={(e) => setNewProfileDesc(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-md p-2 text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreatingProfile(false)}
                  className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                >
                  Create Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: TOOL SCHEMA INSPECTOR                                              */}
      {/* ========================================================================= */}
      {inspectingTool && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#12161f] border border-zinc-800 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold font-mono text-emerald-400">{inspectingTool.name}</h3>
                <span className="text-xs text-zinc-500">{inspectingTool.serverName}</span>
              </div>
              <button
                onClick={() => setInspectingTool(null)}
                className="text-zinc-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">{inspectingTool.description}</p>

            <div className="space-y-1">
              <span className="text-[11px] font-mono uppercase text-zinc-500">Input Schema:</span>
              <pre className="p-3 rounded-lg bg-zinc-950 font-mono text-[11px] text-zinc-300 max-h-60 overflow-y-auto border border-zinc-800">
                {JSON.stringify(inspectingTool.inputSchema, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectingTool(null)}
                className="px-4 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
