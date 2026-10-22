'use client';

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { PLANS, checkoutUrl } from '@/lib/billing/plans';

interface PricingSectionProps {
  orgId?: string;
}

export default function PricingSection({ orgId }: PricingSectionProps) {
  return (
    <section id="pricing" className="py-20 border-t border-zinc-800/60 bg-[#090b10]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl font-bold text-white mb-4">Flexible Multitenant Pricing</h2>
          <p className="text-zinc-400">Bring Your Own Key (BYOK) token billing keeps costs transparent and predictable.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={
                plan.highlighted
                  ? 'p-8 rounded-2xl bg-gradient-to-b from-emerald-950/40 to-zinc-900/80 border border-emerald-500/40 flex flex-col relative shadow-xl shadow-emerald-950/20'
                  : 'p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 flex flex-col hover:border-zinc-700 transition-all'
              }
            >
              {plan.highlighted && (
                <div className="absolute -top-3 right-6 px-3 py-0.5 rounded-full bg-emerald-500 text-zinc-950 font-bold text-xs uppercase tracking-wider">Popular</div>
              )}
              <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
              <p className="text-zinc-400 text-sm mb-6">{plan.blurb}</p>
              <div className={`text-4xl font-extrabold text-white ${plan.setupFeeUsd ? 'mb-2' : 'mb-6'}`}>
                ${plan.monthlyUsd} <span className="text-sm font-normal text-zinc-400">/mo</span>
              </div>
              {plan.setupFeeUsd && <div className="text-sm text-amber-400/90 mb-4">+ ${plan.setupFeeUsd} Setup Fee</div>}
              <ul className="space-y-3 text-sm text-zinc-300 mb-8 flex-1 font-sans">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {f}
                  </li>
                ))}
              </ul>
              <a
                href={checkoutUrl(plan, orgId)}
                target="_blank"
                rel="noopener noreferrer"
                className={
                  plan.highlighted
                    ? 'w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-center transition-colors block'
                    : 'w-full py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-center transition-colors block'
                }
              >
                Subscribe to {plan.name}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
