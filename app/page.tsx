import React from 'react';
import Link from 'next/link';
import { Bot, Cpu, ShieldCheck, Zap, ArrowRight, Layers, Database, Lock, CheckCircle2, Server, Globe } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#07090e] text-zinc-100 font-sans selection:bg-emerald-900 selection:text-emerald-200">
      {/* Top Marketing Navigation */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-[#07090e]/80 border-b border-zinc-800/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 p-[1px]">
              <div className="w-full h-full bg-[#090b10] rounded-[7px] flex items-center justify-center">
                <Bot className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-white">Context Control</span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                SaaS v2.5
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
            <a href="#features" className="hover:text-emerald-400 transition-colors">Features</a>
            <a href="#architecture" className="hover:text-emerald-400 transition-colors">Architecture</a>
            <a href="#pricing" className="hover:text-emerald-400 transition-colors">Pricing</a>
            <Link href="/docs" className="hover:text-emerald-400 transition-colors">Documentation</Link>
          </nav>

          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-zinc-300 hover:text-white transition-colors px-3 py-2"
            >
              Sign In
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-4 py-2 rounded-lg transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
            >
              Get Started Free <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-24 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/20 via-zinc-950/0 to-transparent pointer-events-none" />
        <div className="max-w-5xl mx-auto px-6 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono mb-8">
            <Zap className="w-3.5 h-3.5" /> 100% AWS Free Tier & Supabase Cloud Serverless Baseline
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight mb-6">
            Autonomous Agent Teams & <br />
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              Deferred Queue State Machines
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-zinc-400 max-w-3xl mx-auto mb-10 font-normal leading-relaxed">
            Orchestrate multi-agent supervisor workflows with native LangGraph state checkpointing, AWS EventBridge target-time scheduling, and hub-and-spoke MCP gateway tools.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/onboarding"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-base transition-all shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2"
            >
              Build Your Workspace <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/dashboard"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 font-semibold text-base transition-all flex items-center justify-center gap-2"
            >
              Open Live Dashboard
            </Link>
          </div>
        </div>

        {/* Live Architecture Metric Cards */}
        <div className="max-w-6xl mx-auto px-6 mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-sm">
            <div className="flex items-center gap-3 text-emerald-400 mb-2">
              <Server className="w-5 h-5" />
              <span className="font-semibold text-sm text-zinc-300">AWS Lambda Docker</span>
            </div>
            <p className="text-2xl font-bold text-white font-mono">FastAPI + Mangum</p>
            <p className="text-xs text-zinc-500 mt-1">0$ Compute / 1M requests free</p>
          </div>

          <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-sm">
            <div className="flex items-center gap-3 text-cyan-400 mb-2">
              <Zap className="w-5 h-5" />
              <span className="font-semibold text-sm text-zinc-300">EventBridge Scheduler</span>
            </div>
            <p className="text-2xl font-bold text-white font-mono">14M Invocations</p>
            <p className="text-xs text-zinc-500 mt-1">Target-time serverless triggers</p>
          </div>

          <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-sm">
            <div className="flex items-center gap-3 text-teal-400 mb-2">
              <Database className="w-5 h-5" />
              <span className="font-semibold text-sm text-zinc-300">Supabase Postgres</span>
            </div>
            <p className="text-2xl font-bold text-white font-mono">PostgresSaver RLS</p>
            <p className="text-xs text-zinc-500 mt-1">Multi-tenant vector memory</p>
          </div>

          <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-sm">
            <div className="flex items-center gap-3 text-emerald-400 mb-2">
              <Lock className="w-5 h-5" />
              <span className="font-semibold text-sm text-zinc-300">BYOK Vault Security</span>
            </div>
            <p className="text-2xl font-bold text-white font-mono">AES-256 Encrypted</p>
            <p className="text-xs text-zinc-500 mt-1">Zero token cost liability</p>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 border-t border-zinc-800/60 bg-[#090b10]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-white mb-4">Enterprise Agentic Capabilities</h2>
            <p className="text-zinc-400">Everything needed to deploy reliable autonomous agent teams in production.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 hover:border-emerald-500/40 transition-all">
              <Cpu className="w-8 h-8 text-emerald-400 mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">LangGraph State Machine</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Supervisor routing and worker sub-graphs with conditional escalation paths to ElevenLabs voice calls when primary tools fail.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 hover:border-emerald-500/40 transition-all">
              <Layers className="w-8 h-8 text-teal-400 mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Hub-and-Spoke MCP Gateway</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Connect pre-authenticated tools for Gmail, ElevenLabs, Google Calendar, Slack, HubSpot, and PostgreSQL over stdio/SSE.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 hover:border-emerald-500/40 transition-all">
              <ShieldCheck className="w-8 h-8 text-cyan-400 mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Multi-Tenant Isolation</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Strict PostgreSQL Row Level Security (RLS) policies prevent cross-tenant data leaks and isolate checkpoints safely.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 border-t border-zinc-800/60">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-white mb-4">Flexible Multitenant Pricing</h2>
            <p className="text-zinc-400">Bring Your Own Key (BYOK) token billing keeps costs at zero.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Developer Tier */}
            <div className="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 flex flex-col">
              <h3 className="text-xl font-bold text-white mb-2">Developer Free</h3>
              <p className="text-zinc-400 text-sm mb-6">Ideal for testing and building custom agent teams.</p>
              <div className="text-4xl font-extrabold text-white mb-6">$0 <span className="text-sm font-normal text-zinc-400">/mo</span></div>
              <ul className="space-y-3 text-sm text-zinc-300 mb-8 flex-1">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> 1 Tenant Workspace</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> 100 Deferred EventBridge Tasks/mo</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> BYOK API Keys (OpenAI / Anthropic)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Supabase PostgresSaver Checkpoints</li>
              </ul>
              <Link href="/onboarding" className="w-full py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-center transition-colors">
                Start Free
              </Link>
            </div>

            {/* Growth Tier */}
            <div className="p-8 rounded-2xl bg-gradient-to-b from-emerald-950/40 to-zinc-900/80 border border-emerald-500/40 flex flex-col relative">
              <div className="absolute -top-3 right-6 px-3 py-0.5 rounded-full bg-emerald-500 text-zinc-950 font-bold text-xs uppercase tracking-wider">
                Popular
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Growth SaaS</h3>
              <p className="text-zinc-400 text-sm mb-6">For growing businesses needing automated voice escalations.</p>
              <div className="text-4xl font-extrabold text-white mb-6">$49 <span className="text-sm font-normal text-zinc-400">/mo</span></div>
              <ul className="space-y-3 text-sm text-zinc-300 mb-8 flex-1">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> 5 Tenant Workspaces</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> 10,000 Deferred Tasks/mo</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Dedicated Twilio Line Provisioning</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> ElevenLabs Voice Call Escalations</li>
              </ul>
              <Link href="/onboarding" className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-center transition-colors">
                Get Started
              </Link>
            </div>

            {/* Enterprise Tier */}
            <div className="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 flex flex-col">
              <h3 className="text-xl font-bold text-white mb-2">Enterprise</h3>
              <p className="text-zinc-400 text-sm mb-6">Dedicated cloud instances and custom MCP integrations.</p>
              <div className="text-4xl font-extrabold text-white mb-6">Custom</div>
              <ul className="space-y-3 text-sm text-zinc-300 mb-8 flex-1">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Unlimited Tenant Isolation</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Custom MCP Spoke Connectors</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> 99.99% Guaranteed SLA</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Dedicated VPC & AWS Lambda Deployments</li>
              </ul>
              <Link href="/onboarding" className="w-full py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-center transition-colors">
                Contact Sales
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-zinc-800/80 text-center text-xs text-zinc-500">
        <p>© 2026 Context Control SaaS Inc. Powered by AWS Free Tier & Supabase Cloud.</p>
      </footer>
    </div>
  );
}
