import React from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import {
  Bot,
  ShieldCheck,
  Zap,
  ArrowRight,
  Layers,
  Database,
  Lock,
  CheckCircle2,
  Server,
  Users,
  PhoneCall,
  Calendar,
  Sparkles,
  MessageSquare,
  Clock,
  Volume2,
} from 'lucide-react';

export default async function LandingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-[#07090e] text-zinc-100 font-sans selection:bg-emerald-900 selection:text-emerald-200">
      {/* Top Marketing Navigation */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-[#07090e]/80 border-b border-zinc-800/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 p-[1px] shadow-md shadow-emerald-500/20">
              <div className="w-full h-full bg-[#090b10] rounded-[7px] flex items-center justify-center">
                <Bot className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-white">Context Control</span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                SaaS Platform
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
            <a href="#features" className="hover:text-emerald-400 transition-colors">Core Features</a>
            <a href="#showcase" className="hover:text-emerald-400 transition-colors">Workspace Preview</a>
            <a href="#pricing" className="hover:text-emerald-400 transition-colors">Pricing</a>
            <Link href="/docs" className="hover:text-emerald-400 transition-colors">User Documentation</Link>
          </nav>

          <div className="flex items-center gap-4">
            {user ? (
              <Link
                href="/dashboard"
                className="text-sm font-medium bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-4 py-2 rounded-lg transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 font-semibold"
              >
                Go to Dashboard <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-zinc-300 hover:text-white transition-colors px-3 py-2"
                >
                  Sign In
                </Link>
                <Link
                  href="/onboarding"
                  className="text-sm font-medium bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-4 py-2 rounded-lg transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 font-semibold"
                >
                  Get Started Free <ArrowRight className="w-4 h-4" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-24 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/20 via-zinc-950/0 to-transparent pointer-events-none" />
        <div className="max-w-5xl mx-auto px-6 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono mb-8">
            <Sparkles className="w-3.5 h-3.5" /> Next-Generation Autonomous SaaS Platform
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight mb-6">
            Autonomous Agent Teams, Voice AI <br />
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              & Deferred Task Automation
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-zinc-400 max-w-3xl mx-auto mb-10 font-normal leading-relaxed">
            Deploy autonomous single agents, team supervisor graphs, AI voice calls, target-time task scheduling, and secure MCP tool connections in one unified SaaS workspace.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {user ? (
              <Link
                href="/dashboard"
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-base transition-all shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2"
              >
                Enter Workspace <ArrowRight className="w-5 h-5" />
              </Link>
            ) : (
              <>
                <Link
                  href="/onboarding"
                  className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-base transition-all shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2"
                >
                  Create Workspace Free <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href="/login"
                  className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 font-semibold text-base transition-all flex items-center justify-center gap-2"
                >
                  Login to Dashboard
                </Link>
              </>
            )}
          </div>
        </div>

        {/* 4 Core Value Metric Cards */}
        <div className="max-w-6xl mx-auto px-6 mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-sm">
            <div className="flex items-center gap-3 text-emerald-400 mb-2">
              <Bot className="w-5 h-5" />
              <span className="font-semibold text-sm text-zinc-300">Agent & Team Studio</span>
            </div>
            <p className="text-xl font-bold text-white font-mono">Single & Multi-Agent</p>
            <p className="text-xs text-zinc-400 mt-1">Hierarchical supervisor delegation</p>
          </div>

          <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-sm">
            <div className="flex items-center gap-3 text-rose-400 mb-2">
              <PhoneCall className="w-5 h-5" />
              <span className="font-semibold text-sm text-zinc-300">Voice Telephony Engine</span>
            </div>
            <p className="text-xl font-bold text-white font-mono">ElevenLabs + Twilio</p>
            <p className="text-xs text-zinc-400 mt-1">Direct calls & transcript audits</p>
          </div>

          <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-sm">
            <div className="flex items-center gap-3 text-cyan-400 mb-2">
              <Calendar className="w-5 h-5" />
              <span className="font-semibold text-sm text-zinc-300">Task Calendar Queue</span>
            </div>
            <p className="text-xl font-bold text-white font-mono">Target-Time Jobs</p>
            <p className="text-xs text-zinc-400 mt-1">Calendar timeline execution tracking</p>
          </div>

          <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-sm">
            <div className="flex items-center gap-3 text-purple-400 mb-2">
              <Server className="w-5 h-5" />
              <span className="font-semibold text-sm text-zinc-300">MCP Hub & Tools</span>
            </div>
            <p className="text-xl font-bold text-white font-mono">Zero Credential Leak</p>
            <p className="text-xs text-zinc-400 mt-1">Gmail, Slack, Calendar & Cloudflare</p>
          </div>
        </div>
      </section>

      {/* Core Features Grid */}
      <section id="features" className="py-20 border-t border-zinc-800/60 bg-[#090b10]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
              Core Platform Capabilities
            </h2>
            <p className="text-zinc-400 text-base">
              Everything your business needs to deploy, manage, and scale autonomous AI workflows.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Feature 1: Agent & Team Studio */}
            <div className="p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800 hover:border-emerald-500/40 transition-all space-y-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold text-white">Agent & Team Studio</h3>
              <p className="text-zinc-300 text-sm leading-relaxed">
                Deploy single autonomous agents or visual supervisor team graphs with multi-agent delegation. Define custom supervisor personas and assign specialist worker nodes with scoped permissions.
              </p>
              <ul className="space-y-2 text-xs text-zinc-400 font-mono">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Interactive prompt injection & real-time streaming</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Hierarchical supervisor routing topologies</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Persistent state continuity & audit history</li>
              </ul>
            </div>

            {/* Feature 2: Voice & Telephony Engine */}
            <div className="p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800 hover:border-emerald-500/40 transition-all space-y-4">
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <PhoneCall className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold text-white">Voice & Telephony Engine</h3>
              <p className="text-zinc-300 text-sm leading-relaxed">
                ElevenLabs Conversational AI voice calls and Twilio phone numbers with complete audit transcripts. Trigger automated outbound calls or handle incoming customer calls with ultra-low latency speech synthesis.
              </p>
              <ul className="space-y-2 text-xs text-zinc-400 font-mono">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-rose-400" /> Natural, human-like voice synthesis via ElevenLabs</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-rose-400" /> Dedicated PSTN phone lines via Twilio</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-rose-400" /> Full call audio & text transcript inspection logs</li>
              </ul>
            </div>

            {/* Feature 3: Task Calendar Queue */}
            <div className="p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800 hover:border-emerald-500/40 transition-all space-y-4">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold text-white">Task Calendar Queue</h3>
              <p className="text-zinc-300 text-sm leading-relaxed">
                Schedule future agent tasks with durable countdown triggers and live calendar execution tracking. Schedule complex workflows to run automatically at target dates and times without keeping servers open.
              </p>
              <ul className="space-y-2 text-xs text-zinc-400 font-mono">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-cyan-400" /> Target-time execution triggers & countdowns</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-cyan-400" /> Interactive monthly & weekly calendar timelines</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-cyan-400" /> Automatic retry policies & execution journals</li>
              </ul>
            </div>

            {/* Feature 4: MCP Hub & Tools */}
            <div className="p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800 hover:border-emerald-500/40 transition-all space-y-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Server className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold text-white">MCP Hub & Tools</h3>
              <p className="text-zinc-300 text-sm leading-relaxed">
                Connect Gmail, Slack, Google Calendar, Cloudflare, and custom MCP tools with zero credential leakage. Centralized Model Context Protocol hub pre-authenticates tools and enforces strict tenant isolation.
              </p>
              <ul className="space-y-2 text-xs text-zinc-400 font-mono">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-purple-400" /> One-click tool spokes for Gmail, Slack & Calendar</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-purple-400" /> Zero credential exposure to LLM context windows</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-purple-400" /> Stdio and SSE custom tool integration support</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Visual Workspace Showcase Section */}
      <section id="showcase" className="py-20 border-t border-zinc-800/60">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <div className="max-w-3xl mx-auto mb-12">
            <h2 className="text-3xl font-extrabold text-white mb-4">
              Designed for Intuitive SaaS Control
            </h2>
            <p className="text-zinc-400 text-base">
              A clean, modern workspace layout built for managing complex AI operations effortlessly.
            </p>
          </div>

          <div className="p-3 bg-zinc-900/80 rounded-2xl border border-zinc-800/80 shadow-2xl overflow-hidden">
            <img
              src="/docs/images/agent_studio.png"
              alt="Context Control SaaS Dashboard"
              className="w-full rounded-xl border border-zinc-800/60"
            />
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 border-t border-zinc-800/60 bg-[#090b10]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-white mb-4">Flexible Multitenant Pricing</h2>
            <p className="text-zinc-400">Bring Your Own Key (BYOK) token billing keeps costs transparent and predictable.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Tier 1 */}
            <div className="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 flex flex-col hover:border-zinc-700 transition-all">
              <h3 className="text-xl font-bold text-white mb-2">Tier 1</h3>
              <p className="text-zinc-400 text-sm mb-6">Ideal for testing and building custom agent teams.</p>
              <div className="text-4xl font-extrabold text-white mb-6">$250 <span className="text-sm font-normal text-zinc-400">/mo</span></div>
              <ul className="space-y-3 text-sm text-zinc-300 mb-8 flex-1 font-sans">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Bring Your Own Key (BYOK)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> 1 Organization</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Agent Studio & Team Builder</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Standard MCP Tool Connections</li>
              </ul>
              <a href="https://buy.stripe.com/5kQ5kw78h5OWfrkcprdjO04" target="_blank" rel="noopener noreferrer" className="w-full py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-center transition-colors block">
                Subscribe to Tier 1
              </a>
            </div>

            {/* Tier 2 */}
            <div className="p-8 rounded-2xl bg-gradient-to-b from-emerald-950/40 to-zinc-900/80 border border-emerald-500/40 flex flex-col relative shadow-xl shadow-emerald-950/20">
              <div className="absolute -top-3 right-6 px-3 py-0.5 rounded-full bg-emerald-500 text-zinc-950 font-bold text-xs uppercase tracking-wider">
                Popular
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Tier 2</h3>
              <p className="text-zinc-400 text-sm mb-6">For growing teams needing unlimited scale.</p>
              <div className="text-4xl font-extrabold text-white mb-6">$500 <span className="text-sm font-normal text-zinc-400">/mo</span></div>
              <ul className="space-y-3 text-sm text-zinc-300 mb-8 flex-1 font-sans">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Bring Your Own Key (BYOK)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Unlimited Organizations</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> ElevenLabs Voice Calls & Twilio Lines</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Unlimited MCP Tool Hub Spokes</li>
              </ul>
              <a href="https://buy.stripe.com/3cIeV61NXcdk0wqexzdjO05" target="_blank" rel="noopener noreferrer" className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-center transition-colors block">
                Subscribe to Tier 2
              </a>
            </div>

            {/* Enterprise Tier */}
            <div className="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 flex flex-col hover:border-zinc-700 transition-all">
              <h3 className="text-xl font-bold text-white mb-2">Enterprise</h3>
              <p className="text-zinc-400 text-sm mb-6">Dedicated SLA, custom MCP connectors & priority support.</p>
              <div className="text-4xl font-extrabold text-white mb-2">$150 <span className="text-sm font-normal text-zinc-400">/mo</span></div>
              <div className="text-sm text-amber-400/90 mb-4">+ $1500 Setup Fee</div>
              <ul className="space-y-3 text-sm text-zinc-300 mb-8 flex-1 font-sans">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> We provide the API Keys</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Unlimited Organizations</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Dedicated Account Manager & Onboarding</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> 99.99% Guaranteed SLA</li>
              </ul>
              <a href="https://buy.stripe.com/eVq6oA5095OW1Au4WZdjO06" target="_blank" rel="noopener noreferrer" className="w-full py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-center transition-colors block">
                Subscribe to Enterprise
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-zinc-800/80 text-center text-xs text-zinc-500">
        <p>© 2026 Context Control SaaS Platform. All rights reserved.</p>
      </footer>
    </div>
  );
}
