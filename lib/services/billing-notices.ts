import { getSupabaseAdminClient } from '@/lib/supabase';
import { PLANS, type PlanId } from '@/lib/billing/plans';
import { sendEmail } from '@/lib/notify/email';
import { effectivePlan, monthPeriod } from './plan-limits';
import { pausedResources } from './plan-activation';

/**
 * Emails the owners and admins about their plan: a trial ending in 2 days, a trial that
 * ended, and monthly quotas at 80% and 100%. Each notice is sent once (billing_notices is
 * keyed by organization and notice), so the job can run as often as the tick likes.
 */

const DAY = 86_400_000;
const db = () => getSupabaseAdminClient();

export interface Notice {
  key: string;
  kind: 'trial_ending' | 'trial_ended' | 'quota_80' | 'quota_100';
  subject: string;
  text: string;
}

export interface NoticeDeps {
  send?: (to: string[], subject: string, text: string) => Promise<boolean>;
  recipients?: (tenantId: string) => Promise<string[]>;
}

/** Organizations that may need a notice now: trials near their end, and recent usage. */
async function candidates(now: Date): Promise<string[]> {
  const [trials, ops, runs] = await Promise.all([
    db().from('entitlements').select('tenant_id').gte('trial_ends_at', new Date(now.getTime() - DAY).toISOString()).lte('trial_ends_at', new Date(now.getTime() + 2 * DAY).toISOString()),
    db().from('usage_counters').select('tenant_id').eq('metric', 'api_ops').eq('period', monthPeriod(now)),
    db().from('agent_runs').select('tenant_id').gte('created_at', new Date(now.getTime() - 2 * 3_600_000).toISOString()).limit(2000),
  ]);
  const ids = new Set<string>();
  for (const r of [...(trials.data || []), ...(ops.data || []), ...(runs.data || [])] as Array<{ tenant_id: string }>) ids.add(r.tenant_id);
  return [...ids];
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

/** The notices an organization is due now (before de-duplication). */
export async function noticesFor(tenantId: string, appUrl: string, now = new Date()): Promise<Notice[]> {
  const out: Notice[] = [];
  const billing = `${appUrl}/dashboard?billing=open`;
  const [{ data: ent }, plan] = await Promise.all([
    db().from('entitlements').select('trial_tier, trial_ends_at').eq('tenant_id', tenantId).maybeSingle(),
    effectivePlan(tenantId, now, { fresh: true }),
  ]);

  const trialTier = (ent as { trial_tier?: PlanId | null } | null)?.trial_tier;
  const trialEnds = (ent as { trial_ends_at?: string | null } | null)?.trial_ends_at;
  if (trialTier && trialEnds) {
    const left = new Date(trialEnds).getTime() - now.getTime();
    const tier = PLANS[trialTier].name;
    const after = PLANS[plan.basePlan].name;
    if (left > 0 && left <= 2 * DAY) {
      out.push({
        key: `trial_ending:${trialTier}:${trialEnds}`,
        kind: 'trial_ending',
        subject: `Your ${tier} trial ends ${left <= DAY ? 'tomorrow' : 'in 2 days'}`,
        text: [
          `Your 7-day ${tier} trial ends on ${fmtDate(trialEnds)} (UTC).`,
          `Afterwards your organization returns to ${after}. Nothing is deleted and you are never charged for a trial.`,
          `If you have more agents, teams or scheduled tasks than ${after} allows, the extra ones are paused until you choose which stay active or upgrade.`,
          `Plans and usage: ${billing}`,
        ].join('\n\n'),
      });
    } else if (left <= 0 && left > -DAY) {
      const paused = await pausedResources(tenantId);
      const pausedLine = paused.length
        ? `Paused by the plan (kept, not deleted): ${paused.map((p) => `${p.paused.length} of ${p.total} ${p.label}`).join(', ')}. Choose which stay active in Account & Billing.`
        : `Everything you created fits in ${after}.`;
      out.push({
        key: `trial_ended:${trialTier}:${trialEnds}`,
        kind: 'trial_ended',
        subject: `Your ${tier} trial has ended`,
        text: [`Your ${tier} trial ended on ${fmtDate(trialEnds)} (UTC). Your organization is on ${after} now; nothing was deleted.`, pausedLine, `Plans and usage: ${billing}`].join('\n\n'),
      });
    }
  }

  const period = monthPeriod(now);
  const monthStart = `${period}-01T00:00:00.000Z`;
  const [{ count: runs }, { data: ops }] = await Promise.all([
    db().from('agent_runs').select('id', { count: 'exact' }).eq('tenant_id', tenantId).gte('created_at', monthStart).limit(1),
    db().from('usage_counters').select('used').eq('tenant_id', tenantId).eq('metric', 'api_ops').eq('period', period).maybeSingle(),
  ]);
  const quotas: Array<{ metric: string; label: string; used: number; limit: number }> = [
    { metric: 'runs', label: 'agent runs', used: runs ?? 0, limit: plan.limits.runs_month },
    { metric: 'api_ops', label: 'API and MCP operations', used: (ops as { used?: number } | null)?.used ?? 0, limit: plan.limits.api_ops_month },
  ];
  const resets = fmtDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString());
  for (const q of quotas) {
    if (q.limit <= 0) continue;
    const pct = q.used / q.limit;
    if (pct < 0.8) continue;
    const full = pct >= 1;
    out.push({
      key: `${full ? 'quota_100' : 'quota_80'}:${q.metric}:${period}`,
      kind: full ? 'quota_100' : 'quota_80',
      subject: full ? `You've used all your ${q.label} this month` : `You've used 80% of your ${q.label} this month`,
      text: [
        `Your organization has used ${q.used.toLocaleString('en-US')} of ${q.limit.toLocaleString('en-US')} ${q.label} included in ${PLANS[plan.plan].name} this month.`,
        full ? `New ${q.label} are refused until the quota resets on ${resets} (UTC), or until you upgrade.` : `The quota resets on ${resets} (UTC).`,
        `Plans and usage: ${billing}`,
      ].join('\n\n'),
    });
  }
  return out;
}

