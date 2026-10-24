'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { PLANS, planHighlights, type PlanId } from '@/lib/billing/plans';

interface PricingSectionProps {
  /** Kept for callers that pass the organization; checkout happens inside the app. */
  orgId?: string;
}

/** How the trials chain from one tier to the next (mirrors lib/services/plan-limits.ts). */
const TRIAL_STEPS: Array<{ when: string; get: string; after: string }> = [
  { when: 'You create a workspace', get: '7 days of Developer', after: 'You stay on Free unless you subscribe.' },
  { when: 'You subscribe to Developer', get: '7 days of Pro', after: 'You return to Developer unless you subscribe to Pro.' },
  { when: 'You subscribe to Pro', get: '7 days of Unlimited', after: 'You return to Pro.' },
];

/** The plans from the catalog the server enforces; every limit shown is generated from it. */
export default function PricingSection(_props: PricingSectionProps) {
  const plans = (Object.values(PLANS) as Array<(typeof PLANS)[PlanId]>).filter((p) => p.listed);
  return (
    <section id="pricing" className="py-20 border-t border-zinc-800/60 bg-[#090b10]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl font-bold text-white mb-4">Start free. Every step up comes with a 7-day trial of the next.</h2>
          <p className="text-zinc-400">
            Bring your own AI provider key on every plan: you pay your AI and telephony providers directly, and Context Control never charges you for their usage.
          </p>
          <p className="text-zinc-500 text-sm mt-3">Prices in USD per month. Customers in Mexico pay + 16% IVA.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {plans.map((plan) => {
            const highlighted = plan.id === 'developer';
            return (
              <div
                key={plan.id}
                className={
                  highlighted
                    ? 'p-7 rounded-2xl bg-gradient-to-b from-emerald-950/40 to-zinc-900/80 border border-emerald-500/40 flex flex-col relative shadow-xl shadow-emerald-950/20'
                    : 'p-7 rounded-2xl bg-zinc-900/50 border border-zinc-800 flex flex-col hover:border-zinc-700 transition-all'
                }
              >
                {highlighted && (
                  <div className="absolute -top-3 right-6 px-3 py-0.5 rounded-full bg-emerald-500 text-zinc-950 font-bold text-xs uppercase tracking-wider">Most popular</div>
                )}
                <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                <p className="text-zinc-400 text-sm mb-5 min-h-[40px]">{plan.tagline}</p>
                <div className="text-4xl font-extrabold text-white mb-3">
                  {plan.priceUsd === null ? <span className="text-2xl">Price to be announced</span> : <>${plan.priceUsd} <span className="text-sm font-normal text-zinc-400">/mo</span></>}
                </div>
                <div className="flex items-start gap-2 text-sm text-emerald-300 bg-emerald-950/40 border border-emerald-900/50 rounded-lg px-3 py-2 mb-6">
                  <Sparkles className="w-4 h-4 mt-0.5 shrink-0" /> {plan.trialLine}
                </div>
                <ul className="space-y-3 text-sm text-zinc-300 mb-8 flex-1 font-sans">
                  {planHighlights(plan).map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" /> {f}
                    </li>
                  ))}
                </ul>
                {plan.id === 'unlimited' ? (
                  <div className="w-full py-3 rounded-lg border border-zinc-700 text-zinc-400 text-sm text-center">Included as a trial with Pro</div>
                ) : (
                  <Link
                    href="/login"
                    className={
                      highlighted
                        ? 'w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-center transition-colors block'
                        : 'w-full py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-center transition-colors block'
                    }
                  >
                    {plan.priceUsd === 0 ? 'Start free' : `Start free, then choose ${plan.name}`}
                  </Link>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-12 p-6 rounded-2xl border border-zinc-800 bg-zinc-900/30">
          <h3 className="text-lg font-semibold text-white mb-4">How trials work</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {TRIAL_STEPS.map((s) => (
              <div key={s.when} className="text-sm">
                <div className="text-zinc-400">{s.when}</div>
                <div className="text-white font-semibold mt-1">→ {s.get}</div>
                <div className="text-zinc-500 mt-1">{s.after}</div>
              </div>
            ))}
          </div>
          <ul className="mt-5 space-y-1 text-xs text-zinc-500">
            <li>• Each trial is offered once per workspace. A trial never charges you or turns into a subscription.</li>
            <li>• When a trial ends, your data is kept. You can&apos;t add more than your plan allows until you upgrade.</li>
            <li>• {PLANS.enterprise.name}: {PLANS.enterprise.tagline}</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
