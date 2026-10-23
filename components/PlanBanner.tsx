'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { PLANS, type PlanId } from '@/lib/billing/plans';

interface Usage {
  plan: PlanId;
  billing_status: string;
  trial: { tier: PlanId; ends_at: string } | null;
  limits: Record<string, number>;
  used: Record<string, number>;
}

/** The one plan message that matters most right now, or null. */
function messageFor(u: Usage): { text: string; urgent: boolean } | null {
  if (u.billing_status === 'past_due') return { text: 'Your last payment failed. Update your card to keep your plan.', urgent: true };
  const quotas: Array<[string, string]> = [
    ['runs_month', 'agent runs'],
    ['api_ops_month', 'API and MCP operations'],
  ];
  for (const [key, label] of quotas) {
    if (u.limits[key] > 0 && (u.used[key] ?? 0) >= u.limits[key]) return { text: `You've used all your ${label} this month. Upgrade to keep going.`, urgent: true };
  }
  for (const [key, label] of quotas) {
    if (u.limits[key] > 0 && (u.used[key] ?? 0) >= 0.8 * u.limits[key]) return { text: `You've used 80% of your ${label} this month.`, urgent: false };
  }
  if (u.trial) {
    const days = Math.ceil((new Date(u.trial.ends_at).getTime() - Date.now()) / 86_400_000);
    if (days <= 2) return { text: `Your ${PLANS[u.trial.tier].name} trial ends ${days <= 1 ? 'within a day' : 'in 2 days'}. Nothing is deleted when it ends.`, urgent: false };
  }
  return null;
}

/** Trial ending, quotas near their limit, a failed payment: one line above the dashboard. */
export const PlanBanner: React.FC<{ onOpenBilling: () => void }> = ({ onOpenBilling }) => {
  const [message, setMessage] = useState<{ text: string; urgent: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/v1/account/usage', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((u: Usage | null) => {
        const m = u ? messageFor(u) : null;
        let dismissed = false;
        try {
          dismissed = !!m && sessionStorage.getItem('cc_plan_banner_dismissed') === m.text;
        } catch {
          // storage unavailable: show it
        }
        setMessage(dismissed ? null : m);
      })
      .catch(() => {});
  }, []);

  if (!message) return null;
  const dismiss = () => {
    try {
      sessionStorage.setItem('cc_plan_banner_dismissed', message.text);
    } catch {
      // ignore
    }
    setMessage(null);
  };
  return (
    <div className={`border-b px-4 py-1.5 text-xs flex items-center justify-between gap-3 ${message.urgent ? 'bg-red-950/80 border-red-900/70 text-red-200' : 'bg-amber-950/80 border-amber-900/70 text-amber-200'}`}>
      <button onClick={onOpenBilling} className="flex items-center gap-2 text-left hover:underline">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>{message.text}</span>
        <span className="font-semibold whitespace-nowrap">Plans &amp; usage →</span>
      </button>
      <button onClick={dismiss} aria-label="Dismiss" className="p-0.5 rounded hover:bg-black/20">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
