'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

interface PricingSectionProps {
  orgId?: string;
}

export default function PricingSection({ orgId }: PricingSectionProps) {
  // Helper to append the orgId to the Stripe payment link as client_reference_id
  const getStripeUrl = (baseUrl: string) => {
    if (!orgId) return baseUrl;
    return `${baseUrl}?client_reference_id=${orgId}`;
  };

  return (
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
            <a href={getStripeUrl("https://buy.stripe.com/5kQ5kw78h5OWfrkcprdjO04")} target="_blank" rel="noopener noreferrer" className="w-full py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-center transition-colors block">
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
            <a href={getStripeUrl("https://buy.stripe.com/3cIeV61NXcdk0wqexzdjO05")} target="_blank" rel="noopener noreferrer" className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-center transition-colors block">
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
            <a href={getStripeUrl("https://buy.stripe.com/eVq6oA5095OW1Au4WZdjO06")} target="_blank" rel="noopener noreferrer" className="w-full py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-center transition-colors block">
              Subscribe to Enterprise
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
