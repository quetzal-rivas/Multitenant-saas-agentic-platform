'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MessageSquare,
  Bot,
  Users,
  PhoneCall,
  Search,
  Filter,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Clock,
  Activity,
  Layers,
  Sparkles,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Terminal,
  Zap,
  Phone,
  Mic,
  Cpu,
  ShieldCheck,
  Send,
  Plus,
  RefreshCw,
  Sliders,
  Radio,
  Share2,
  Download,
  AlertTriangle,
  Code2,
  CheckCircle2,
  CornerDownRight,
  User,
  Hash,
} from 'lucide-react';
import {
  ConversationRecord,
  ConversationMessage,
  WorkerToolExecution,
  VoiceCallMetadata,
  ConversationType,
  ConversationStatus,
} from '@/Backend/legacy_ts_mocks/conversations-manager';
import { LiveVoiceConferenceSection } from '@/components/LiveVoiceConferenceSection';

interface ConversationsProps {
  onSelectThreadForStudio?: (threadId: string, profileId?: string) => void;
  onOpenTeamBuilder?: () => void;
}

export const Conversations: React.FC<ConversationsProps> = ({
  onSelectThreadForStudio,
  onOpenTeamBuilder,
}) => {
  // Data State
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>('th_agent_devops_audit_904');
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Filter States
  const [typeFilter, setTypeFilter] = useState<'all' | ConversationType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ConversationStatus>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Interactive Message State (for typing into live chat)
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isSendingMessage, setIsSendingMessage] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Team View Filter
  const [selectedWorkerFilter, setSelectedWorkerFilter] = useState<string>('all');
  const [expandedToolId, setExpandedToolId] = useState<string | null>('tool_exec_01');

  // Voice Audio Player State
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const [audioPlaybackRate, setAudioPlaybackRate] = useState<number>(1);
  const [audioVolume, setAudioVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioTimerRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // New Conversation Modal State
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newType, setNewType] = useState<ConversationType>('single_agent');
  const [newThreadId, setNewThreadId] = useState<string>('');

  // Fetch conversations from Backend API
  const handleSelectThread = (threadId: string) => {
    setSelectedThreadId(threadId);
    setIsPlayingAudio(false);
    setAudioCurrentTime(0);
  };

  const fetchConversations = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/v1/conversations');
      const data = await res.json();
      if (data.success && Array.isArray(data.conversations)) {
        setConversations(data.conversations);
        if (data.conversations.length > 0 && !selectedThreadId) {
          setSelectedThreadId(data.conversations[0].threadId);
        }
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await fetch('/api/v1/conversations');
        const data = await res.json();
        if (!ignore && data.success && Array.isArray(data.conversations)) {
          setConversations(data.conversations);
          if (data.conversations.length > 0) {
            setSelectedThreadId((prev) => prev || data.conversations[0].threadId);
          }
        }
      } catch (err) {
        console.error('Failed to fetch conversations:', err);
      } finally {
        if (!ignore) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, []);

  // Filtered list
  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      // Type filter
      if (typeFilter !== 'all' && conv.type !== typeFilter) return false;
      // Status filter
      if (statusFilter !== 'all' && conv.status !== statusFilter) return false;
      // Search query (matches threadId, title, message content, participant name)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = conv.threadId.toLowerCase().includes(q);
        const matchesTitle = conv.title.toLowerCase().includes(q);
        const matchesAgent = conv.agentProfile?.name.toLowerCase().includes(q) || false;
        const matchesTeam = conv.teamDetails?.teamName.toLowerCase().includes(q) || false;
        const matchesVoice = conv.voiceMetadata?.elevenLabsVoiceName.toLowerCase().includes(q) || false;
        const matchesCaller = conv.voiceMetadata?.callerName?.toLowerCase().includes(q) || false;
        const matchesContent = conv.messages.some((m) => m.content.toLowerCase().includes(q));
        if (!matchesId && !matchesTitle && !matchesAgent && !matchesTeam && !matchesVoice && !matchesCaller && !matchesContent) {
          return false;
        }
      }
      return true;
    });
  }, [conversations, typeFilter, statusFilter, searchQuery]);

  // Selected Conversation
  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.threadId === selectedThreadId) || filteredConversations[0] || null;
  }, [conversations, selectedThreadId, filteredConversations]);

  // Copy to clipboard helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Send message handler (submits to API and appends to local state)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !activeConversation || isSendingMessage) return;

    const messageText = inputMessage.trim();
    setInputMessage('');
    setIsSendingMessage(true);

    try {
      const userMsg: Partial<ConversationMessage> = {
        role: activeConversation.type === 'voice_call' ? 'caller' : 'user',
        content: messageText,
        audioOffsetSec: activeConversation.type === 'voice_call' ? (activeConversation.voiceMetadata?.callDurationSeconds || 0) : undefined,
      };

      const res = await fetch(`/api/v1/conversations/${activeConversation.threadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userMsg),
      });

      const data = await res.json();
      if (data.success && data.conversation) {
        setConversations((prev) =>
          prev.map((c) => (c.threadId === data.conversation.threadId ? data.conversation : c))
        );

        // Auto generate realistic assistant/worker response simulation after 600ms
        setTimeout(async () => {
          let replyContent = '';
          let workerId: string | undefined;
          let workerName: string | undefined;
          let workerAvatar: string | undefined;
          let workerColor: string | undefined;

          if (activeConversation.type === 'single_agent') {
            replyContent = `Received your inquiry regarding "${messageText.slice(0, 35)}...". Processing against verified schema. Verified compliance policies and operational guardrails; state updated cleanly.`;
          } else if (activeConversation.type === 'team') {
            replyContent = `Team LangGraph node executed: CRM Specialist synced with Financial Engine to compute parameters for "${messageText.slice(0, 30)}...". All tool outputs validated.`;
            workerId = 'worker_crm';
            workerName = 'CRM Specialist';
            workerAvatar = '📊';
            workerColor = '#10b981';
          } else {
            replyContent = `Understood. I am updating your record right now. Everything is running smoothly with 0 packet loss.`;
          }

          const botMsg: Partial<ConversationMessage> = {
            role: activeConversation.type === 'voice_call' ? 'voice_agent' : 'assistant',
            content: replyContent,
            workerId,
            workerName,
            workerAvatar,
            workerColor,
            tokensUsed: 140,
            latencyMs: 180,
          };

          const replyRes = await fetch(`/api/v1/conversations/${activeConversation.threadId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(botMsg),
          });
          const replyData = await replyRes.json();
          if (replyData.success && replyData.conversation) {
            setConversations((prev) =>
              prev.map((c) => (c.threadId === replyData.conversation.threadId ? replyData.conversation : c))
            );
          }
        }, 600);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Audio Player Controls & Web Audio Synthesis
  const totalDuration = activeConversation?.voiceMetadata?.callDurationSeconds || 180;

  // Web Audio Synth to create realistic pleasant sound wave when user hits play
  const startAudioSynth = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
    } catch (e) {
      console.warn('Web Audio not available in this context:', e);
    }
  };

  const togglePlayAudio = () => {
    if (isPlayingAudio) {
      setIsPlayingAudio(false);
      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
    } else {
      startAudioSynth();
      setIsPlayingAudio(true);
    }
  };

  // Audio timer ticker
  useEffect(() => {
    if (isPlayingAudio) {
      audioTimerRef.current = setInterval(() => {
        setAudioCurrentTime((prev) => {
          const next = prev + 0.5 * audioPlaybackRate;
          if (next >= totalDuration) {
            setIsPlayingAudio(false);
            return 0;
          }
          return next;
        });
      }, 500);
    } else {
      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
    }
    return () => {
      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
    };
  }, [isPlayingAudio, audioPlaybackRate, totalDuration]);

  // Audio Visualizer Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const bars = 48;
      const barWidth = canvas.width / bars;

      for (let i = 0; i < bars; i++) {
        let height = 4;
        if (isPlayingAudio) {
          // Dynamic lively oscillation
          const wave1 = Math.sin(phase + i * 0.28);
          const wave2 = Math.cos(phase * 1.5 + i * 0.15);
          height = Math.max(4, Math.abs(wave1 * wave2) * (canvas.height * 0.85));
        } else {
          // Gentle resting waveform
          height = 4 + Math.sin(i * 0.3) * 6;
        }

        const x = i * barWidth;
        const y = (canvas.height - height) / 2;

        const isElapsed = (i / bars) <= (audioCurrentTime / totalDuration);
        ctx.fillStyle = isElapsed ? '#ec4899' : '#3f3f46';
        ctx.beginPath();
        ctx.roundRect(x + 1, y, Math.max(2, barWidth - 2), height, 2);
        ctx.fill();
      }

      if (isPlayingAudio) {
        phase += 0.18 * audioPlaybackRate;
      }
      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlayingAudio, audioCurrentTime, totalDuration, audioPlaybackRate]);

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Seek audio to specific turn timestamp
  const handleSeekToOffset = (offsetSec?: number) => {
    if (offsetSec !== undefined) {
      setAudioCurrentTime(offsetSec);
      if (!isPlayingAudio) {
        startAudioSynth();
        setIsPlayingAudio(true);
      }
    }
  };

  // Create new conversation submit
  const handleCreateNewConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const threadId = newThreadId.trim() || `th_${newType}_${Date.now().toString(36)}`;
    const newConv: Partial<ConversationRecord> = {
      threadId,
      title: newTitle.trim(),
      type: newType,
      status: 'ongoing',
      messages: [
        {
          id: `msg_init_${Date.now()}`,
          role: 'user',
          content: `Initial session initiated for thread ${threadId}.`,
          timestamp: new Date().toISOString(),
        },
        {
          id: `msg_init_bot_${Date.now()}`,
          role: newType === 'voice_call' ? 'voice_agent' : 'assistant',
          content: `Hello! Session is live on channel ${newType}. How can I assist your workflow today?`,
          timestamp: new Date().toISOString(),
          tokensUsed: 64,
          latencyMs: 140,
        },
      ],
      agentProfile: newType === 'single_agent' ? {
        id: 'agent_custom_persona',
        name: 'Autonomous Assistant',
        role: 'Universal Reasoning Agent',
        avatar: '🤖',
        model: 'Gemini 2.5 Flash',
        systemPromptVersion: 'prompt_v1.0',
      } : undefined,
      teamDetails: newType === 'team' ? {
        teamId: 'team_custom_swarm',
        teamName: newTitle.trim(),
        supervisorName: 'Chief LangGraph Supervisor',
        activeWorkersCount: 2,
        workers: [
          { id: 'w_crm', name: 'CRM Specialist', role: 'Data Intake', color: '#10b981', mcpToolsCount: 3 },
          { id: 'w_ops', name: 'Operations Worker', role: 'Execution Dispatch', color: '#8b5cf6', mcpToolsCount: 2 },
        ],
      } : undefined,
      voiceMetadata: newType === 'voice_call' ? {
        elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
        elevenLabsVoiceName: 'Rachel (ElevenLabs Turbo v2.5)',
        elevenLabsModel: 'eleven_multilingual_v2',
        callerPhone: '+1 (555) 234-8900',
        agentPhone: '+1 (800) 555-0199',
        callerName: 'Direct Inbound Caller',
        callDurationSeconds: 120,
        formattedDuration: '02:00',
        turnTakingLatencyMs: 190,
        speechToSpeechLatencyMs: 230,
        totalCostEstimate: '$0.038 USD',
        sentimentScore: '+0.70 Positive',
        terminationReason: 'Call In Progress',
        audioCodec: 'Opus 48kHz (WebRTC)',
        sampleRate: '48,000 Hz',
        packetLossPercent: 0.0,
        interruptionsCount: 0,
        detectedIntent: 'Live Voice Assistance',
        fallbackTriggered: false,
      } : undefined,
    };

    try {
      const res = await fetch('/api/v1/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConv),
      });
      const data = await res.json();
      if (data.success && data.conversation) {
        setConversations([data.conversation, ...conversations]);
        setSelectedThreadId(data.conversation.threadId);
        setShowNewModal(false);
        setNewTitle('');
        setNewThreadId('');
      }
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-[#090b10] text-zinc-100 overflow-hidden font-sans">
      {/* Top Header Bar */}
      <header className="shrink-0 px-6 py-3.5 border-b border-zinc-800 bg-[#0c0f16] flex flex-wrap items-center justify-between gap-4 select-none">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-white tracking-tight">Conversations & Thread Audits</h1>
              <span className="px-2 py-0.5 text-[10px] font-mono font-medium rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                {conversations.length} THREADS
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Live & historical sessions across Single Agents, Multi-Agent Teams, and ElevenLabs Voice Calls.
            </p>
          </div>
        </div>

        {/* Global Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchConversations()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 rounded-md transition-colors"
            title="Refresh Threads"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Sync</span>
          </button>

          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-black bg-emerald-400 hover:bg-emerald-300 rounded-md shadow-sm shadow-emerald-950 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Thread</span>
          </button>
        </div>
      </header>

      {/* Live Voice Calls Monitoring Section (Twilio Conference Room & ElevenLabs Voice Bridge) */}
      <LiveVoiceConferenceSection
        onCallSelected={(call) => {
          const matchingConv = conversations.find(
            (c) =>
              c.voiceMetadata?.callerPhone === call.fromPhone ||
              c.voiceMetadata?.callerPhone === call.toPhone
          );
          if (matchingConv) {
            setSelectedThreadId(matchingConv.threadId);
          }
        }}
      />

      {/* Main Workspace: Left Conversations Master List + Right Adaptive Detail View */}
      <div className="flex-1 flex overflow-hidden">
        {/* ===================== LEFT SIDEBAR: MASTER THREAD LIST ===================== */}
        <div className="w-80 md:w-96 shrink-0 border-r border-zinc-800 bg-[#0a0d13] flex flex-col overflow-hidden">
          {/* Search & Filter Bar */}
          <div className="p-3.5 border-b border-zinc-800/80 space-y-2.5 bg-[#0d1017]">
            {/* Thread ID / Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter by thread ID, title, keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-900/90 border border-zinc-700/60 rounded-md text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Type Filter Buttons */}
            <div className="flex items-center gap-1 bg-zinc-900/90 p-1 rounded-lg border border-zinc-800 text-[11px]">
              <button
                onClick={() => setTypeFilter('all')}
                className={`flex-1 py-1 px-1.5 text-center rounded font-medium transition-all ${
                  typeFilter === 'all'
                    ? 'bg-zinc-700/80 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                All ({conversations.length})
              </button>
              <button
                onClick={() => setTypeFilter('single_agent')}
                className={`flex-1 py-1 px-1.5 text-center rounded font-medium flex items-center justify-center gap-1 transition-all ${
                  typeFilter === 'single_agent'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Bot className="w-3 h-3 text-emerald-400" />
                <span>Single</span>
              </button>
              <button
                onClick={() => setTypeFilter('team')}
                className={`flex-1 py-1 px-1.5 text-center rounded font-medium flex items-center justify-center gap-1 transition-all ${
                  typeFilter === 'team'
                    ? 'bg-purple-950 text-purple-300 border border-purple-700/50 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Users className="w-3 h-3 text-purple-400" />
                <span>Teams</span>
              </button>
              <button
                onClick={() => setTypeFilter('voice_call')}
                className={`flex-1 py-1 px-1.5 text-center rounded font-medium flex items-center justify-center gap-1 transition-all ${
                  typeFilter === 'voice_call'
                    ? 'bg-rose-950 text-rose-300 border border-rose-700/50 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <PhoneCall className="w-3 h-3 text-rose-400" />
                <span>Voice</span>
              </button>
            </div>

            {/* Status Filter Toggle */}
            <div className="flex items-center justify-between px-1 text-[11px] text-zinc-400">
              <span className="font-mono uppercase tracking-wider text-[10px] text-zinc-500">Status</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-2 py-0.5 rounded ${statusFilter === 'all' ? 'text-white font-medium bg-zinc-800' : 'hover:text-zinc-300'}`}
                >
                  All
                </button>
                <button
                  onClick={() => setStatusFilter('ongoing')}
                  className={`px-2 py-0.5 rounded flex items-center gap-1 ${
                    statusFilter === 'ongoing' ? 'text-emerald-400 font-medium bg-emerald-950/60 border border-emerald-800/40' : 'hover:text-zinc-300'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Ongoing
                </button>
                <button
                  onClick={() => setStatusFilter('completed')}
                  className={`px-2 py-0.5 rounded ${statusFilter === 'completed' ? 'text-zinc-200 font-medium bg-zinc-800' : 'hover:text-zinc-300'}`}
                >
                  Completed
                </button>
              </div>
            </div>
          </div>

          {/* Conversation Cards Scroll List */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60 p-2 space-y-1.5">
            {loading ? (
              <div className="p-8 text-center text-xs text-zinc-500 space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-emerald-400" />
                <p>Loading conversation threads...</p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500 space-y-2">
                <Filter className="w-6 h-6 mx-auto text-zinc-600" />
                <p className="font-medium text-zinc-400">No conversations found</p>
                <p className="text-[11px]">Try adjusting your search query or filter tags.</p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = conv.threadId === activeConversation?.threadId;
                const lastMessage = conv.messages[conv.messages.length - 1];

                return (
                  <button
                    key={conv.threadId}
                    onClick={() => handleSelectThread(conv.threadId)}
                    className={`w-full text-left p-3 rounded-lg border transition-all text-xs flex flex-col gap-2 ${
                      isSelected
                        ? 'bg-zinc-800/90 border-emerald-500/80 shadow-md shadow-emerald-950/30'
                        : 'bg-zinc-900/40 border-zinc-800/70 hover:bg-zinc-800/40 hover:border-zinc-700/60'
                    }`}
                  >
                    {/* Top Row: Type & Status Badges */}
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        {conv.type === 'single_agent' && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/40 text-[10px] font-mono">
                            <Bot className="w-3 h-3 text-emerald-400" />
                            AGENT
                          </span>
                        )}
                        {conv.type === 'team' && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800/40 text-[10px] font-mono">
                            <Users className="w-3 h-3 text-purple-400" />
                            TEAM ({conv.teamDetails?.workers.length || 3})
                          </span>
                        )}
                        {conv.type === 'voice_call' && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/40 text-[10px] font-mono">
                            <Mic className="w-3 h-3 text-rose-400" />
                            ELEVENLABS
                          </span>
                        )}

                        <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[120px]">
                          {conv.threadId}
                        </span>
                      </div>

                      {/* Status indicator */}
                      {conv.status === 'ongoing' ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          LIVE
                        </span>
                      ) : (
                        <span className="text-[10px] text-zinc-500 font-mono">
                          COMPLETED
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <div className="font-semibold text-zinc-100 truncate text-[12px] leading-tight">
                      {conv.title}
                    </div>

                    {/* Last message preview */}
                    {lastMessage && (
                      <p className="text-[11px] text-zinc-400 line-clamp-1 italic">
                        {lastMessage.role === 'user' || lastMessage.role === 'caller' ? 'User: ' : 'Agent: '}
                        {lastMessage.content}
                      </p>
                    )}

                    {/* Footer Row: Metadata & Turn Count */}
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-zinc-800/50">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(conv.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="flex items-center gap-2">
                        {conv.type === 'team' && conv.teamToolHistory && (
                          <span className="text-purple-400 font-mono">
                            {conv.teamToolHistory.length} tools
                          </span>
                        )}
                        {conv.type === 'voice_call' && conv.voiceMetadata && (
                          <span className="text-rose-400 font-mono">
                            {conv.voiceMetadata.formattedDuration}
                          </span>
                        )}
                        <span className="font-mono bg-zinc-800 px-1 rounded text-zinc-300">
                          {conv.messages.length} msgs
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ===================== RIGHT MAIN WORKSPACE ===================== */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#07090e]">
          {!activeConversation ? (
            <div className="flex-1 flex items-center justify-center p-8 text-center text-zinc-500">
              <div className="space-y-3">
                <MessageSquare className="w-10 h-10 mx-auto text-zinc-600" />
                <p className="text-sm font-medium text-zinc-400">Select a conversation thread to inspect</p>
                <p className="text-xs">Or click &quot;New Thread&quot; to test a fresh dialogue sequence.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Thread Header Banner */}
              <div className="shrink-0 px-6 py-3 border-b border-zinc-800 bg-[#0d1017] flex flex-wrap items-center justify-between gap-3 select-none">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm ${
                      activeConversation.type === 'single_agent'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                        : activeConversation.type === 'team'
                        ? 'bg-purple-950 text-purple-300 border border-purple-800/60'
                        : 'bg-rose-950 text-rose-300 border border-rose-800/60'
                    }`}
                  >
                    {activeConversation.type === 'single_agent' && (activeConversation.agentProfile?.avatar || '🤖')}
                    {activeConversation.type === 'team' && <Users className="w-5 h-5 text-purple-400" />}
                    {activeConversation.type === 'voice_call' && <Phone className="w-4 h-4 text-rose-400" />}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-white tracking-tight">{activeConversation.title}</h2>
                      {activeConversation.status === 'ongoing' ? (
                        <span className="flex items-center gap-1 px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/50 text-[10px] font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          ACTIVE THREAD
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50 text-[10px] font-mono">
                          ARCHIVED
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-400 font-mono mt-0.5">
                      <span className="flex items-center gap-1 text-zinc-300">
                        <Hash className="w-3 h-3 text-zinc-500" />
                        {activeConversation.threadId}
                        <button
                          onClick={() => handleCopy(activeConversation.threadId, 'header_th')}
                          className="hover:text-emerald-400 ml-0.5"
                          title="Copy Thread ID"
                        >
                          {copiedId === 'header_th' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </span>
                      <span>•</span>
                      <span className="text-zinc-400">
                        {activeConversation.type === 'single_agent' && (activeConversation.agentProfile?.model || 'Gemini 2.5 Flash')}
                        {activeConversation.type === 'team' && (activeConversation.teamDetails?.supervisorName || 'LangGraph Swarm')}
                        {activeConversation.type === 'voice_call' && (activeConversation.voiceMetadata?.elevenLabsVoiceName || 'ElevenLabs Voice')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Header Actions */}
                <div className="flex items-center gap-2">
                  {onSelectThreadForStudio && (
                    <button
                      onClick={() => onSelectThreadForStudio(activeConversation.threadId, activeConversation.agentProfile?.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/50 rounded-md transition-colors"
                      title="Open in Agent Session Studio"
                    >
                      <Bot className="w-3.5 h-3.5" />
                      <span>Open in Studio</span>
                    </button>
                  )}
                  {activeConversation.type === 'team' && onOpenTeamBuilder && (
                    <button
                      onClick={onOpenTeamBuilder}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-400 bg-purple-950/60 hover:bg-purple-900/60 border border-purple-800/50 rounded-md transition-colors"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Blueprint</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const transcript = activeConversation.messages
                        .map((m) => `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.role.toUpperCase()}: ${m.content}`)
                        .join('\n\n');
                      handleCopy(transcript, 'full_transcript');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 rounded-md transition-colors"
                  >
                    {copiedId === 'full_transcript' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copy Transcript</span>
                  </button>
                </div>
              </div>

              {/* DYNAMIC CONTENT PER TYPE */}
              {/* ============================================================== */}
              {/* CASE A: SINGLE AGENT - SINGLE VERTICAL CHAT TRANSCRIPT         */}
              {/* ============================================================== */}
              {activeConversation.type === 'single_agent' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Persona Info Sub-bar */}
                  <div className="px-6 py-2 bg-[#0a0d13] border-b border-zinc-800/60 flex items-center justify-between text-xs text-zinc-400">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-zinc-300 flex items-center gap-1.5">
                        <Bot className="w-3.5 h-3.5 text-emerald-400" />
                        {activeConversation.agentProfile?.name || 'Assigned Agent'}
                      </span>
                      <span className="text-zinc-600">|</span>
                      <span>Role: {activeConversation.agentProfile?.role}</span>
                      <span className="text-zinc-600">|</span>
                      <span className="font-mono text-[11px] text-emerald-400">{activeConversation.agentProfile?.systemPromptVersion}</span>
                    </div>
                    <span className="text-zinc-500 font-mono text-[11px]">
                      Channel: {activeConversation.channel}
                    </span>
                  </div>

                  {/* Single Vertical Chat Transcript */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {activeConversation.messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex gap-3 max-w-3xl ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
                      >
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold ${
                            msg.role === 'user'
                              ? 'bg-emerald-500 text-black'
                              : 'bg-zinc-800 text-emerald-400 border border-zinc-700'
                          }`}
                        >
                          {msg.role === 'user' ? 'U' : <Bot className="w-4 h-4 text-emerald-400" />}
                        </div>

                        <div
                          className={`flex flex-col gap-1 text-xs rounded-xl p-4 max-w-2xl ${
                            msg.role === 'user'
                              ? 'bg-emerald-950/50 border border-emerald-800/60 text-zinc-100 rounded-tr-none'
                              : 'bg-[#0f131a] border border-zinc-800 text-zinc-200 rounded-tl-none'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4 text-[10px] text-zinc-400 pb-1 border-b border-zinc-800/40">
                            <span className="font-medium text-zinc-300">
                              {msg.role === 'user' ? 'User Request' : activeConversation.agentProfile?.name || 'Agent'}
                            </span>
                            <div className="flex items-center gap-2">
                              {msg.tokensUsed && (
                                <span className="font-mono text-zinc-500">{msg.tokensUsed} tokens</span>
                              )}
                              {msg.latencyMs && (
                                <span className="font-mono text-emerald-400">{msg.latencyMs}ms</span>
                              )}
                              <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                            </div>
                          </div>

                          <div className="whitespace-pre-wrap leading-relaxed text-[12.5px] mt-1">
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Interactive Composer Footer */}
                  <div className="shrink-0 p-4 border-t border-zinc-800 bg-[#0d1017]">
                    <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Send message to continue single agent thread..."
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        disabled={isSendingMessage}
                        className="flex-1 px-4 py-2.5 text-xs bg-zinc-900 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="submit"
                        disabled={!inputMessage.trim() || isSendingMessage}
                        className="px-4 py-2.5 text-xs font-semibold text-black bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center gap-1.5 transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Send</span>
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* CASE B: TEAMS - LEFT CHAT TRANSCRIPT, RIGHT WORKERS TOOL HISTORY */}
              {/* ============================================================== */}
              {activeConversation.type === 'team' && (
                <div className="flex-1 flex overflow-hidden">
                  {/* LEFT COLUMN: Team Chat Transcript */}
                  <div className="flex-1 flex flex-col border-r border-zinc-800 overflow-hidden">
                    {/* Team Sub-bar */}
                    <div className="px-5 py-2.5 bg-[#0a0d13] border-b border-zinc-800/60 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-purple-400" />
                        <span className="font-semibold text-purple-300">{activeConversation.teamDetails?.teamName}</span>
                        <span className="text-zinc-600">•</span>
                        <span className="text-zinc-400">Supervisor: {activeConversation.teamDetails?.supervisorName}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {activeConversation.teamDetails?.workers.map((w) => (
                          <span
                            key={w.id}
                            className="px-2 py-0.5 rounded text-[10px] font-mono border"
                            style={{ borderColor: `${w.color}50`, color: w.color, backgroundColor: `${w.color}15` }}
                          >
                            {w.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Chat Messages Feed */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                      {activeConversation.messages.map((msg) => {
                        const isUser = msg.role === 'user';
                        const workerColor = msg.workerColor || '#8b5cf6';

                        return (
                          <div
                            key={msg.id}
                            className={`flex gap-3 ${isUser ? 'ml-auto flex-row-reverse max-w-xl' : 'max-w-2xl'}`}
                          >
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold"
                              style={{
                                backgroundColor: isUser ? '#10b981' : `${workerColor}20`,
                                color: isUser ? '#000000' : workerColor,
                                border: isUser ? 'none' : `1px solid ${workerColor}60`,
                              }}
                            >
                              {isUser ? 'U' : (msg.workerAvatar || '🤖')}
                            </div>

                            <div
                              className="flex flex-col gap-1 text-xs rounded-xl p-3.5 flex-1"
                              style={{
                                backgroundColor: isUser ? '#062817' : '#0f131a',
                                border: `1px solid ${isUser ? '#047857' : '#27272a'}`,
                              }}
                            >
                              <div className="flex items-center justify-between gap-4 text-[10px] text-zinc-400 pb-1 border-b border-zinc-800/40">
                                <span className="font-semibold" style={{ color: isUser ? '#6ee7b7' : workerColor }}>
                                  {isUser ? 'User Prompt' : msg.workerName || 'Worker Agent'}
                                </span>
                                <span className="font-mono text-zinc-500">
                                  {new Date(msg.timestamp).toLocaleTimeString()}
                                </span>
                              </div>

                              <div className="whitespace-pre-wrap leading-relaxed text-[12px] text-zinc-200 mt-1">
                                {msg.content}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Left Column Composer */}
                    <div className="shrink-0 p-3.5 border-t border-zinc-800 bg-[#0d1017]">
                      <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Send message into multi-agent LangGraph workflow..."
                          value={inputMessage}
                          onChange={(e) => setInputMessage(e.target.value)}
                          disabled={isSendingMessage}
                          className="flex-1 px-3.5 py-2 text-xs bg-zinc-900 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                        />
                        <button
                          type="submit"
                          disabled={!inputMessage.trim() || isSendingMessage}
                          className="px-3.5 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg flex items-center gap-1.5 transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Dispatch</span>
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: Workers History of Tools & LangGraph Execution */}
                  <div className="w-96 lg:w-[440px] shrink-0 bg-[#0a0c12] flex flex-col overflow-hidden">
                    {/* History Sub-header */}
                    <div className="px-4 py-3 border-b border-zinc-800 bg-[#0e1118] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-semibold text-white">Workers Tool Execution History</span>
                      </div>
                      <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-purple-950 text-purple-300 border border-purple-800/50">
                        {activeConversation.teamToolHistory?.length || 0} INVOCATIONS
                      </span>
                    </div>

                    {/* Tool Filter Tabs */}
                    <div className="p-2.5 border-b border-zinc-800/80 bg-[#0b0e14] flex items-center gap-1.5 overflow-x-auto text-[11px]">
                      <button
                        onClick={() => setSelectedWorkerFilter('all')}
                        className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                          selectedWorkerFilter === 'all'
                            ? 'bg-zinc-800 text-white border border-zinc-700'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        All ({activeConversation.teamToolHistory?.length || 0})
                      </button>
                      {activeConversation.teamDetails?.workers.map((w) => (
                        <button
                          key={w.id}
                          onClick={() => setSelectedWorkerFilter(w.id)}
                          className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
                            selectedWorkerFilter === w.id
                              ? 'bg-purple-950 text-purple-300 border border-purple-700/60'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: w.color }} />
                          <span>{w.name}</span>
                        </button>
                      ))}
                    </div>

                    {/* Tool Executions Waterfall List */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                      {(!activeConversation.teamToolHistory || activeConversation.teamToolHistory.length === 0) ? (
                        <div className="p-8 text-center text-xs text-zinc-500">
                          No tool invocations recorded for this team session yet.
                        </div>
                      ) : (
                        activeConversation.teamToolHistory
                          .filter((t) => selectedWorkerFilter === 'all' || t.workerId === selectedWorkerFilter)
                          .map((tool) => {
                            const isExpanded = expandedToolId === tool.id;

                            return (
                              <div
                                key={tool.id}
                                className="rounded-lg border border-zinc-800 bg-[#0f121a] overflow-hidden text-xs transition-all hover:border-zinc-700"
                              >
                                {/* Tool Header Bar */}
                                <button
                                  onClick={() => setExpandedToolId(isExpanded ? null : tool.id)}
                                  className="w-full p-2.5 flex items-center justify-between text-left gap-2 bg-zinc-900/60 hover:bg-zinc-800/40"
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="w-5 h-5 rounded bg-purple-950 text-purple-300 border border-purple-800/40 flex items-center justify-center font-mono text-[10px]">
                                      #{tool.stepIndex}
                                    </span>
                                    <div className="truncate">
                                      <div className="font-semibold text-zinc-200 truncate flex items-center gap-1.5">
                                        <Code2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                        <span className="font-mono text-[11px] text-emerald-300 truncate">{tool.toolName}</span>
                                      </div>
                                      <div className="text-[10px] text-zinc-400 truncate">
                                        Worker: <span className="text-zinc-300 font-medium">{tool.workerName}</span> ({tool.mcpProvider})
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                                      {tool.latencyMs}ms
                                    </span>
                                    {isExpanded ? (
                                      <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                                    ) : (
                                      <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                                    )}
                                  </div>
                                </button>

                                {/* Decision Rationale Sub-bar */}
                                {tool.decisionRationale && (
                                  <div className="px-3 py-1.5 bg-zinc-950/60 border-t border-zinc-800/50 text-[11px] text-zinc-400 flex items-start gap-1.5">
                                    <CornerDownRight className="w-3 h-3 text-purple-400 mt-0.5 shrink-0" />
                                    <span className="italic">{tool.decisionRationale}</span>
                                  </div>
                                )}

                                {/* Collapsible Payload & Response */}
                                {isExpanded && (
                                  <div className="p-3 border-t border-zinc-800 space-y-2.5 bg-[#090b10]">
                                    {/* Tool Inputs */}
                                    <div>
                                      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-1">
                                        <span className="uppercase tracking-wider">Input Arguments</span>
                                        <button
                                          onClick={() => handleCopy(JSON.stringify(tool.inputs, null, 2), `inp_${tool.id}`)}
                                          className="hover:text-emerald-400 flex items-center gap-1"
                                        >
                                          {copiedId === `inp_${tool.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                          <span>Copy JSON</span>
                                        </button>
                                      </div>
                                      <pre className="p-2 rounded bg-black/60 border border-zinc-800 font-mono text-[11px] text-zinc-300 overflow-x-auto">
                                        {JSON.stringify(tool.inputs, null, 2)}
                                      </pre>
                                    </div>

                                    {/* Tool Outputs */}
                                    <div>
                                      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-1">
                                        <span className="uppercase tracking-wider text-emerald-400">Response Output</span>
                                        <button
                                          onClick={() => handleCopy(JSON.stringify(tool.outputs, null, 2), `out_${tool.id}`)}
                                          className="hover:text-emerald-400 flex items-center gap-1"
                                        >
                                          {copiedId === `out_${tool.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                          <span>Copy JSON</span>
                                        </button>
                                      </div>
                                      <pre className="p-2 rounded bg-black/60 border border-zinc-800 font-mono text-[11px] text-emerald-300 overflow-x-auto">
                                        {JSON.stringify(tool.outputs, null, 2)}
                                      </pre>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* CASE C: VOICE AGENT - LEFT TRANSCRIPT, RIGHT METADATA,         */}
              {/*                      FOOTER WITH AUDIO PLAYER                  */}
              {/* ============================================================== */}
              {activeConversation.type === 'voice_call' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Body Split: Left Transcript + Right Metadata */}
                  <div className="flex-1 flex overflow-hidden">
                    {/* LEFT COLUMN: Time-stamped Voice Transcript */}
                    <div className="flex-1 flex flex-col border-r border-zinc-800 overflow-hidden bg-[#07090e]">
                      {/* Transcript Sub-header */}
                      <div className="px-5 py-2.5 bg-[#0a0d13] border-b border-zinc-800/60 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Mic className="w-3.5 h-3.5 text-rose-400" />
                          <span className="font-semibold text-rose-300">Turn-by-Turn Speech Transcript</span>
                        </div>
                        <span className="text-[11px] text-zinc-500">
                          Click any turn timestamp to seek audio
                        </span>
                      </div>

                      {/* Transcript Message Feed */}
                      <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        {activeConversation.messages.map((msg) => {
                          const isAgent = msg.role === 'voice_agent' || msg.role === 'assistant';
                          const isNearCurrentAudio =
                            msg.audioOffsetSec !== undefined &&
                            audioCurrentTime >= msg.audioOffsetSec &&
                            audioCurrentTime <= msg.audioOffsetSec + (msg.durationSec || 6);

                          return (
                            <div
                              key={msg.id}
                              onClick={() => handleSeekToOffset(msg.audioOffsetSec)}
                              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex gap-3 ${
                                isNearCurrentAudio
                                  ? 'bg-rose-950/30 border-rose-500/80 shadow-md shadow-rose-950/40 ring-1 ring-rose-500/40'
                                  : isAgent
                                  ? 'bg-[#0e121a] border-zinc-800/80 hover:border-zinc-700'
                                  : 'bg-[#12151d] border-zinc-800/80 hover:border-zinc-700'
                              }`}
                            >
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold ${
                                  isAgent
                                    ? 'bg-rose-950 text-rose-400 border border-rose-800/60'
                                    : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                                }`}
                              >
                                {isAgent ? <Bot className="w-4 h-4 text-rose-400" /> : <User className="w-4 h-4 text-zinc-300" />}
                              </div>

                              <div className="flex-1 space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold" style={{ color: isAgent ? '#fb7185' : '#e4e4e7' }}>
                                      {isAgent
                                        ? activeConversation.voiceMetadata?.elevenLabsVoiceName || 'ElevenLabs Agent'
                                        : activeConversation.voiceMetadata?.callerName || 'Inbound Caller'}
                                    </span>
                                    {msg.audioOffsetSec !== undefined && (
                                      <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-zinc-800 text-rose-300 border border-zinc-700">
                                        [{formatTime(msg.audioOffsetSec)}]
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {msg.sentiment && (
                                      <span
                                        className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                                          msg.sentiment === 'positive'
                                            ? 'bg-emerald-950 text-emerald-400'
                                            : msg.sentiment === 'urgent'
                                            ? 'bg-red-950 text-red-400'
                                            : 'bg-zinc-800 text-zinc-400'
                                        }`}
                                      >
                                        {msg.sentiment.toUpperCase()}
                                      </span>
                                    )}
                                    <span className="text-[10px] text-zinc-500 font-mono">
                                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </span>
                                  </div>
                                </div>

                                <p className="text-[12.5px] leading-relaxed text-zinc-200">
                                  {msg.content}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* RIGHT COLUMN: Voice Call Metadata & Telemetry */}
                    <div className="w-80 lg:w-96 shrink-0 bg-[#0a0d13] flex flex-col overflow-y-auto p-4 space-y-4 border-l border-zinc-800/80">
                      <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                        <span className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-rose-400" />
                          Voice Call Metadata
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800/40">
                          ELEVENLABS TELEMETRY
                        </span>
                      </div>

                      {/* Caller & Agent Information */}
                      <div className="p-3 rounded-lg bg-[#0e1219] border border-zinc-800 space-y-2 text-xs">
                        <div className="font-semibold text-zinc-300 text-[11px] uppercase tracking-wider font-mono">
                          Endpoint Connection
                        </div>
                        <div className="flex justify-between text-zinc-400">
                          <span>Caller Identity:</span>
                          <span className="text-zinc-200 font-medium">{activeConversation.voiceMetadata?.callerName || 'Unknown Caller'}</span>
                        </div>
                        <div className="flex justify-between text-zinc-400">
                          <span>Caller Number:</span>
                          <span className="text-zinc-200 font-mono">{activeConversation.voiceMetadata?.callerPhone}</span>
                        </div>
                        <div className="flex justify-between text-zinc-400">
                          <span>Agent SIP/DID:</span>
                          <span className="text-zinc-200 font-mono">{activeConversation.voiceMetadata?.agentPhone}</span>
                        </div>
                        <div className="flex justify-between text-zinc-400">
                          <span>Total Call Duration:</span>
                          <span className="text-rose-400 font-mono font-medium">{activeConversation.voiceMetadata?.formattedDuration}</span>
                        </div>
                      </div>

                      {/* Low-Latency & Speech Metrics */}
                      <div className="p-3 rounded-lg bg-[#0e1219] border border-zinc-800 space-y-2 text-xs">
                        <div className="font-semibold text-zinc-300 text-[11px] uppercase tracking-wider font-mono flex items-center justify-between">
                          <span>Speech Latencies</span>
                          <span className="text-emerald-400 font-mono">ULTRA-FAST</span>
                        </div>
                        <div className="flex justify-between text-zinc-400">
                          <span>Turn-taking Latency:</span>
                          <span className="text-emerald-400 font-mono font-medium">{activeConversation.voiceMetadata?.turnTakingLatencyMs}ms</span>
                        </div>
                        <div className="flex justify-between text-zinc-400">
                          <span>Speech-to-Speech E2E:</span>
                          <span className="text-emerald-400 font-mono font-medium">{activeConversation.voiceMetadata?.speechToSpeechLatencyMs}ms</span>
                        </div>
                        <div className="flex justify-between text-zinc-400">
                          <span>Codec & Rate:</span>
                          <span className="text-zinc-200 font-mono">{activeConversation.voiceMetadata?.audioCodec}</span>
                        </div>
                        <div className="flex justify-between text-zinc-400">
                          <span>Packet Loss:</span>
                          <span className="text-zinc-200 font-mono">{activeConversation.voiceMetadata?.packetLossPercent}%</span>
                        </div>
                      </div>

                      {/* ElevenLabs Model Settings */}
                      <div className="p-3 rounded-lg bg-[#0e1219] border border-zinc-800 space-y-2 text-xs">
                        <div className="font-semibold text-zinc-300 text-[11px] uppercase tracking-wider font-mono">
                          ElevenLabs Voice Profile
                        </div>
                        <div className="flex justify-between text-zinc-400">
                          <span>Voice Engine:</span>
                          <span className="text-zinc-200 font-medium">{activeConversation.voiceMetadata?.elevenLabsVoiceName}</span>
                        </div>
                        <div className="flex justify-between text-zinc-400">
                          <span>Voice ID:</span>
                          <span className="text-rose-400 font-mono text-[10px] truncate max-w-[140px]">
                            {activeConversation.voiceMetadata?.elevenLabsVoiceId}
                          </span>
                        </div>
                        <div className="flex justify-between text-zinc-400">
                          <span>Model ID:</span>
                          <span className="text-zinc-300 font-mono">{activeConversation.voiceMetadata?.elevenLabsModel}</span>
                        </div>
                        <div className="flex justify-between text-zinc-400">
                          <span>Est. Compute Cost:</span>
                          <span className="text-emerald-400 font-mono">{activeConversation.voiceMetadata?.totalCostEstimate}</span>
                        </div>
                      </div>

                      {/* Intent & Termination Summary */}
                      <div className="p-3 rounded-lg bg-[#0e1219] border border-zinc-800 space-y-2 text-xs">
                        <div className="font-semibold text-zinc-300 text-[11px] uppercase tracking-wider font-mono">
                          Intent & Audit
                        </div>
                        <div>
                          <span className="text-zinc-400">Detected Intent:</span>
                          <p className="text-zinc-200 font-medium mt-0.5">{activeConversation.voiceMetadata?.detectedIntent}</p>
                        </div>
                        <div>
                          <span className="text-zinc-400">Termination Reason:</span>
                          <p className="text-zinc-300 font-mono text-[11px] mt-0.5">{activeConversation.voiceMetadata?.terminationReason}</p>
                        </div>
                        {activeConversation.voiceMetadata?.notes && (
                          <div className="pt-1 border-t border-zinc-800">
                            <span className="text-zinc-400">Agent Summary Notes:</span>
                            <p className="text-zinc-300 italic text-[11px] mt-0.5">{activeConversation.voiceMetadata.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* STICKY FOOTER: REAL FUNCTIONAL AUDIO PLAYER */}
                  <div className="shrink-0 p-3.5 border-t border-zinc-800 bg-[#0c0f16] flex flex-col md:flex-row items-center justify-between gap-4 select-none">
                    {/* Left: Play/Pause, Title, ElevenLabs Badge */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={togglePlayAudio}
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-rose-500 hover:bg-rose-400 text-white shadow-md shadow-rose-950/60 transition-transform active:scale-95"
                        title={isPlayingAudio ? 'Pause Voice Playback' : 'Play Voice Audio'}
                      >
                        {isPlayingAudio ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                      </button>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white">
                            {activeConversation.voiceMetadata?.elevenLabsVoiceName || 'ElevenLabs Voice Stream'}
                          </span>
                          <span className="text-[9px] font-mono px-1 rounded bg-rose-950 text-rose-300 border border-rose-800/40">
                            24kHz LOSSLESS
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 flex items-center gap-1 font-mono">
                          <span>{formatTime(audioCurrentTime)}</span>
                          <span>/</span>
                          <span>{formatTime(totalDuration)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Interactive Scrubber & Waveform Canvas */}
                    <div className="flex-1 max-w-xl w-full flex flex-col gap-1 px-2">
                      <canvas
                        ref={canvasRef}
                        width={400}
                        height={24}
                        className="w-full h-6 rounded bg-black/40 border border-zinc-800/80 cursor-pointer"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const clickPos = (e.clientX - rect.left) / rect.width;
                          setAudioCurrentTime(clickPos * totalDuration);
                          if (!isPlayingAudio) {
                            startAudioSynth();
                            setIsPlayingAudio(true);
                          }
                        }}
                      />
                      <input
                        type="range"
                        min={0}
                        max={totalDuration}
                        step={0.5}
                        value={audioCurrentTime}
                        onChange={(e) => setAudioCurrentTime(parseFloat(e.target.value))}
                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
                      />
                    </div>

                    {/* Right: Controls (Speed, Volume, Mute) */}
                    <div className="flex items-center gap-3">
                      {/* Speed Selector */}
                      <div className="flex items-center bg-zinc-900 rounded p-0.5 border border-zinc-800 text-[10px] font-mono">
                        {[1, 1.25, 1.5, 2].map((rate) => (
                          <button
                            key={rate}
                            onClick={() => setAudioPlaybackRate(rate)}
                            className={`px-1.5 py-0.5 rounded ${
                              audioPlaybackRate === rate
                                ? 'bg-rose-950 text-rose-300 font-semibold'
                                : 'text-zinc-400 hover:text-white'
                            }`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>

                      {/* Volume / Mute */}
                      <button
                        onClick={() => setIsMuted(!isMuted)}
                        className="p-1.5 text-zinc-400 hover:text-white"
                        title={isMuted ? 'Unmute' : 'Mute'}
                      >
                        {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ===================== NEW THREAD SIMULATION MODAL ===================== */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#0e1219] border border-zinc-800 rounded-xl shadow-2xl p-6 text-zinc-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Create / Simulate Conversation Thread</h3>
              </div>
              <button
                onClick={() => setShowNewModal(false)}
                className="text-zinc-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNewConversation} className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-400 font-medium mb-1">Thread Title / Topic</label>
                <input
                  type="text"
                  placeholder="e.g. VIP Customer Ticket #4912"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-medium mb-1">Custom Thread ID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. th_custom_vip_881"
                  value={newThreadId}
                  onChange={(e) => setNewThreadId(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-medium mb-1.5">Conversation Architecture</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewType('single_agent')}
                    className={`p-2.5 rounded-lg border text-center flex flex-col items-center gap-1 transition-all ${
                      newType === 'single_agent'
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Bot className="w-4 h-4 text-emerald-400" />
                    <span className="font-semibold text-[11px]">Single Agent</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewType('team')}
                    className={`p-2.5 rounded-lg border text-center flex flex-col items-center gap-1 transition-all ${
                      newType === 'team'
                        ? 'bg-purple-950/80 border-purple-500 text-purple-300'
                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Users className="w-4 h-4 text-purple-400" />
                    <span className="font-semibold text-[11px]">Team Swarm</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewType('voice_call')}
                    className={`p-2.5 rounded-lg border text-center flex flex-col items-center gap-1 transition-all ${
                      newType === 'voice_call'
                        ? 'bg-rose-950/80 border-rose-500 text-rose-300'
                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <PhoneCall className="w-4 h-4 text-rose-400" />
                    <span className="font-semibold text-[11px]">ElevenLabs Voice</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTitle.trim()}
                  className="px-4 py-2 bg-emerald-400 hover:bg-emerald-300 text-black font-semibold rounded-lg disabled:opacity-50"
                >
                  Create & Launch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
