'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CreditCard,
  User,
  Mail,
  Lock,
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  ArrowRightLeft,
  Trash2,
  ShieldAlert,
  KeyRound,
  Users,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { LlmKeysPanel } from '@/components/LlmKeysPanel';
import { TeamMembersPanel } from '@/components/TeamMembersPanel';
import { createClient } from '@/utils/supabase/client';
import { PLANS, checkoutUrl } from '@/lib/billing/plans';

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

type Notice = { ok: boolean; text: string } | null;

const inputCls =
  'w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-10 pr-4 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors';

const NoticeLine: React.FC<{ notice: Notice }> = ({ notice }) =>
  notice ? (
    <p className={`text-sm flex items-start gap-1.5 ${notice.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
      {notice.ok && <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}
      {notice.text}
    </p>
  ) : null;

/** Name, email and password of the signed-in account (Supabase Auth). */
const ProfilePanel: React.FC = () => {
  const supabase = createClient();
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentEmail, setCurrentEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState<'profile' | 'password' | null>(null);
  const [profileNotice, setProfileNotice] = useState<Notice>(null);
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      setName((u?.user_metadata?.full_name as string) || (u?.user_metadata?.name as string) || '');
      setEmail(u?.email ?? '');
      setCurrentEmail(u?.email ?? '');
      setLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('profile');
    setProfileNotice(null);
    try {
      const emailChanged = email.trim().toLowerCase() !== currentEmail.toLowerCase();
      const { error } = await supabase.auth.updateUser(
        { data: { full_name: name.trim() }, ...(emailChanged ? { email: email.trim() } : {}) },
        emailChanged ? { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` } : undefined
      );
      if (error) throw error;
      setProfileNotice({
        ok: true,
        text: emailChanged ? `Saved. Confirm the change from the email sent to ${email.trim()}; until then you keep signing in with ${currentEmail}.` : 'Saved.',
      });
    } catch (err) {
      setProfileNotice({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) return setPasswordNotice({ ok: false, text: 'Use at least 8 characters.' });
    if (newPassword !== confirmPassword) return setPasswordNotice({ ok: false, text: 'The passwords do not match.' });
    setBusy('password');
    setPasswordNotice(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice({ ok: true, text: 'Password changed.' });
    } catch (err) {
      setPasswordNotice({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  if (!loaded) return <div className="text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-10">
      <form onSubmit={saveProfile} className="space-y-4 max-w-md">
        <h2 className="text-lg font-semibold text-white">Personal information</h2>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-400">Full name</label>
          <div className="relative">
            <User className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-400">Email address</label>
          <div className="relative">
            <Mail className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button type="submit" disabled={busy !== null} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors">
            {busy === 'profile' ? 'Saving…' : 'Save changes'}
          </button>
        </div>
        <NoticeLine notice={profileNotice} />
      </form>

      <form onSubmit={savePassword} className="space-y-4 max-w-md">
        <h2 className="text-lg font-semibold text-white">Password</h2>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-400">New password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
            <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-400">Confirm new password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
            <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} />
          </div>
        </div>
        <button type="submit" disabled={busy !== null || !newPassword} className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors">
          {busy === 'password' ? 'Changing…' : 'Change password'}
        </button>
        <NoticeLine notice={passwordNotice} />
      </form>
    </div>
  );
};

interface BillingInfo {
  subscription: { plan: string | null; plan_tier: string; status: string; current_period_ends_at: string | null } | null;
  has_customer: boolean;
  stripe_configured: boolean;
  invoices: Array<{ id: string; number: string | null; created: string; amount_due: number; amount_paid: number; currency: string; status: string | null; hosted_invoice_url: string | null; invoice_pdf: string | null }>;
  invoices_error: string | null;
  can_manage: boolean;
}

const money = (cents: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);

/** The plan and invoices Stripe reports; nothing is shown that Stripe did not record. */
const BillingPanel: React.FC<{ orgId: string | null; email: string | null }> = ({ orgId, email }) => {
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    api<BillingInfo>('/api/v1/account/billing').then(setInfo).catch((err) => setNotice({ ok: false, text: err.message }));
  }, []);

  const openPortal = async () => {
    setOpening(true);
    try {
      const { url } = await api<{ url: string }>('/api/v1/account/billing/portal', { method: 'POST' });
      window.location.href = url;
    } catch (err) {
      setNotice({ ok: false, text: (err as Error).message });
      setOpening(false);
    }
  };

  if (!info) return notice ? <NoticeLine notice={notice} /> : <div className="text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading billing…</div>;
  const sub = info.subscription;

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Subscription</h2>
          {info.has_customer && info.can_manage && (
            <button onClick={openPortal} disabled={opening} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2">
              {opening ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />} Manage billing (Stripe)
            </button>
          )}
        </div>
        <p className="text-sm text-zinc-400">
          {sub
            ? `Current plan: ${PLANS.find((p) => p.id === sub.plan)?.name ?? sub.plan_tier} · ${sub.status}${sub.current_period_ends_at ? ` · current period ends ${new Date(sub.current_period_ends_at).toLocaleDateString()}` : ''}`
            : 'This organization has no subscription yet.'}
        </p>
        <NoticeLine notice={notice} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const current = sub?.plan === plan.id;
            return (
              <div key={plan.id} className={`p-5 rounded-xl border flex flex-col ${current ? 'border-emerald-500/60 bg-emerald-950/10' : 'border-zinc-800 bg-zinc-900/50'}`}>
                <h3 className="text-base font-semibold text-zinc-200">{plan.name}</h3>
                <div className="mt-2 text-2xl font-bold text-white">${plan.monthlyUsd}<span className="text-sm text-zinc-500 font-normal">/mo</span></div>
                {plan.setupFeeUsd && <div className="text-xs text-amber-500/80 mt-1">+ ${plan.setupFeeUsd} setup fee</div>}
                <ul className="mt-4 space-y-2 flex-1 text-sm text-zinc-400">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" /> {f}</li>
                  ))}
                </ul>
                {current ? (
                  <div className="mt-6 w-full py-2 text-center text-sm text-emerald-400 border border-emerald-800/50 rounded-lg">Current plan</div>
                ) : sub && info.can_manage ? (
                  <button onClick={openPortal} className="mt-6 w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium">Change plan</button>
                ) : info.can_manage && orgId ? (
                  <a href={checkoutUrl(plan, orgId, email)} target="_blank" rel="noopener noreferrer" className="mt-6 w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium text-center block">
                    Subscribe
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Invoices</h2>
        {info.invoices_error && <NoticeLine notice={{ ok: false, text: info.invoices_error }} />}
        {info.invoices.length === 0 ? (
          <p className="text-sm text-zinc-500">No invoices yet.</p>
        ) : (
          <div className="border border-zinc-800 rounded-xl overflow-x-auto bg-zinc-900/30">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Invoice</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {info.invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-4 py-3 font-mono text-zinc-300">{inv.number ?? inv.id}</td>
                    <td className="px-4 py-3 text-zinc-400">{new Date(inv.created).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-zinc-300">{money(inv.status === 'paid' ? inv.amount_paid : inv.amount_due, inv.currency)}</td>
                    <td className="px-4 py-3 text-zinc-300 capitalize">{inv.status ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {(inv.hosted_invoice_url || inv.invoice_pdf) && (
                        <a href={inv.hosted_invoice_url ?? inv.invoice_pdf ?? '#'} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1">
                          Open <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

/** Pause agents, hand the organization to another member, or delete it. */
const DangerPanel: React.FC<{ org: { id: string; name: string } | null; role: string | null }> = ({ org, role }) => {
  const router = useRouter();
  const [pausedAt, setPausedAt] = useState<string | null>(null);
  const [pausedBy, setPausedBy] = useState<string | null>(null);
  const [transferEmail, setTransferEmail] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [busy, setBusy] = useState<'pause' | 'transfer' | 'delete' | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const isOwner = role === 'owner';
  const canPause = role === 'owner' || role === 'admin';

  const loadControl = useCallback(() => {
    api<{ paused_at: string | null; paused_by: string | null }>('/api/v1/agent-runs/control')
      .then((s) => {
        setPausedAt(s.paused_at);
        setPausedBy(s.paused_by);
      })
      .catch(() => undefined);
  }, []);
  useEffect(loadControl, [loadControl]);

  const togglePause = async () => {
    const action = pausedAt ? 'resume' : 'stop';
    if (action === 'stop' && !confirm('Pause all agent activity? Queued runs are cancelled and running ones stop at their next step. Scheduled tasks and heartbeats are skipped until you resume.')) return;
    setBusy('pause');
    setNotice(null);
    try {
      await api('/api/v1/agent-runs/control', { method: 'POST', body: JSON.stringify({ action }) });
      loadControl();
    } catch (err) {
      setNotice({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const transfer = async () => {
    if (!confirm(`Make ${transferEmail} the owner of ${org?.name}? You become an admin.`)) return;
    setBusy('transfer');
    setNotice(null);
    try {
      await api('/api/v1/account/transfer', { method: 'POST', body: JSON.stringify({ email: transferEmail }) });
      setNotice({ ok: true, text: `${transferEmail} is now the owner. You are an admin.` });
      setTransferEmail('');
    } catch (err) {
      setNotice({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('delete');
    setNotice(null);
    try {
      await api('/api/v1/account/delete', { method: 'POST', body: JSON.stringify({ confirm: deleteConfirm }) });
      router.push('/onboarding');
    } catch (err) {
      setNotice({ ok: false, text: (err as Error).message });
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-rose-500 mb-2">
        <AlertTriangle className="w-5 h-5" />
        <h2 className="text-lg font-semibold">Danger Zone</h2>
      </div>
      <NoticeLine notice={notice} />

      <div className="p-5 border border-zinc-800 bg-zinc-900/50 rounded-xl flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-zinc-200">{pausedAt ? 'Agent activity is paused' : 'Pause agent activity'}</h3>
          <p className="text-sm text-zinc-400 max-w-xl">
            {pausedAt
              ? `Paused ${new Date(pausedAt).toLocaleString()}${pausedBy ? ` by ${pausedBy}` : ''}. No agent runs, scheduled tasks or heartbeats run until you resume.`
              : 'Stops every agent run of this organization: queued runs are cancelled, running ones stop at their next step, and scheduled tasks and heartbeats are skipped until you resume. Tool calls already in progress finish.'}
          </p>
        </div>
        {canPause && (
          <button
            onClick={togglePause}
            disabled={busy !== null}
            className={`px-4 py-2 shrink-0 rounded-lg text-sm font-medium flex items-center gap-2 border disabled:opacity-50 ${
              pausedAt ? 'bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-400 border-emerald-900/50' : 'bg-amber-950/50 hover:bg-amber-900/60 text-amber-500 border-amber-900/50'
            }`}
          >
            {pausedAt ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />} {pausedAt ? 'Resume activity' : 'Pause activity'}
          </button>
        )}
      </div>

      {isOwner && (
        <div className="p-5 border border-zinc-800 bg-zinc-900/50 rounded-xl space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-zinc-200">Transfer ownership</h3>
            <p className="text-sm text-zinc-400 max-w-xl">Make another member the owner. They must already be a member (invite them in Team first). You become an admin.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 max-w-md">
            <input
              type="email"
              value={transferEmail}
              onChange={(e) => setTransferEmail(e.target.value)}
              placeholder="member@company.com"
              className="flex-1 min-w-0 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={transfer}
              disabled={!transferEmail || busy !== null}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
            >
              <ArrowRightLeft className="w-4 h-4" /> Transfer
            </button>
          </div>
        </div>
      )}

      {isOwner && org && (
        <div className="p-5 border border-rose-900/50 bg-rose-950/10 rounded-xl space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-rose-500">Delete organization</h3>
            <p className="text-sm text-zinc-400 max-w-xl">
              Everyone loses access right away, its API keys are revoked, pending invitations are cancelled and its agents stop. Its data is kept so support can restore it if you ask; ask support to
              erase it permanently. Cancel your subscription in Billing first if you have one.
            </p>
          </div>
          <div className="space-y-3 max-w-md">
            <label className="text-xs text-zinc-500 uppercase tracking-wider font-mono">Type &quot;{org.name}&quot; to confirm</label>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={org.name}
              className="w-full bg-zinc-950 border border-rose-900/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500"
            />
            <button
              onClick={remove}
              disabled={deleteConfirm.trim() !== org.name || busy !== null}
              className="w-full py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-900/50 disabled:text-rose-500/50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
            >
              {busy === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete organization
            </button>
          </div>
        </div>
      )}
      {!isOwner && <p className="text-sm text-zinc-500">Only the owner can transfer or delete the organization.</p>}
    </div>
  );
};

type Tab = 'profile' | 'team' | 'keys' | 'billing' | 'danger';

export const AccountSettingsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    api<{ organizations: Array<{ id: string; name: string; role: string }> }>('/api/v1/organizations/me')
      .then(({ organizations }) => {
        const mine = organizations[0];
        if (mine) {
          setOrg({ id: mine.id, name: mine.name });
          setRole(mine.role);
        }
      })
      .catch(() => undefined);
    void createClient()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; danger?: boolean }> = [
    { id: 'profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
    { id: 'team', label: 'Team', icon: <Users className="w-4 h-4" /> },
    { id: 'keys', label: 'LLM providers', icon: <KeyRound className="w-4 h-4" /> },
    { id: 'billing', label: 'Billing & Plans', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'danger', label: 'Danger Zone', icon: <ShieldAlert className="w-4 h-4" />, danger: true },
  ];

  return (
    <div className="h-full flex flex-col bg-[#090b10] text-zinc-100 overflow-y-auto">
      <div className="px-6 py-8 border-b border-zinc-800 bg-[#0d1017]">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Account & Billing</h1>
        <p className="text-sm text-zinc-400 mt-1">{org ? `${org.name} · you are ${role}` : 'Your profile, team, providers, plan and organization.'}</p>
      </div>

      <div className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full flex flex-col md:flex-row gap-6 md:gap-8">
        <div className="md:w-56 shrink-0 flex md:flex-col gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`shrink-0 text-left px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors ${
                t.danger
                  ? activeTab === t.id
                    ? 'bg-rose-950/50 text-rose-400'
                    : 'text-rose-400/70 hover:text-rose-400 hover:bg-rose-950/30'
                  : activeTab === t.id
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0 space-y-8">
          {activeTab === 'profile' && <ProfilePanel />}
          {activeTab === 'team' && <TeamMembersPanel />}
          {activeTab === 'keys' && <LlmKeysPanel />}
          {activeTab === 'billing' && <BillingPanel orgId={org?.id ?? null} email={email} />}
          {activeTab === 'danger' && <DangerPanel org={org} role={role} />}
        </div>
      </div>
    </div>
  );
};
