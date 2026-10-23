'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { PLANS, planHighlights, type PlanId } from '@/lib/billing/plans';

interface PricingSectionProps {
  /** Kept for callers that pass the organization; checkout happens inside the app. */
  orgId?: string;
}

/** The plans from the catalog the server enforces; every line is generated from real limits. */
export default function PricingSection(_props: PricingSectionProps) {
  const plans = (Object.values(PLANS) as Array<(typeof PLANS)[PlanId]>).filter((p) => p.listed);
  return (
    <section id="pricing" className="py-20 border-t border-zinc-800/60 bg-[#090b10]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl font-bold text-white mb-4">Start free. Upgrade when you need more.</h2>
          <p className="text-zinc-400">
            Bring your own AI provider key on every plan: you pay your AI provider directly. Every new workspace includes a 7-day Developer trial — no card needed.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => {
            const highlighted = plan.id === 'developer';
            return (
              <div
                key={plan.id}
                className={
                  highlighted
                    ? 'p-8 rounded-2xl bg-gradient-to-b from-emerald-950/40 to-zinc-900/80 border border-emerald-500/40 flex flex-col relative shadow-xl shadow-emerald-950/20'
                    : 'p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 flex flex-col hover:border-zinc-700 transition-all'
                }
              >
                {highlighted && (
                  <div className="absolute -top-3 right-6 px-3 py-0.5 rounded-full bg-emerald-500 text-zinc-950 font-bold text-xs uppercase tracking-wider">Free 7-day trial</div>
                )}
                <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                <p className="text-zinc-400 text-sm mb-6">{plan.tagline}</p>
                <div className="text-4xl font-extrabold text-white mb-6">
                  ${plan.priceUsd} <span className="text-sm font-normal text-zinc-400">/mo</span>
                </div>
                <ul className="space-y-3 text-sm text-zinc-300 mb-8 flex-1 font-sans">
                  {planHighlights(plan).map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" /> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className={
                    highlighted
                      ? 'w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-center transition-colors block'
                      : 'w-full py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-center transition-colors block'
                  }
                >
                  {plan.priceUsd === 0 ? 'Start free' : `Start free, then ${plan.name}`}
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-zinc-400">
          <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/30">
            <span className="text-white font-semibold">{PLANS.unlimited.name}.</span> {PLANS.unlimited.tagline} Buying Developer includes 7 days of Pro.
          </div>
          <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/30">
            <span className="text-white font-semibold">{PLANS.enterprise.name}.</span> {PLANS.enterprise.tagline}
          </div>
        </div>
      </div>
    </section>
  );
}
