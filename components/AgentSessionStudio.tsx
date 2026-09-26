'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  Server,
  Database,
  ShieldCheck,
  RefreshCw,
  ChevronDown,
  Layers,
  Clock,
  Code2,
  ExternalLink,
  CheckCircle2,
  Plus,
  Trash2,
  Cpu,
  Lock,
  ArrowRight,
  Terminal,
  Activity,
  Zap,
  Info,
  Check,
  Copy,
  Users,
  Sliders,
} from 'lucide-react';

interface ToolExecution {
  toolName: string;
  serverProvider: string;
  arguments: Record<string, any>;
  output: any;
  latencyMs: number;
  assignedWorker?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  profileId?: string;
  profileName?: string;
  checkpointId?: string;
  toolsExecuted?: ToolExecution[];
  isTeamBlueprint?: boolean;
  activeWorker?: string;
  timestamp: string;
}

interface CheckpointItem {
  checkpointId: string;
  threadId: string;
  tenantId: string;
  profileId: string;
  profileName: string;
  stepIndex: number;
  userMessage: string;
  assistantMessage: string;
  toolsExecuted: ToolExecution[];
  compiledToolsCount: number;
  compiledToolsNames: string[];
  metadata: Record<string, any>;
  timestamp: string;
}

interface VaultSpoke {
  id: string;
  provider: string;
  providerName: string;
  accountLabel: string;
  scopes: string[];
  keyFingerprint: string;
  isActive: boolean;
  connectedAt: string;
}

interface TeamBlueprintOption {
  id: string;
  name: string;
  supervisorPrompt: string;
  workers: {
    id: string;
    name: string;
    role: string;
    mcpTools: string[];
    avatarIcon?: string;
  }[];
  isTeamBlueprint: boolean;
}

interface AgentSessionStudioProps {
  initialProfileId?: string;
  initialThreadId?: string;
  onOpenTeamBuilder?: () => void;
}

const AVAILABLE_PERSONAS = [
  {
    id: 'sales_persona',
    name: 'Universal Sales & CRM Agent',
    badge: 'Sales & CRM',
    color: 'emerald',
    description: 'Binds HubSpot CRM leads, deal pipelines, and executive Gmail correspondence.',
    tools: ['crm.search_contact', 'crm.update_deal_stage', 'gmail.send_draft'],
    spokes: ['HubSpot CRM', 'Google Workspace'],
    samplePrompts: [
      'What is the status of our top prospective lead from yesterday?',
      'Draft a follow up email thanking them for the initial demo.',
      'Search HubSpot for Marcus Vance at Vance Logistics Corp.',
    ],
  },
  {
    id: 'developer_persona',
    name: 'Full-Stack Developer MCP Agent',
    badge: 'Dev & DB Ops',
    color: 'blue',
    description: 'Binds GitHub repositories, Postgres schema queries via Supavisor, and code reviews.',
    tools: ['postgres.describe_table', 'postgres.execute_read_query'],
    spokes: ['GitHub Enterprise', 'Supavisor Postgres (:5432)'],
    samplePrompts: [
      'Describe the column structure and indexes of the tenants table in Postgres.',
      'Search our database schemas for profiles and profile_workers tables.',
      'Check the latest read replica lag for our database instance.',
    ],
  },
  {
    id: 'support_persona',
    name: 'Customer Support Specialist',
    badge: 'Support & KB',
    color: 'amber',
    description: 'Binds internal Notion documentation, incident runbooks, and Slack dispatch alerts.',
    tools: ['notion.search_pages', 'slack.post_incident_alert'],
    spokes: ['Notion Knowledge Base', 'Slack Enterprise'],
    samplePrompts: [
      'Search internal Notion docs for SLA response time on critical incidents.',
      'Post an incident triage notification to the engineering Slack channel.',
      'Look up troubleshooting guidelines for Supavisor database connection drops.',
    ],
  },
];

