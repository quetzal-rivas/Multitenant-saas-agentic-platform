'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Bot,
  Search,
  BookOpen,
  Terminal,
  Cpu,
  Layers,
  ShieldCheck,
  Zap,
  ArrowRight,
  Check,
  Copy,
  ChevronRight,
  Code2,
  Server,
  Database,
  Lock,
  GitBranch,
  Sparkles,
  HelpCircle,
  ThumbsUp,
  ThumbsDown,
  Menu,
  X,
  Clock,
  Sliders,
  Play,
  Activity,
  Key,
  FileCode,
  LayoutDashboard,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Box,
  Eye,
  SlidersHorizontal,
  Compass,
  CheckCircle2,
  ListOrdered,
  FileText,
  FolderTree,
  Shield,
  Radio,
  Workflow,
  Settings,
  Globe,
  RadioTower,
  FileJson,
  PlusCircle,
  Network,
  Share2,
  Users,
  Smartphone,
  BarChart3,
  Code,
  MessageSquare,
  PhoneCall,
  Volume2,
} from 'lucide-react';

export default function DocumentationPage() {
  const [activeSection, setActiveSection] = useState('overview');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<boolean | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  interface NavItem {
    id: string;
    label: string;
    badge?: string;
  }
  interface NavCategory {
    title: string;
    items: NavItem[];
  }

  // SaaS Tenant Documentation Directory
  const navCategories: NavCategory[] = [
    {
      title: 'Tenant Dashboard Overview',
      items: [
        { id: 'overview', label: 'Platform Overview & Quickstart', badge: 'Start Here' },
      ],
    },
    {
      title: 'Autonomous Agent Workspace',
      items: [
        { id: 'agent-studio', label: 'Agent Session Studio (Single Agent)' },
        { id: 'team-builder', label: 'Team Builder (Multi-Agent Graphs)' },
      ],
    },
    {
      title: 'Communication & Voice Engine',
      items: [
        { id: 'conversations', label: 'Persistent Threads & Audit Log' },
        { id: 'voice-agent', label: 'ElevenLabs Voice & Twilio Telephony' },
      ],
    },
    {
      title: 'Task Automation & Calendar',
      items: [
        { id: 'task-calendar', label: 'Task Calendar & BullMQ Deferred Queue' },
      ],
    },
    {
      title: 'Context & Knowledge Engine',
      items: [
        { id: 'context-profiles', label: 'Context Profiles & Token Budgeting' },
        { id: 'knowledge-sources', label: 'Knowledge Base Ingestion & pgvector RAG' },
      ],
    },
    {
      title: 'MCP Tools & Integrations',
      items: [
        { id: 'mcp-hub', label: 'MCP Hub & Tool Connections' },
        { id: 'skills-library', label: 'Skills Library Registry' },
      ],
    },
    {
      title: 'Developer API & Testing Tools',
      items: [
        { id: 'endpoints-api', label: 'Endpoints API & Live cURL Builder' },
        { id: 'test-simulator', label: 'Test Simulator & Time-Travel Sandbox' },
        { id: 'platform-mcp', label: 'Platform MCP Controller (Stdio/SSE)' },
        { id: 'security-vault', label: 'API Keys & BYOK Security Vault' },
      ],
    },
  ];

  const filteredCategories = navCategories
    .map((cat) => ({
      ...cat,
      items: cat.items.filter((item) =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter((cat) => cat.items.length > 0);

  return (
    <div className="min-h-screen bg-[#07090e] text-zinc-100 font-sans selection:bg-emerald-900 selection:text-emerald-200">
      {/* Top Docs Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-[#07090e]/90 border-b border-zinc-800/80">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
              className="lg:hidden p-2 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white"
            >
              {mobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 p-[1px] shadow-md shadow-emerald-500/20">
                <div className="w-full h-full bg-[#090b10] rounded-[7px] flex items-center justify-center">
                  <Bot className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-white">Context Control</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono hidden sm:inline-block">
                  SaaS User Guide
                </span>
              </div>
            </Link>

            <div className="hidden md:flex items-center gap-2 text-xs text-zinc-500 font-mono ml-4 pl-4 border-l border-zinc-800">
              <BookOpen className="w-3.5 h-3.5 text-zinc-400" />
              <span>Tenant Workspace User Documentation</span>
            </div>
          </div>

          {/* Header Actions & Search */}
          <div className="flex items-center gap-3">
            <div className="relative hidden sm:block w-64 md:w-80">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tenant documentation topics..."
                className="w-full pl-9 pr-4 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/60 transition-all font-mono"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-zinc-500 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <Link
              href="/dashboard"
              className="text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-3.5 py-2 rounded-lg transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5"
            >
              Open Workspace Dashboard <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Layout Grid */}
      <div className="max-w-[1600px] mx-auto flex">
        {/* Left Sidebar Navigation */}
        <aside
          className={`fixed lg:sticky top-16 z-40 h-[calc(100vh-4rem)] w-80 bg-[#07090e] border-r border-zinc-800/80 overflow-y-auto p-4 transition-transform duration-200 lg:translate-x-0 ${
            mobileSidebarOpen ? 'translate-x-0 bg-[#090b10] shadow-2xl' : '-translate-x-full'
          }`}
        >
          <div className="space-y-6 pb-12">
            {filteredCategories.map((cat, idx) => (
              <div key={idx} className="space-y-1">
                <h3 className="px-3 text-xs font-mono font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  {cat.title}
                </h3>
                {cat.items.map((item) => {
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveSection(item.id);
                        setMobileSidebarOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-between group ${
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20 shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate pr-2">
                        <ChevronRight
                          className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${
                            isActive ? 'rotate-90 text-emerald-400' : 'text-zinc-600 group-hover:text-zinc-400'
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.badge && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-normal flex-shrink-0">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>

        {/* Center Main Content Area */}
        <main className="flex-1 min-w-0 px-6 sm:px-10 py-10 max-w-4xl mx-auto">
          {renderTenantDocSection(activeSection, copyToClipboard, copiedCode)}

          {/* Page Feedback Component */}
          <div className="mt-16 pt-8 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <HelpCircle className="w-4 h-4 text-zinc-500" /> Was this tenant guide topic helpful?
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFeedbackGiven(true)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-all flex items-center gap-1.5 ${
                  feedbackGiven === true
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                <ThumbsUp className="w-3.5 h-3.5" /> Helpful
              </button>
              <button
                onClick={() => setFeedbackGiven(false)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-all flex items-center gap-1.5 ${
                  feedbackGiven === false
                    ? 'bg-red-500/20 border-red-500 text-red-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                <ThumbsDown className="w-3.5 h-3.5" /> Needs Improvement
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* =========================================================================
   DYNAMIC SECTION SWITCHER
   ========================================================================= */

function renderTenantDocSection(
  sectionId: string,
  copyToClipboard: (text: string, id: string) => void,
  copiedCode: string | null
) {
  switch (sectionId) {
    case 'overview':
      return <DocTenantOverview />;
    case 'agent-studio':
      return <DocAgentStudio />;
    case 'team-builder':
      return <DocTeamBuilder />;
    case 'conversations':
      return <DocConversations />;
    case 'voice-agent':
      return <DocVoiceAgent />;
    case 'task-calendar':
      return <DocTaskCalendar copyToClipboard={copyToClipboard} copiedCode={copiedCode} />;
    case 'context-profiles':
      return <DocContextProfiles />;
    case 'knowledge-sources':
      return <DocKnowledgeSources />;
    case 'mcp-hub':
      return <DocMcpHub />;
    case 'skills-library':
      return <DocSkillsLibrary />;
    case 'endpoints-api':
      return <DocEndpointsApi copyToClipboard={copyToClipboard} copiedCode={copiedCode} />;
    case 'test-simulator':
      return <DocTestSimulator />;
    case 'platform-mcp':
      return <DocPlatformMcp copyToClipboard={copyToClipboard} copiedCode={copiedCode} />;
    case 'security-vault':
      return <DocSecurityVault />;
    default:
      return <DocTenantOverview />;
  }
}

/* =========================================================================
   TENANT DOCUMENTATION SECTION COMPONENTS WITH LIVE SCREENSHOT PREVIEWS
   ========================================================================= */

function DocTenantOverview() {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="pb-6 border-b border-zinc-800/80">
        <span className="text-xs font-mono text-emerald-400 font-semibold uppercase tracking-wider">
          Tenant Dashboard Overview
        </span>
        <h1 className="text-4xl font-extrabold text-white mt-2">Platform Overview & Quickstart</h1>
        <p className="text-base text-zinc-300 mt-2 leading-relaxed">
          Welcome to the **Context Control SaaS Workspace**. This platform abstracts away all low-level technical infrastructure into an intuitive, high-performance workspace dashboard for your organization.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-xs">
        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 font-bold">
            <Bot className="w-4 h-4" /> Agent & Team Studio
          </div>
          <p className="text-zinc-400 text-xs font-sans">
            Deploy single autonomous agents or visual supervisor team graphs with multi-agent delegation.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
          <div className="flex items-center gap-2 text-rose-400 font-bold">
            <PhoneCall className="w-4 h-4" /> Voice & Telephony Engine
          </div>
          <p className="text-zinc-400 text-xs font-sans">
            ElevenLabs Conversational AI voice calls and Twilio phone numbers with complete audit transcripts.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
          <div className="flex items-center gap-2 text-cyan-400 font-bold">
            <Calendar className="w-4 h-4" /> Task Calendar Queue
          </div>
          <p className="text-zinc-400 text-xs font-sans">
            Schedule future agent tasks with durable countdown triggers and live calendar execution tracking.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
          <div className="flex items-center gap-2 text-purple-400 font-bold">
            <Server className="w-4 h-4" /> MCP Hub & Tools
          </div>
          <p className="text-zinc-400 text-xs font-sans">
            Connect Gmail, Slack, Google Calendar, Cloudflare, and custom MCP tools with zero credential leakage.
          </p>
        </div>
      </div>
    </div>
  );
}

function DocAgentStudio() {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="pb-6 border-b border-zinc-800/80">
        <span className="text-xs font-mono text-emerald-400 font-semibold uppercase tracking-wider">
          Autonomous Agent Workspace · Section 01
        </span>
        <h1 className="text-3xl font-extrabold text-white mt-2">Agent Session Studio (Single Agent)</h1>
        <p className="text-zinc-300 text-sm mt-2 leading-relaxed">
          Interactive operational studio for creating, testing, and conversing with single autonomous agents in real-time.
        </p>
      </div>

      {/* Embedded UI Screenshot */}
      <div className="space-y-2">
        <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">UI Screenshot Preview</div>
        <img
          src="/docs/images/agent_studio.png"
          alt="Agent Session Studio UI Preview"
          className="w-full rounded-xl border border-zinc-800/80 shadow-2xl"
        />
      </div>

      <div className="space-y-6 text-sm text-zinc-300 leading-relaxed">
        <h3 className="text-xl font-bold text-white font-mono border-b border-zinc-800 pb-2">1. Overview & Strategic Purpose</h3>
        <p>
          The <strong>Agent Session Studio</strong> serves as the primary real-time operational interface for single autonomous agents. It bridges high-level tenant prompt inputs with dynamic LLM reasoning, live tool call execution, and token-budgeted context resolution. Rather than relying on simple stateless chat widgets, the Agent Studio provides full visibility into the agent's internal thought process, active context profile parameters, and intermediate tool execution outputs.
        </p>

        <h3 className="text-xl font-bold text-white font-mono border-b border-zinc-800 pb-2 mt-6">2. Key Capabilities & Architecture</h3>
        <ul className="space-y-3 list-disc pl-5">
          <li><strong>Real-Time Thought & Tool Execution Streaming:</strong> As the agent evaluates user instructions, every intermediate reasoning step, JSON schema validation, and tool call payload is streamed live to the UI interface. Tenants can expand individual execution cards to inspect raw tool arguments (e.g. searching Gmail threads or querying CRM databases) and response status codes.</li>
          <li><strong>Dynamic Context Profile Toggling:</strong> Tenants can dynamically select pre-configured Context Profiles from a header dropdown. Switching profiles instantly updates the agent's core system instructions, tenant brand voice, customer loyalty tier rules, and token allocation limits without restarting the chat session.</li>
          <li><strong>System Instruction Overrides:</strong> Offers an inline developer drawer allowing tenants to inject temporary system instruction overrides on the fly. This enables testing specific edge-case prompts, tone adjustments, or constraint guardrails before committing them to a production profile blueprint.</li>
          <li><strong>Persistent State Checkpointing:</strong> Every message, thought step, and tool call result is serialized into binary checkpoints stored in Supabase PostgreSQL (`public.checkpoints`). Sessions can be paused, resumed, or audited at any time with guaranteed state continuity.</li>
          <li><strong>Token Budget Monitoring:</strong> Real-time token usage meter displays prompt tokens, completion tokens, and context window utilization, preventing unexpected API cost spikes.</li>
        </ul>

        <h3 className="text-xl font-bold text-white font-mono border-b border-zinc-800 pb-2 mt-6">3. Step-by-Step UI How-To-Use Guide</h3>
        <ol className="space-y-3 list-decimal pl-5">
          <li>Select <strong>Agent Studio</strong> from the left navigation menu under the *Workspace* section.</li>
          <li>In the top bar header, click the <strong>Context Profile</strong> dropdown selector to choose an active agent profile (e.g., *Customer Support Lead*, *Sales Outbound Representative*, or *Technical Auditor*).</li>
          <li>Type your operational instructions into the prompt input drawer at the bottom of the studio screen and press <strong>Send</strong> or `Enter`.</li>
          <li>Observe the live execution waterfall:
            <ul className="list-disc pl-5 mt-1 space-y-1 text-xs text-zinc-400">
              <li>Green accordion headers indicate successful tool calls (e.g. `gmail_fetch_threads`).</li>
              <li>Yellow headers highlight pending or executing actions.</li>
              <li>Red headers indicate caught errors or fallback triggers.</li>
            </ul>
          </li>
          <li>Click on any tool call accordion card to view raw JSON parameters, response headers, and latency metrics.</li>
          <li>To test custom instructions, click <strong>System Overrides</strong>, modify the system prompt text, and submit a new message turn.</li>
        </ol>
      </div>
    </div>
  );
}

function DocTeamBuilder() {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="pb-6 border-b border-zinc-800/80">
        <span className="text-xs font-mono text-emerald-400 font-semibold uppercase tracking-wider">
          Autonomous Agent Workspace · Section 02
        </span>
        <h1 className="text-3xl font-extrabold text-white mt-2">Team Builder (Multi-Agent Supervisor Graphs)</h1>
        <p className="text-zinc-300 text-sm mt-2 leading-relaxed">
          Visual team builder for constructing hierarchical multi-agent graphs with supervisor delegation and worker node scoping.
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">UI Screenshot Preview</div>
        <img
          src="/docs/images/team_builder.png"
          alt="Agent Team Builder UI Preview"
          className="w-full rounded-xl border border-zinc-800/80 shadow-2xl"
        />
      </div>

      <div className="space-y-6 text-sm text-zinc-300 leading-relaxed">
        <h3 className="text-xl font-bold text-white font-mono border-b border-zinc-800 pb-2">1. Overview & Strategic Purpose</h3>
        <p>
          The <strong>Team Builder</strong> allows tenants to construct collaborative multi-agent teams using hierarchical supervisor topologies. Complex business workflows often exceed the capabilities of a single monolithic agent persona. The Team Builder solves this by establishing a central <strong>Supervisor Agent</strong> that acts as an intelligent router, decomposing incoming multi-step tasks and delegating sub-tasks to specialized worker agents (e.g. *Research Specialist*, *Copywriter*, *Billing Auditor*, *Incident Dispatcher*).
        </p>

        <h3 className="text-xl font-bold text-white font-mono border-b border-zinc-800 pb-2 mt-6">2. Key Capabilities & Architecture</h3>
        <ul className="space-y-3 list-disc pl-5">
          <li><strong>Hierarchical Routing Topologies:</strong> Incorporates LangGraph-style state machine routing patterns (`supervisor_router`, `sequential_pipeline`, `consensus`). The supervisor agent evaluates incoming user turns and routes control to worker nodes based on their assigned operational roles and tool whitelists.</li>
          <li><strong>Specialized Worker Node Assignment:</strong> Tenants can create and attach an unlimited number of worker nodes to a team blueprint. Each worker node receives dedicated system instructions, an avatar icon, and a strictly scoped whitelist of allowed MCP tools (e.g. restricting a Billing Clerk to Stripe tools while granting a Copywriter access to Gmail and Slack).</li>
          <li><strong>Conditional Fallback & Escalation Matrix:</strong> Every team blueprint incorporates an automated fallback policy matrix (`edgeCasePolicies`). If a primary worker's tool action fails (such as an email delivery bounce or CRM API rate limit), the state graph automatically traverses conditional edges to trigger high-priority fallback actions, including automated ElevenLabs Voice Calls or Slack emergency alerts.</li>
          <li><strong>Visual Topology Tree:</strong> Interactive canvas displays the team structure, routing strategies, active worker nodes, allocated MCP tools, and assigned capability skills.</li>
        </ul>

        <h3 className="text-xl font-bold text-white font-mono border-b border-zinc-800 pb-2 mt-6">3. Step-by-Step UI How-To-Use Guide</h3>
        <ol className="space-y-3 list-decimal pl-5">
          <li>Open <strong>Team Builder</strong> from the sidebar menu.</li>
          <li>Click <strong>Create New Team</strong> or click an existing blueprint card (e.g. *Front Desk Automation Team*, *Night Audit Team*).</li>
          <li>In the team configuration modal:
            <ul className="list-disc pl-5 mt-1 space-y-1 text-xs text-zinc-400">
              <li>Enter the <strong>Team Name</strong> and select the <strong>Routing Strategy</strong> (*Supervisor Router*, *Sequential Pipeline*, or *Consensus*).</li>
              <li>Write the <strong>Supervisor Prompt</strong> specifying corporate routing rules (e.g., *"Route billing and invoice inquiries to the Billing Clerk; route technical bugs to the Database Auditor"*).</li>
            </ul>
          </li>
          <li>Click <strong>Add Worker Node</strong> to attach specialist agents:
            <ul className="list-disc pl-5 mt-1 space-y-1 text-xs text-zinc-400">
              <li>Specify the <strong>Worker Name</strong> (e.g., *CRM Specialist*) and <strong>Role</strong> (e.g., *Lead Enrichment*).</li>
              <li>Input dedicated <strong>System Instructions</strong> for the worker.</li>
              <li>Select whitelisted <strong>MCP Tools</strong> from the tool selector drawer (e.g. `crm.add_lead`, `slack_post_message`).</li>
            </ul>
          </li>
          <li>Click <strong>Deploy Team Graph</strong> to make the multi-agent team blueprint available for live studio sessions, API endpoints, and scheduled deferred calendar tasks.</li>
        </ol>
      </div>
    </div>
  );
}

function DocConversations() {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="pb-6 border-b border-zinc-800/80">
        <span className="text-xs font-mono text-emerald-400 font-semibold uppercase tracking-wider">
          Communication & Voice Engine · Section 03
        </span>
        <h1 className="text-3xl font-extrabold text-white mt-2">Persistent Threads & Audit Log</h1>
        <p className="text-zinc-300 text-sm mt-2 leading-relaxed">
          Durable conversation thread viewer backed by Supabase PostgreSQL checkpoint history and multi-channel audit logs.
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">UI Screenshot Preview</div>
        <img
          src="/docs/images/conversations.png"
          alt="Conversations View UI Preview"
          className="w-full rounded-xl border border-zinc-800/80 shadow-2xl"
        />
      </div>

      <div className="space-y-6 text-sm text-zinc-300 leading-relaxed">
        <h3 className="text-xl font-bold text-white font-mono border-b border-zinc-800 pb-2">1. Overview & Strategic Purpose</h3>
        <p>
          The <strong>Conversations</strong> module provides full auditability and management across all past and active agent communication threads. It houses the platform's Live Voice Conference Engine, enabling agents to perform automated outbound telephone calls and answer inbound calls over standard PSTN phone lines using ElevenLabs Conversational AI and Twilio Telephony.
        </p>

        <h3 className="text-xl font-bold text-white font-mono border-b border-zinc-800 pb-2 mt-6">2. Key Capabilities & Architecture</h3>
        <ul className="space-y-3 list-disc pl-5">
          <li><strong>Postgres Persistent Thread Audit:</strong> Displays thread execution sessions stored in Supabase PostgreSQL (`public.thread_instances` and `public.checkpoints`). Tenants can inspect exact turn-by-turn message logs, token consumption per turn, and timestamped tool execution records.</li>
          <li><strong>Multi-Channel History:</strong> View chat sessions, scheduled task executions, and voice call transcripts in a unified list.</li>
          <li><strong>Search & Filter:</strong> Instantly search threads by customer ID, date range, or agent persona.</li>
        </ul>
      </div>
    </div>
  );
}

function DocVoiceAgent() {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="pb-6 border-b border-zinc-800/80">
        <span className="text-xs font-mono text-emerald-400 font-semibold uppercase tracking-wider">
          Communication & Voice Engine · Section 04
        </span>
        <h1 className="text-3xl font-extrabold text-white mt-2">ElevenLabs Voice & Twilio Telephony</h1>
        <p className="text-zinc-300 text-sm mt-2 leading-relaxed">
          Low-latency conversational voice call dispatch with ElevenLabs AI synthesis and Twilio phone numbers.
        </p>
      </div>

      <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3 font-sans">
        <div className="flex items-center gap-2 text-rose-400 font-bold font-mono text-sm">
          <PhoneCall className="w-4 h-4" /> ElevenLabs + Twilio Voice Pipeline
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed">
          Agents can initiate automated outbound phone calls or respond to inbound customer calls over standard telephone lines. Calls are powered by ElevenLabs low-latency voice models and Twilio PSTN trunks with full text transcripts and call audio recordings stored in Supabase.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px] pt-2">
          <div className="p-3 bg-zinc-900 rounded-lg text-rose-300 border border-zinc-800">1. Call Triggered</div>
          <div className="p-3 bg-zinc-900 rounded-lg text-emerald-300 border border-zinc-800">2. ElevenLabs Voice Synthesis</div>
          <div className="p-3 bg-zinc-900 rounded-lg text-cyan-300 border border-zinc-800">3. Real-Time Transcript Audit</div>
        </div>
      </div>
    </div>
  );
}

function DocTaskCalendar({ copyToClipboard, copiedCode }: any) {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="pb-6 border-b border-zinc-800/80">
        <span className="text-xs font-mono text-emerald-400 font-semibold uppercase tracking-wider">
          Task Automation & Calendar · Section 05
        </span>
        <h1 className="text-3xl font-extrabold text-white mt-2">Task Calendar & BullMQ Deferred Queue</h1>
        <p className="text-zinc-300 text-sm mt-2 leading-relaxed">
          Visual calendar dashboard for deferred task scheduling backed by BullMQ Redis workers and AWS EventBridge target-time triggers.
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">UI Screenshot Preview</div>
        <img
          src="/docs/images/task_calendar.png"
          alt="Task Calendar UI Preview"
          className="w-full rounded-xl border border-zinc-800/80 shadow-2xl"
        />
      </div>

      <div className="space-y-6 text-sm text-zinc-300 leading-relaxed">
        <h3 className="text-xl font-bold text-white font-mono border-b border-zinc-800 pb-2">1. Overview & Strategic Purpose</h3>
        <p>
          The <strong>Task Calendar</strong> view provides a visual timeline and scheduling dashboard for deferred background agent tasks. Standard serverless web applications suffer from strict HTTP execution timeouts (10 to 60 seconds). The Task Calendar eliminates these limitations by offloading delayed agent jobs to a durable BullMQ Redis Queue and AWS EventBridge Target-Time Scheduler.
        </p>

        <h3 className="text-xl font-bold text-white font-mono border-b border-zinc-800 pb-2 mt-6">2. Key Capabilities & Architecture</h3>
        <ul className="space-y-3 list-disc pl-5">
          <li><strong>Target-Time Countdown Triggers:</strong> Enables tenants to schedule agent tasks to execute at exact future ISO 8601 timestamps (e.g. `at(2026-09-28T14:00:00Z)`). Single-use AWS EventBridge rules trigger background workers at the target time with zero idle compute costs.</li>
          <li><strong>BullMQ Redis Queue Durability:</strong> Scheduled jobs are enqueued into BullMQ sorted sets and atomic Redis journals. If a worker container recycles or restarts, all scheduled executions survive without job loss.</li>
          <li><strong>Interactive Monthly & Weekly Calendar Timelines:</strong> Visual calendar view displays upcoming scheduled tasks, active execution countdown timers, and historical task outcomes.</li>
          <li><strong>Fallback & Edge-Case Policy Matrix:</strong> Every scheduled task incorporates a configurable fallback matrix. If a primary tool action bounces during execution, the queue engine automatically triggers secondary actions, retries, or voice call escalations.</li>
        </ul>

        <h3 className="text-xl font-bold text-white font-mono border-b border-zinc-800 pb-2 mt-6">3. Step-by-Step UI How-To-Use Guide</h3>
        <ol className="space-y-3 list-decimal pl-5">
          <li>Navigate to <strong>Task Calendar</strong> in the workspace sidebar.</li>
          <li>Toggle between the <strong>Calendar View</strong> (interactive monthly timeline) and <strong>List View</strong> (tabular job status table).</li>
          <li>Click <strong>Schedule Deferred Task</strong> to open the task creation modal.</li>
          <li>Specify the task title, operational instructions, target execution timestamp, and selected agent graph.</li>
          <li>Monitor execution countdowns and click any scheduled event card to inspect status or cancel execution.</li>
        </ol>
      </div>
    </div>
  );
}

function DocContextProfiles() {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="pb-6 border-b border-zinc-800/80">
        <span className="text-xs font-mono text-emerald-400 font-semibold uppercase tracking-wider">
          Context & Knowledge Engine · Section 06
        </span>
        <h1 className="text-3xl font-extrabold text-white mt-2">Context Profiles & Token Budgeting</h1>
        <p className="text-zinc-300 text-sm mt-2 leading-relaxed">
          Manage system instruction profiles, tenant brand voice, customer loyalty rules, and token budget policies.
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">UI Screenshot Preview</div>
        <img
          src="/docs/images/profiles.png"
          alt="Context Profiles UI Preview"
          className="w-full rounded-xl border border-zinc-800/80 shadow-2xl"
        />
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-bold text-white font-mono">1. Key Capabilities & Integrations</h3>
        <ul className="space-y-2 text-sm text-zinc-300 list-disc pl-5 leading-relaxed">
          <li><strong>Priority-Based Token Trimming:</strong> Automatically trims context sections when approaching max token limits.</li>
          <li><strong>Brand Voice Rules:</strong> Enforce tenant tone, style guidelines, and forbidden word lists.</li>
        </ul>
      </div>
    </div>
  );
}

function DocKnowledgeSources() {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="pb-6 border-b border-zinc-800/80">
        <span className="text-xs font-mono text-emerald-400 font-semibold uppercase tracking-wider">
          Context & Knowledge Engine · Section 07
        </span>
        <h1 className="text-3xl font-extrabold text-white mt-2">Knowledge Base Ingestion & pgvector RAG</h1>
        <p className="text-zinc-300 text-sm mt-2 leading-relaxed">
          Index documents, website URLs, and memory fragments into Supabase `pgvector` for semantic search retrieval.
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">UI Screenshot Preview</div>
        <img
          src="/docs/images/sources.png"
          alt="Knowledge Sources UI Preview"
          className="w-full rounded-xl border border-zinc-800/80 shadow-2xl"
        />
      </div>
    </div>
  );
}

function DocMcpHub() {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="pb-6 border-b border-zinc-800/80">
        <span className="text-xs font-mono text-emerald-400 font-semibold uppercase tracking-wider">
          MCP Tools & Integrations · Section 08
        </span>
        <h1 className="text-3xl font-extrabold text-white mt-2">MCP Hub & Tool Connections</h1>
        <p className="text-zinc-300 text-sm mt-2 leading-relaxed">
          Connect pre-built MCP spokes (Gmail, Slack, Google Calendar, Cloudflare, Supabase) and custom tool servers.
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">UI Screenshot Preview</div>
        <img
          src="/docs/images/mcp_hub.png"
          alt="MCP Hub UI Preview"
          className="w-full rounded-xl border border-zinc-800/80 shadow-2xl"
        />
      </div>
    </div>
  );
}

function DocSkillsLibrary() {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="pb-6 border-b border-zinc-800/80">
        <span className="text-xs font-mono text-emerald-400 font-semibold uppercase tracking-wider">
          MCP Tools & Integrations · Section 09
        </span>
        <h1 className="text-3xl font-extrabold text-white mt-2">Skills Library Registry</h1>
        <p className="text-zinc-300 text-sm mt-2 leading-relaxed">
          Manage modular agent skills, domain-specific instructions, and specialized automation kits.
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">UI Screenshot Preview</div>
        <img
          src="/docs/images/skills_library.png"
          alt="Skills Library UI Preview"
          className="w-full rounded-xl border border-zinc-800/80 shadow-2xl"
        />
      </div>
    </div>
  );
}

function DocEndpointsApi({ copyToClipboard, copiedCode }: any) {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="pb-6 border-b border-zinc-800/80">
        <span className="text-xs font-mono text-emerald-400 font-semibold uppercase tracking-wider">
          Developer API & Testing Tools · Section 10
        </span>
        <h1 className="text-3xl font-extrabold text-white mt-2">Endpoints API & Live cURL Generator</h1>
        <p className="text-zinc-300 text-sm mt-2 leading-relaxed">
          Interactive REST API endpoint reference (`/api/v1/*`) with pre-populated cURL request builders.
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">UI Screenshot Preview</div>
        <img
          src="/docs/images/endpoints_api.png"
          alt="Endpoints API UI Preview"
          className="w-full rounded-xl border border-zinc-800/80 shadow-2xl"
        />
      </div>
    </div>
  );
}

function DocTestSimulator() {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="pb-6 border-b border-zinc-800/80">
        <span className="text-xs font-mono text-emerald-400 font-semibold uppercase tracking-wider">
          Developer API & Testing Tools · Section 11
        </span>
        <h1 className="text-3xl font-extrabold text-white mt-2">Test Simulator & Time-Travel Sandbox</h1>
        <p className="text-zinc-300 text-sm mt-2 leading-relaxed">
          Sandbox playground for evaluating agent graph state machine transitions and simulating tool failures.
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">UI Screenshot Preview</div>
        <img
          src="/docs/images/test_simulator.png"
          alt="Test Simulator UI Preview"
          className="w-full rounded-xl border border-zinc-800/80 shadow-2xl"
        />
      </div>
    </div>
  );
}

function DocPlatformMcp({ copyToClipboard, copiedCode }: any) {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="pb-6 border-b border-zinc-800/80">
        <span className="text-xs font-mono text-emerald-400 font-semibold uppercase tracking-wider">
          Developer API & Testing Tools · Section 12
        </span>
        <h1 className="text-3xl font-extrabold text-white mt-2">Platform MCP Controller (Stdio/SSE)</h1>
        <p className="text-zinc-300 text-sm mt-2 leading-relaxed">
          Connect external host applications (Claude Desktop, Cursor, local IDEs) to your tenant workspace via MCP.
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">UI Screenshot Preview</div>
        <img
          src="/docs/images/platform_mcp.png"
          alt="Platform MCP Controller UI Preview"
          className="w-full rounded-xl border border-zinc-800/80 shadow-2xl"
        />
      </div>
    </div>
  );
}

function DocSecurityVault() {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="pb-6 border-b border-zinc-800/80">
        <span className="text-xs font-mono text-emerald-400 font-semibold uppercase tracking-wider">
          Developer API & Testing Tools · Section 13
        </span>
        <h1 className="text-3xl font-extrabold text-white mt-2">API Keys & BYOK Security Vault</h1>
        <p className="text-zinc-300 text-sm mt-2 leading-relaxed">
          AES-256-GCM encrypted credential vault and Supabase PostgreSQL Row-Level Security (RLS) tenant isolation.
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">UI Screenshot Preview</div>
        <img
          src="/docs/images/api_keys.png"
          alt="API Keys & Security UI Preview"
          className="w-full rounded-xl border border-zinc-800/80 shadow-2xl"
        />
      </div>
    </div>
  );
}
