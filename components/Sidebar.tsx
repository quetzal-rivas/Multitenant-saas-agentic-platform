'use client';

import React from 'react';
import {
  FileCode2,
  Database,
  Globe2,
  KeyRound,
  TerminalSquare,
  ScrollText,
  SlidersHorizontal,
  Code2,
  Layers,
  Sparkles,
  Server,
  BookOpen,
  Bot,
  Users,
  Calendar,
  MessageSquare,
  Terminal,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  profilesCount: number;
  sourcesCount: number;
  skillsCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  profilesCount,
  sourcesCount,
  skillsCount,
}) => {
  return (
    <aside className="w-56 shrink-0 border-r border-zinc-800 bg-[#0d1016] flex flex-col justify-between py-4 select-none min-h-[calc(100vh-3.5rem)]">
      <div className="space-y-6 px-3">
        {/* Workspace Group */}
        <div>
          <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase font-mono">
            Workspace
          </div>
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('session-studio')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
                activeTab === 'session-studio'
                  ? 'bg-zinc-800/90 text-white font-semibold border-l-2 border-emerald-500 pl-2.5'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Bot className={`w-4 h-4 ${activeTab === 'session-studio' ? 'text-emerald-400' : 'text-zinc-400'}`} />
                <span>Agent Studio</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/50">
                LIVE
              </span>
            </button>

            <button
              onClick={() => setActiveTab('team-builder')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
                activeTab === 'team-builder'
                  ? 'bg-zinc-800/90 text-white font-semibold border-l-2 border-emerald-500 pl-2.5'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className={`w-4 h-4 ${activeTab === 'team-builder' ? 'text-purple-400' : 'text-zinc-400'}`} />
                <span>Team Builder</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/50">
                NEW
              </span>
            </button>

            <button
              onClick={() => setActiveTab('conversations')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
                activeTab === 'conversations'
                  ? 'bg-zinc-800/90 text-white font-semibold border-l-2 border-emerald-500 pl-2.5'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <MessageSquare className={`w-4 h-4 ${activeTab === 'conversations' ? 'text-emerald-400' : 'text-zinc-400'}`} />
                <span>Conversations</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800/50">
                VOICE
              </span>
            </button>

            <button
              onClick={() => setActiveTab('calendar')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
                activeTab === 'calendar'
                  ? 'bg-zinc-800/90 text-white font-semibold border-l-2 border-emerald-500 pl-2.5'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Calendar className={`w-4 h-4 ${activeTab === 'calendar' ? 'text-cyan-400' : 'text-zinc-400'}`} />
                <span>Task Calendar</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/50">
                BULLMQ
              </span>
            </button>

            <button
              onClick={() => setActiveTab('profiles')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
                activeTab === 'profiles' || activeTab === 'builder'
                  ? 'bg-zinc-800/90 text-white font-semibold border-l-2 border-emerald-500 pl-2.5'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FileCode2 className={`w-4 h-4 ${activeTab === 'profiles' || activeTab === 'builder' ? 'text-emerald-400' : 'text-zinc-400'}`} />
                <span>Profiles</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                {profilesCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('sources')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
                activeTab === 'sources'
                  ? 'bg-zinc-800/90 text-white font-semibold border-l-2 border-emerald-500 pl-2.5'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Database className={`w-4 h-4 ${activeTab === 'sources' ? 'text-emerald-400' : 'text-zinc-400'}`} />
                <span>Sources</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                {sourcesCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('mcp-hub')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
                activeTab === 'mcp-hub'
                  ? 'bg-zinc-800/90 text-white font-semibold border-l-2 border-emerald-500 pl-2.5'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Server className={`w-4 h-4 ${activeTab === 'mcp-hub' ? 'text-emerald-400' : 'text-zinc-400'}`} />
                <span>MCP Hub & Tools</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/50">
                PRO
              </span>
            </button>

            <button
              onClick={() => setActiveTab('library')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
                activeTab === 'library'
                  ? 'bg-zinc-800/90 text-white font-semibold border-l-2 border-emerald-500 pl-2.5'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BookOpen className={`w-4 h-4 ${activeTab === 'library' ? 'text-emerald-400' : 'text-zinc-400'}`} />
                <span>Library</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-400 border border-zinc-700">
                {skillsCount !== undefined ? skillsCount : 'HUB'}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('endpoints')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
                activeTab === 'endpoints'
                  ? 'bg-zinc-800/90 text-white font-semibold border-l-2 border-emerald-500 pl-2.5'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Globe2 className={`w-4 h-4 ${activeTab === 'endpoints' ? 'text-emerald-400' : 'text-zinc-400'}`} />
                <span>Endpoints</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400">REST</span>
            </button>
          </nav>
        </div>

        {/* Developer Group */}
        <div>
          <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase font-mono">
            Developer
          </div>
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('simulator')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
                activeTab === 'simulator'
                  ? 'bg-zinc-800/90 text-white font-semibold border-l-2 border-emerald-500 pl-2.5'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <TerminalSquare className={`w-4 h-4 ${activeTab === 'simulator' ? 'text-indigo-400' : 'text-zinc-400'}`} />
                <span>Test Simulator</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                SANDBOX
              </span>
            </button>

            <button
              onClick={() => setActiveTab('platform-mcp')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
                activeTab === 'platform-mcp'
                  ? 'bg-zinc-800/90 text-white font-semibold border-l-2 border-emerald-500 pl-2.5'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Terminal className={`w-4 h-4 ${activeTab === 'platform-mcp' ? 'text-emerald-400' : 'text-zinc-400'}`} />
                <span>Platform MCP</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/50">
                STDIO
              </span>
            </button>

            <button
              onClick={() => setActiveTab('api-keys')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                activeTab === 'api-keys'
                  ? 'bg-zinc-800/90 text-white font-semibold border-l-2 border-emerald-500 pl-2.5'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <KeyRound className={`w-4 h-4 ${activeTab === 'api-keys' ? 'text-emerald-400' : 'text-zinc-400'}`} />
              <span>API Keys & Tokens</span>
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                activeTab === 'logs'
                  ? 'bg-zinc-800/90 text-white font-semibold border-l-2 border-emerald-500 pl-2.5'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <ScrollText className={`w-4 h-4 ${activeTab === 'logs' ? 'text-emerald-400' : 'text-zinc-400'}`} />
              <span>Logs & Tracing</span>
            </button>

            <button
              onClick={() => setActiveTab('sdk-docs')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                activeTab === 'sdk-docs'
                  ? 'bg-zinc-800/90 text-white font-semibold border-l-2 border-emerald-500 pl-2.5'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <Code2 className={`w-4 h-4 ${activeTab === 'sdk-docs' ? 'text-emerald-400' : 'text-zinc-400'}`} />
              <span>Client SDKs</span>
            </button>
          </nav>
        </div>

        {/* Global Settings */}
        <div>
          <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase font-mono">
            Configuration
          </div>
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                activeTab === 'settings'
                  ? 'bg-zinc-800/90 text-white font-semibold border-l-2 border-emerald-500 pl-2.5'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <SlidersHorizontal className={`w-4 h-4 ${activeTab === 'settings' ? 'text-emerald-400' : 'text-zinc-400'}`} />
              <span>Compiler Policies</span>
            </button>
          </nav>
        </div>
      </div>

      {/* Bottom Info Box */}
      <div className="px-3">
        <div className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-400 space-y-1.5">
          <div className="flex items-center justify-between text-zinc-300 font-medium">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              Context Engine
            </span>
            <span className="text-[10px] font-mono text-emerald-400">READY</span>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-400">
            Model-agnostic output for OpenAI, Gemini, Claude & custom models.
          </p>
        </div>
      </div>
    </aside>
  );
};
