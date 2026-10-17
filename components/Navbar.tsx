'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Terminal, Sparkles, ChevronRight, Server, Building2, Menu } from 'lucide-react';

/** Breadcrumb names for tabs whose id differs from their page name. */
const TAB_LABELS: Record<string, string> = { endpoints: 'webhooks', 'session-studio': 'agent studio', 'function-studio': 'AI function studio', 'mcp-hub': 'MCP hub & tools', calendar: 'task calendar', board: 'supervisor board', calls: 'live calls' };

interface NavbarProps {
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
  onOpenSimulator: () => void;
  onOpenNewProfile?: () => void;
  /** Phones: open the sidebar drawer. */
  onOpenMenu?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab = 'profiles',
  setActiveTab,
  onOpenSimulator,
  onOpenNewProfile,
  onOpenMenu,
}) => {
  const router = useRouter();
  const [activeOrgName, setActiveOrgName] = useState<string>('Loading...');

  useEffect(() => {
    const fetchOrg = async () => {
      try {
        const res = await fetch('/api/v1/organizations/me');
        if (res.ok) {
          const data = await res.json();
          if (data.organizations && data.organizations.length > 0) {
            setActiveOrgName(data.organizations[0].name);
          } else {
            setActiveOrgName('No Organization');
          }
        }
      } catch (err) {
        setActiveOrgName('Organization');
      }
    };
    fetchOrg();
  }, []);
  return (
    <header className="h-14 border-b border-zinc-800 bg-[#0e1117] px-3 sm:px-4 flex items-center justify-between gap-2 sticky top-0 z-40">
      {/* Brand & Breadcrumbs */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {onOpenMenu && (
          <button onClick={onOpenMenu} className="md:hidden p-1.5 -ml-1 rounded-md text-zinc-300 hover:bg-zinc-800" aria-label="Open menu">
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div 
          onClick={() => setActiveTab?.('profiles')}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-900/30 text-white font-bold text-sm">
            <Layers className="w-4 h-4 text-emerald-100" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold tracking-tight text-white text-sm whitespace-nowrap">Context Control</span>
              <span className="hidden sm:inline text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-medium">
                MCP Gateway
              </span>
            </div>
          </div>
        </div>

        <div className="hidden md:flex items-center text-xs text-zinc-500 font-mono">
          <ChevronRight className="w-3.5 h-3.5 mx-1 text-zinc-600" />
          <span className="text-zinc-400">Workspace</span>
          <ChevronRight className="w-3.5 h-3.5 mx-1 text-zinc-600" />
          <span className="text-zinc-200 capitalize font-medium">{(TAB_LABELS[activeTab] ?? activeTab).replace(/-/g, ' ')}</span>
        </div>
      </div>

      {/* Center Status Pill */}
      <div className="hidden lg:flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900/90 border border-zinc-800 text-xs font-mono">
          <Building2 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-zinc-300 font-sans font-medium">{activeOrgName}</span>
        </div>
        <button 
          onClick={() => router.push('/organizations')}
          className="text-[10px] uppercase font-mono px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors border border-zinc-700"
        >
          Switch Org
        </button>
      </div>

      {/* Right Quick Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        <button
          onClick={() => setActiveTab?.('mcp-hub')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
            activeTab === 'mcp-hub'
              ? 'bg-emerald-950 text-emerald-300 border-emerald-700 shadow-sm'
              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
          }`}
          title="Open Hosted MCP Hub & OAuth Subscriptions"
        >
          <Server className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">MCP Hub</span>
        </button>

        <button
          onClick={onOpenSimulator}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
            activeTab === 'simulator'
              ? 'bg-indigo-950 text-indigo-200 border-indigo-600 shadow-sm'
              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
          }`}
          title="Open Agent Team & Queue Simulator Sandbox"
        >
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">Simulator Sandbox</span>
        </button>

        {onOpenNewProfile && (
          <button
            onClick={onOpenNewProfile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors shadow-sm shadow-emerald-950"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">+ New Profile</span>
          </button>
        )}
      </div>
    </header>
  );
};