export const AgentSessionStudio: React.FC<AgentSessionStudioProps> = ({
  initialProfileId,
  initialThreadId,
  onOpenTeamBuilder,
}) => {
  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    initialProfileId || 'team_front_desk_automation'
  );
  const [currentThreadId, setCurrentThreadId] = useState<string>(
    initialThreadId || 'session_enterprise_001'
  );
  const [tenantId] = useState<string>('tenant_enterprise_corp');
  
  const [inputMessage, setInputMessage] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [checkpoints, setCheckpoints] = useState<CheckpointItem[]>([]);
  const [vaultSpokes, setVaultSpokes] = useState<VaultSpoke[]>([]);
  const [allThreads, setAllThreads] = useState<any[]>([]);
  const [teamBlueprints, setTeamBlueprints] = useState<TeamBlueprintOption[]>([]);
  
  const [isSending, setIsSending] = useState<boolean>(false);
  const [profileSwitchedAlert, setProfileSwitchedAlert] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'gateway' | 'checkpoints' | 'spec'>('gateway');
  const [selectedCheckpointModal, setSelectedCheckpointModal] = useState<CheckpointItem | null>(null);
  const [copiedCurl, setCopiedCurl] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync initial props when passed
  useEffect(() => {
    if (initialProfileId) setSelectedProfileId(initialProfileId);
  }, [initialProfileId]);

  useEffect(() => {
    if (initialThreadId) setCurrentThreadId(initialThreadId);
  }, [initialThreadId]);

  // Fetch Team Blueprints from Supabase/API
  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/teams?tenant_id=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        setTeamBlueprints(data.teams || []);
      }
    } catch (e) {
      console.error('Failed to load team blueprints:', e);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  // Determine active profile (either Team Blueprint or Persona)
  const activeTeam = teamBlueprints.find((t) => t.id === selectedProfileId);
  const activePersona = AVAILABLE_PERSONAS.find((p) => p.id === selectedProfileId);
  const isTeam = !!activeTeam;

  const currentDisplayName = activeTeam ? activeTeam.name : (activePersona?.name || 'Front Desk Automation Team');
  const currentToolsCount = activeTeam
    ? activeTeam.workers.reduce((acc, w) => acc + (w.mcpTools?.length || 0), 0)
    : (activePersona?.tools.length || 3);

  // Sample prompt suggestions based on selected team/persona
  const activeSamplePrompts = activeTeam
    ? [
        'Check billing invoice balance for Acme Corp',
        'Verify identity and update contact Marcus Vance in CRM',
        'Inspect table schema for profiles and check replica health',
      ]
    : activePersona?.samplePrompts || [
        'What is the status of our top prospective lead from yesterday?',
        'Describe the column structure and indexes of the tenants table in Postgres.',
      ];

  // Load thread history and vault spokes
  const loadThreadData = useCallback(async (threadId: string) => {
    try {
      const res = await fetch(`/api/v1/chat/threads?thread_id=${threadId}&tenant_id=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        setCheckpoints(data.checkpoints || []);
        setAllThreads(data.all_threads || []);
        if (data.vault?.credentials) {
          setVaultSpokes(data.vault.credentials);
        }

        // Convert checkpoints into conversational history
        const reconstructedMessages: ChatMessage[] = [];
        (data.checkpoints || []).forEach((chk: CheckpointItem) => {
          reconstructedMessages.push({
            id: `usr_${chk.checkpointId}`,
            role: 'user',
            content: chk.userMessage,
            timestamp: chk.timestamp,
          });
          reconstructedMessages.push({
            id: `asst_${chk.checkpointId}`,
            role: 'assistant',
            content: chk.assistantMessage,
            profileId: chk.profileId,
            profileName: chk.profileName,
            checkpointId: chk.checkpointId,
            toolsExecuted: chk.toolsExecuted,
            timestamp: chk.timestamp,
          });
        });
        setMessages(reconstructedMessages);
      }
    } catch (err) {
      console.error('Failed to load thread data:', err);
    }
  }, [tenantId]);

  useEffect(() => {
    loadThreadData(currentThreadId);
  }, [currentThreadId, loadThreadData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  // Handle Dynamic Profile/Team Switching
  const handleProfileSwitch = (newProfileId: string) => {
    if (newProfileId === selectedProfileId) return;
    const oldName = currentDisplayName;
    setSelectedProfileId(newProfileId);

    const targetTeam = teamBlueprints.find((t) => t.id === newProfileId);
    const targetPersona = AVAILABLE_PERSONAS.find((p) => p.id === newProfileId);
    const nextName = targetTeam ? targetTeam.name : (targetPersona?.name || newProfileId);

    setProfileSwitchedAlert(
      `Blueprint switched from ${oldName} to ${nextName}. ` +
      (targetTeam
        ? `Multi-Agent Supervisor loaded with ${targetTeam.workers.length} workers.`
        : `Single Persona loaded with ${targetPersona?.tools.length || 0} tools.`)
    );
    setTimeout(() => setProfileSwitchedAlert(null), 6000);
  };

  // Spawn Fresh Thread ID for this profile
  const handleSpawnUniqueThread = async () => {
    try {
      const res = await fetch('/api/v1/threads/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: selectedProfileId,
          tenant_id: tenantId,
          title: `Session with ${currentDisplayName}`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentThreadId(data.thread_id);
        setMessages([]);
        setCheckpoints([]);
        loadThreadData(data.thread_id);
      }
    } catch (err) {
      console.error('Failed to spawn thread instance:', err);
    }
  };

  // Submit Turn to /api/v1/chat/generate
  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputMessage).trim();
    if (!textToSend || isSending) return;

    setInputMessage('');
    setIsSending(true);

    const tempUserMsgId = `temp_usr_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempUserMsgId,
        role: 'user',
        content: textToSend,
        timestamp: new Date().toISOString(),
      },
    ]);

    try {
      const response = await fetch('/api/v1/chat/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: currentThreadId,
          tenant_id: tenantId,
          profile_id: selectedProfileId,
          message: textToSend,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const asstMsg: ChatMessage = {
          id: `asst_${data.checkpoint_id}`,
          role: 'assistant',
          content: data.message,
          profileId: data.profile_id,
          profileName: data.profile_name,
          checkpointId: data.checkpoint_id,
          toolsExecuted: data.tool_executions,
          isTeamBlueprint: data.is_team_blueprint,
          activeWorker: data.active_worker,
          timestamp: data.timestamp,
        };
        setMessages((prev) => [...prev, asstMsg]);
        // Refresh checkpoints
        loadThreadData(currentThreadId);
      } else {
        const err = await response.json();
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: 'assistant',
            content: `Execution Error: ${err.error || 'Failed to generate turn'}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: `Network Error: ${error.message || 'Server connection failed'}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  // Create New Thread
  const handleCreateNewThread = async () => {
    try {
      const res = await fetch('/api/v1/chat/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentThreadId(data.thread_id);
        setMessages([]);
        setCheckpoints([]);
      }
    } catch (err) {
      console.error('Failed to create thread:', err);
    }
  };

  // Clear Current Thread
  const handleClearThread = async () => {
    try {
      await fetch('/api/v1/chat/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear', thread_id: currentThreadId }),
      });
      setMessages([]);
      setCheckpoints([]);
      loadThreadData(currentThreadId);
    } catch (err) {
      console.error('Failed to clear thread:', err);
    }
  };

  const copyCurl = () => {
    const curl = `curl -X POST https://api.yourdomain.com/v1/chat/generate \\
  -H "Content-Type: application/json" \\
  -d '{
    "thread_id": "${currentThreadId}",
    "tenant_id": "${tenantId}",
    "profile_id": "${selectedProfileId}",
    "message": "What did the lead from the voice call say?"
  }'`;
    navigator.clipboard.writeText(curl);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2500);
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-[#090b10] text-zinc-100 overflow-hidden">
      {/* ========================================================================= */}
      {/* LEFT/CENTER CHAT CANVAS */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col border-r border-zinc-800/80 min-w-0">
        {/* Dynamic Persona & Session Control Bar */}
        <header className="px-5 py-3 border-b border-zinc-800 bg-[#0d1017] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isTeam
                ? 'bg-purple-950/60 border border-purple-800/60 text-purple-400'
                : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
            }`}>
              {isTeam ? <Users className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            {/* Profile / Team Blueprint Dropdown */}
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                <span>{isTeam ? 'Active Team Blueprint' : 'Active Agent Persona'}</span>
                <span className="text-zinc-600">•</span>
                <span className={isTeam ? 'text-purple-400' : 'text-emerald-400'}>
                  {isTeam ? 'Multi-Agent Router' : 'Single Worker'}
                </span>
              </div>
              <div className="relative mt-0.5 flex items-center gap-2">
                <div className="relative">
                  <select
                    value={selectedProfileId}
                    onChange={(e) => handleProfileSwitch(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700/80 text-white font-medium text-xs rounded-md px-2.5 py-1.5 pr-8 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer appearance-none max-w-xs truncate"
                  >
                    {teamBlueprints.length > 0 && (
                      <optgroup label="🏢 Agent Team Blueprints (Multi-Agent)">
                        {teamBlueprints.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.workers.length} Workers)
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="🤖 Single Agent Personas">
                      {AVAILABLE_PERSONAS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.badge})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-2.5 pointer-events-none" />
                </div>

                {onOpenTeamBuilder && (
                  <button
                    onClick={onOpenTeamBuilder}
                    className="px-2.5 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-zinc-700/80 transition-all"
                    title="Open Agent Team Builder to create blueprints"
                  >
                    <Sliders className="w-3 h-3 text-emerald-400" />
                    <span>Team Builder</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Session / Thread / RLS Bar */}
          <div className="flex items-center gap-2 text-xs font-mono">
            {/* Thread Instance Selector */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-md">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-zinc-500">Instance:</span>
              <select
                value={currentThreadId}
                onChange={(e) => setCurrentThreadId(e.target.value)}
                className="bg-transparent text-zinc-200 font-semibold focus:outline-none cursor-pointer max-w-[140px] truncate"
              >
                {allThreads.map((t) => (
                  <option key={t.threadId} value={t.threadId} className="bg-zinc-900 text-white">
                    {t.threadId} ({t.turnsCount} turns)
                  </option>
                ))}
                {!allThreads.some((t) => t.threadId === currentThreadId) && (
                  <option value={currentThreadId} className="bg-zinc-900 text-white">
                    {currentThreadId} (active)
                  </option>
                )}
              </select>
            </div>

            {/* Spawn Brand New Unique Thread Instance */}
            <button
              onClick={handleSpawnUniqueThread}
              title="Spawn brand new unique thread instance bound to this blueprint"
              className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1 transition-all shadow-sm"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Spawn Instance</span>
            </button>

            {/* Reset Thread Button */}
            <button
              onClick={handleClearThread}
              title="Clear thread checkpoints"
              className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Dynamic Profile Switch Banner Alert */}
        {profileSwitchedAlert && (
          <div className="px-5 py-2.5 bg-emerald-950/60 border-b border-emerald-800/60 text-emerald-200 text-xs flex items-center gap-2 animate-fadeIn shrink-0">
            <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-mono">{profileSwitchedAlert}</span>
          </div>
        )}

        {/* Chat Message Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto p-6 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400 shadow-xl">
                {isTeam ? <Users className="w-6 h-6 text-purple-400" /> : <Cpu className="w-6 h-6" />}
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold text-white">
                  {isTeam ? `${currentDisplayName} (Team Blueprint)` : 'Decoupled Hub-and-Spoke Agent Session'}
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {isTeam ? (
                    <>
                      Backed by LangGraph multi-agent supervisor. Queries are triaged to specialized workers (
                      <span className="text-emerald-400">
                        {activeTeam?.workers.map((w) => w.name).join(', ')}
                      </span>
                      ) with independent MCP Gateway tool assignments and <strong className="text-cyan-400">PostgresSaver</strong> state checkpointer.
                    </>
                  ) : (
                    <>
                      Interacting with a stateless LangGraph worker backed by <strong className="text-emerald-400">PostgresSaver</strong> and our proprietary <strong className="text-emerald-400">MCP Gateway</strong>.
                    </>
                  )}
                </p>
              </div>

              {/* Sample Prompt Starters */}
              <div className="w-full space-y-2 pt-2">
                <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider text-left">
                  Try a prompt for {currentDisplayName}:
                </div>
                <div className="space-y-1.5 text-left">
                  {activeSamplePrompts.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => handleSendMessage(prompt)}
                      className="w-full text-left text-xs px-3.5 py-2 rounded-lg bg-zinc-900/90 border border-zinc-800 hover:border-emerald-500/50 hover:bg-zinc-800/80 text-zinc-300 hover:text-white transition-all flex items-center justify-between group"
                    >
                      <span className="truncate pr-2">{prompt}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-emerald-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 text-xs ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    msg.isTeamBlueprint
                      ? 'bg-purple-950 border border-purple-800 text-purple-400'
                      : 'bg-emerald-950 border border-emerald-800 text-emerald-400'
                  }`}>
                    {msg.isTeamBlueprint ? <Users className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 space-y-2.5 ${
                    msg.role === 'user'
                      ? 'bg-emerald-600/90 text-white rounded-tr-none'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-tl-none shadow-md'
                  }`}
                >
                  {/* Persona / Supervisor Metadata Header */}
                  {msg.role === 'assistant' && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-zinc-800/80 text-[11px] font-mono">
                      <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                        <Sparkles className="w-3 h-3" />
                        <span>{msg.profileName || currentDisplayName}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {msg.activeWorker && (
                          <span className="text-[10px] text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800/60 font-semibold flex items-center gap-1">
                            <Bot className="w-3 h-3" />
                            Dispatched: {msg.activeWorker}
                          </span>
                        )}
                        {msg.checkpointId && (
                          <span className="text-[10px] text-zinc-500 bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700/50">
                            {msg.checkpointId}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Message Body */}
                  <div className="whitespace-pre-wrap leading-relaxed text-[13px]">
                    {msg.content}
                  </div>

                  {/* Executed Tools Card */}
                  {msg.toolsExecuted && msg.toolsExecuted.length > 0 && (
                    <div className="pt-2 border-t border-zinc-800/70 space-y-2">
                      <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
                        <Terminal className="w-3 h-3 text-emerald-400" />
                        <span>Gateway Tools Executed (0 Credential Exposure):</span>
                      </div>
                      {msg.toolsExecuted.map((tool, idx) => (
                        <div
                          key={idx}
                          className="bg-black/40 border border-zinc-800 rounded-lg p-2.5 font-mono text-[11px] space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-zinc-300">
                            <span className="text-emerald-400 font-semibold">{tool.toolName}</span>
                            <span className="text-zinc-500 text-[10px]">
                              {tool.serverProvider} • {tool.latencyMs}ms
                            </span>
                          </div>
                          <div className="text-zinc-400 text-[10px]">
                            Arguments: {JSON.stringify(tool.arguments)}
                          </div>
                          <div className="bg-zinc-950/80 rounded p-1.5 text-zinc-300 overflow-x-auto text-[10px]">
                            {JSON.stringify(tool.output, null, 2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-[10px] text-right font-mono text-zinc-500 pt-0.5">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shrink-0 mt-0.5">
                    <span className="font-mono text-xs font-bold">U</span>
                  </div>
                )}
              </div>
            ))
          )}

          {isSending && (
            <div className="flex gap-3 text-xs justify-start items-center">
              <div className="w-7 h-7 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400 animate-pulse">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-zinc-900 border border-zinc-800 text-zinc-400 rounded-xl px-4 py-3 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                <span className="font-mono text-xs">
                  {isTeam
                    ? `Supervisor routing query to staff workers in ${currentDisplayName}...`
                    : `Gateway compiling ${currentDisplayName} tools & querying LangGraph PostgresSaver...`}
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar & Suggested Chips */}
        <div className="p-4 border-t border-zinc-800 bg-[#0c0e14] shrink-0 space-y-2.5">
          {/* Quick prompt suggestions */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-mono no-scrollbar">
            <span className="text-zinc-500 shrink-0">Quick Ask:</span>
            {activeSamplePrompts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(p)}
                className="shrink-0 px-2.5 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/60 transition-colors whitespace-nowrap"
              >
                {p}
              </button>
            ))}
          </div>

          {/* Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={`Ask ${currentDisplayName} using dynamic Gateway tools...`}
                disabled={isSending}
                className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-4 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <span className="absolute right-3 top-2.5 text-[10px] font-mono text-zinc-500">
                POST /v1/chat/generate
              </span>
            </div>

            <button
              type="submit"
              disabled={isSending || !inputMessage.trim()}
              className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-xs flex items-center gap-1.5 transition-all shadow-md shadow-emerald-950/40"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIGHT-HAND INSPECTOR (Gateway Hub, Checkpoints Audit, & Architecture) */}
      {/* ========================================================================= */}
      <div className="w-96 flex flex-col bg-[#0b0d13] shrink-0 border-l border-zinc-800">
        {/* Tab Selector */}
        <div className="flex border-b border-zinc-800 text-xs font-mono bg-[#0e1118]">
          <button
            onClick={() => setInspectorTab('gateway')}
            className={`flex-1 py-3 px-2 text-center font-medium transition-colors border-b-2 flex items-center justify-center gap-1.5 ${
              inspectorTab === 'gateway'
                ? 'border-emerald-500 text-emerald-400 bg-zinc-900/50'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Gateway Hub</span>
          </button>
          <button
            onClick={() => setInspectorTab('checkpoints')}
            className={`flex-1 py-3 px-2 text-center font-medium transition-colors border-b-2 flex items-center justify-center gap-1.5 ${
              inspectorTab === 'checkpoints'
                ? 'border-emerald-500 text-emerald-400 bg-zinc-900/50'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Checkpoints ({checkpoints.length})</span>
          </button>
          <button
            onClick={() => setInspectorTab('spec')}
            className={`flex-1 py-3 px-2 text-center font-medium transition-colors border-b-2 flex items-center justify-center gap-1.5 ${
              inspectorTab === 'spec'
                ? 'border-emerald-500 text-emerald-400 bg-zinc-900/50'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>API & cURL</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* TAB 1: GATEWAY HUB & SPOKES */}
          {inspectorTab === 'gateway' && (
            <div className="space-y-4 text-xs">
              {/* Architecture Topology Badge */}
              <div className="p-3.5 rounded-lg bg-emerald-950/30 border border-emerald-800/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-300 font-mono text-[11px] uppercase tracking-wider">
                    Decoupled Hub-and-Spoke Pattern
                  </span>
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                </div>
                <p className="text-[11px] text-zinc-300 leading-relaxed">
                  The LLM runtime has <strong>0 direct credential access</strong>. The upstream MCP Gateway binds pre-authenticated OAuth tokens from the Supabase Vault per active <code className="text-emerald-400">profile_id</code>.
                </p>
              </div>

              {/* Active Blueprint Compiled Tools & Workers */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-zinc-400 font-mono text-[11px]">
                  <span>{isTeam ? 'STAFF WORKERS & SCOPED TOOLS' : 'DYNAMICALLY BOUND TOOLS'}</span>
                  <span className="text-emerald-400 font-bold">{currentToolsCount} Tools</span>
                </div>
                {isTeam && activeTeam ? (
                  <div className="space-y-2">
                    {activeTeam.workers.map((worker) => (
                      <div
                        key={worker.id}
                        className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                            <Bot className="w-3.5 h-3.5 text-purple-400" />
                            {worker.name}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400">
                            {worker.mcpTools?.length || 0} tools
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400">{worker.role}</div>
                        <div className="flex flex-wrap gap-1 pt-1">
                          {worker.mcpTools?.map((t, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 font-mono text-[10px] text-emerald-400"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {(activePersona?.tools || []).map((toolName, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-md bg-zinc-900 border border-zinc-800 flex items-start gap-2.5"
                      >
                        <div className="w-5 h-5 rounded bg-zinc-800 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                          <Terminal className="w-3 h-3" />
                        </div>
                        <div className="space-y-0.5 min-w-0">
                          <div className="font-mono text-zinc-200 font-semibold truncate">
                            {toolName}
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            Exposed via MCP Gateway proxy to worker
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Upstream Tenant Auth Vault (Spokes) */}
              <div className="space-y-2 pt-2 border-t border-zinc-800">
                <div className="flex items-center justify-between text-zinc-400 font-mono text-[11px]">
                  <span>TENANT AUTH VAULT (SPOKES)</span>
                  <span className="text-zinc-500">AES-256-GCM</span>
                </div>
                <div className="space-y-2">
                  {vaultSpokes.map((spoke) => (
                    <div
                      key={spoke.id}
                      className="p-2.5 rounded-md bg-zinc-900/80 border border-zinc-800 text-[11px] space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-white flex items-center gap-1.5">
                          <Lock className="w-3 h-3 text-emerald-400" />
                          {spoke.providerName}
                        </span>
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/40">
                          Active
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono truncate">
                        Account: {spoke.accountLabel}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        Key: {spoke.keyFingerprint}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: POSTGRESSAVER CHECKPOINTS AUDIT */}
          {inspectorTab === 'checkpoints' && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between text-zinc-400 font-mono text-[11px]">
                <span>TIMELINE CHECKPOINT LOGS</span>
                <span className="text-zinc-500 font-mono">{checkpoints.length} Records</span>
              </div>

              {checkpoints.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-xs font-mono">
                  No checkpoints yet for thread {currentThreadId}.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {checkpoints.map((chk, index) => (
                    <div
                      key={chk.checkpointId}
                      onClick={() => setSelectedCheckpointModal(chk)}
                      className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-emerald-500/60 cursor-pointer transition-all space-y-1.5"
                    >
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="text-emerald-400 font-bold">Step #{chk.stepIndex}</span>
                        <span className="text-zinc-500 text-[10px]">
                          {new Date(chk.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-zinc-200 font-medium">
                        <span className="text-zinc-400 text-[10px] uppercase font-mono">Persona:</span>
                        <span className="text-white text-xs">{chk.profileName}</span>
                      </div>

                      <div className="text-zinc-400 text-[11px] line-clamp-1 italic">
                        &quot;{chk.userMessage}&quot;
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-1 border-t border-zinc-800/60">
                        <span>Tools: {chk.toolsExecuted?.length || 0} called</span>
                        <span className="text-emerald-400/90">{chk.checkpointId}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: API SPEC & CURL */}
          {inspectorTab === 'spec' && (
            <div className="space-y-4 text-xs font-mono">
              <div className="space-y-1.5">
                <span className="text-zinc-400 text-[11px] uppercase tracking-wider">
                  DYNAMIC GENERATION ENDPOINT
                </span>
                <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-emerald-400 text-[11px]">
                  POST /v1/chat/generate
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                  <span>REQUEST BODY SCHEMA</span>
                  <button
                    onClick={copyCurl}
                    className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                  >
                    {copiedCurl ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCurl ? 'Copied' : 'Copy cURL'}</span>
                  </button>
                </div>
                <pre className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-[10px] text-zinc-300 overflow-x-auto">
{`{
  "thread_id": "${currentThreadId}",
  "tenant_id": "${tenantId}",
  "profile_id": "${selectedProfileId}",
  "message": "What did the lead say?"
}`}
                </pre>
              </div>

              <div className="space-y-1.5">
                <span className="text-zinc-400 text-[11px]">LANGGRAPH POSTGRESSAVER CONFIG</span>
                <pre className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-[10px] text-zinc-300 overflow-x-auto">
{`config = {
  "configurable": {
    "thread_id": "${currentThreadId}",
    "tenant_id": "${tenantId}",
    "profile_id": "${selectedProfileId}"
  }
}
# Hydrates latest checkpoint:
# ORDER BY checkpoint_id DESC LIMIT 1
await graph.ainvoke(input, config=config)`}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Checkpoint Detail Inspector Modal */}
      {selectedCheckpointModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#0e1118] border border-zinc-800 rounded-xl max-w-xl w-full p-5 space-y-4 max-h-[85vh] flex flex-col font-mono text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  PostgresSaver Checkpoint Snapshot
                </h3>
                <span className="text-emerald-400 text-[11px]">
                  {selectedCheckpointModal.checkpointId}
                </span>
              </div>
              <button
                onClick={() => setSelectedCheckpointModal(null)}
                className="text-zinc-400 hover:text-white text-xs px-2 py-1 bg-zinc-800 rounded"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 text-[11px]">
              <div>
                <span className="text-zinc-500 uppercase">Profile Active:</span>{' '}
                <span className="text-zinc-200 font-semibold">{selectedCheckpointModal.profileName}</span>
              </div>
              <div>
                <span className="text-zinc-500 uppercase">User Input:</span>
                <p className="text-zinc-300 bg-zinc-900 p-2 rounded mt-1">
                  {selectedCheckpointModal.userMessage}
                </p>
              </div>
              <div>
                <span className="text-zinc-500 uppercase">Assistant Response:</span>
                <p className="text-zinc-300 bg-zinc-900 p-2 rounded mt-1 whitespace-pre-wrap">
                  {selectedCheckpointModal.assistantMessage}
                </p>
              </div>
              <div>
                <span className="text-zinc-500 uppercase">Audit Metadata:</span>
                <pre className="bg-black/60 p-2 rounded text-zinc-400 text-[10px] mt-1 overflow-x-auto">
                  {JSON.stringify(selectedCheckpointModal, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