/** Owners' and admins' email addresses. */
async function ownerEmails(tenantId: string): Promise<string[]> {
  const [{ data: members }, { data: emails }] = await Promise.all([
    db().from('organization_members').select('user_id, role').eq('organization_id', tenantId).in('role', ['owner', 'admin']),
    db().rpc('org_member_emails', { p_org: tenantId }),
  ]);
  const wanted = new Set(((members || []) as Array<{ user_id: string }>).map((m) => m.user_id));
  return ((emails || []) as Array<{ user_id: string; email: string | null }>).filter((e) => wanted.has(e.user_id) && e.email).map((e) => e.email!);
}

/** Record a notice (once) and email it. Returns false when it was already sent. */
async function deliver(tenantId: string, notice: Notice, deps: Required<NoticeDeps>): Promise<boolean> {
  const { error } = await db().from('billing_notices').insert({ tenant_id: tenantId, notice_key: notice.key, kind: notice.kind });
  if (error) {
    if (error.code === '23505') return false;
    throw new Error(`Could not record the notice: ${error.message}`);
  }
  try {
    const to = await deps.recipients(tenantId);
    const emailed = await deps.send(to, notice.subject, notice.text);
    await db().from('billing_notices').update({ emailed, recipients: emailed ? to.length : 0 }).eq('tenant_id', tenantId).eq('notice_key', notice.key);
    return true;
  } catch (err) {
    // Not sent: release it so the next run tries again.
    await db().from('billing_notices').delete().eq('tenant_id', tenantId).eq('notice_key', notice.key);
    throw err;
  }
}

/** Called by the minute tick (every 10 minutes). */
export async function sendBillingNotices(appUrl: string, now = new Date(), deps: NoticeDeps = {}) {
  const full: Required<NoticeDeps> = { send: deps.send ?? sendEmail, recipients: deps.recipients ?? ownerEmails };
  let sent = 0;
  let failed = 0;
  for (const tenantId of await candidates(now)) {
    try {
      for (const notice of await noticesFor(tenantId, appUrl, now)) if (await deliver(tenantId, notice, full)) sent++;
    } catch (err) {
      failed++;
      console.error('[billing-notices] failed for', tenantId, err);
    }
  }
  return { sent, failed };
}
