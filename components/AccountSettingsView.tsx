'use client';

import React, { useState } from 'react';
import {
  CreditCard,
  User,
  Mail,
  Lock,
  Download,
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  ArrowRightLeft,
  Trash2,
  ShieldAlert
} from 'lucide-react';

export const AccountSettingsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'profile' | 'billing' | 'danger'>('profile');
  
  // Profile state
  const [name, setName] = useState('Admin User');
  const [email, setEmail] = useState('admin@example.com');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Danger zone state
  const [transferEmail, setTransferEmail] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const invoices = [
    { id: 'INV-2026-09', date: 'Sep 01, 2026', amount: '$500.00', status: 'Paid' },
    { id: 'INV-2026-08', date: 'Aug 01, 2026', amount: '$500.00', status: 'Paid' },
    { id: 'INV-2026-07', date: 'Jul 01, 2026', amount: '$500.00', status: 'Paid' },
  ];

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccess(true);
    setTimeout(() => setProfileSuccess(false), 3000);
  };

  return (
    <div className="h-full flex flex-col bg-[#090b10] text-zinc-100 overflow-y-auto">
      {/* Top Banner */}
      <div className="px-6 py-8 border-b border-zinc-800 bg-[#0d1017]">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Account & Billing</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Manage your personal profile, subscription tiers, and organization lifecycle.
        </p>
      </div>

      <div className="flex-1 p-6 max-w-5xl mx-auto w-full flex gap-8">
        {/* Navigation Sidebar */}
        <div className="w-64 shrink-0 space-y-1">
          <button
            onClick={() => setActiveTab('profile')}
            className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors ${
              activeTab === 'profile' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <User className="w-4 h-4" />
            Profile Settings
          </button>
          <button
            onClick={() => setActiveTab('billing')}
            className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors ${
              activeTab === 'billing' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Billing & Plans
          </button>
          <button
            onClick={() => setActiveTab('danger')}
            className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors ${
              activeTab === 'danger' ? 'bg-rose-950/50 text-rose-400' : 'text-rose-400/70 hover:text-rose-400 hover:bg-rose-950/30'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            Danger Zone
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 space-y-8">
          {activeTab === 'profile' && (
            <div className="space-y-6 animate-fadeIn">
              <h2 className="text-lg font-semibold text-white">Personal Information</h2>
              <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-md">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-400">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-400">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-400">Current Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password to change"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-10 pr-4 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-400">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="New password"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-10 pr-4 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-400">Confirm New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Rewrite new password"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-10 pr-4 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>
                <div className="pt-2 flex items-center gap-4">
                  <button type="submit" className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors">
                    Save Changes
                  </button>
                  {profileSuccess && (
                    <span className="text-sm text-emerald-400 flex items-center gap-1.5 animate-fadeIn">
                      <CheckCircle2 className="w-4 h-4" /> Profile updated
                    </span>
                  )}
                </div>
              </form>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="space-y-10 animate-fadeIn">
              {/* Current Plan & Upgrade */}
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white">Subscription Plan</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/50 flex flex-col">
                    <h3 className="text-base font-semibold text-zinc-300">Tier 1</h3>
                    <div className="mt-2 text-2xl font-bold text-white">$250<span className="text-sm text-zinc-500 font-normal">/mo</span></div>
                    <ul className="mt-4 space-y-2 flex-1 text-sm text-zinc-400">
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Bring Your Own Key (BYOK)</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> 1 Organization</li>
                    </ul>
                    <button className="mt-6 w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors">
                      Current Plan
                    </button>
                  </div>
                  
                  <div className="p-5 rounded-xl border-2 border-emerald-500/50 bg-emerald-950/10 flex flex-col relative overflow-hidden">
                    <div className="absolute top-0 right-0 bg-emerald-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">RECOMMENDED</div>
                    <h3 className="text-base font-semibold text-emerald-400">Tier 2</h3>
                    <div className="mt-2 text-2xl font-bold text-white">$500<span className="text-sm text-zinc-500 font-normal">/mo</span></div>
                    <ul className="mt-4 space-y-2 flex-1 text-sm text-zinc-400">
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Bring Your Own Key (BYOK)</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Unlimited Organizations</li>
                    </ul>
                    <button className="mt-6 w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                      Upgrade to Tier 2
                    </button>
                  </div>

                  <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/50 flex flex-col">
                    <h3 className="text-base font-semibold text-zinc-300">Enterprise</h3>
                    <div className="mt-2 text-2xl font-bold text-white">$150<span className="text-sm text-zinc-500 font-normal">/mo</span></div>
                    <div className="text-xs text-amber-500/80 mt-1">+ $1500 Setup Fee</div>
                    <ul className="mt-4 space-y-2 flex-1 text-sm text-zinc-400">
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> We provide the API Keys</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Unlimited Organizations</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Dedicated Account Manager</li>
                    </ul>
                    <button className="mt-6 w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors">
                      Contact Sales
                    </button>
                  </div>
                </div>
              </div>

              {/* Invoices */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">Billing History</h2>
                  <div className="text-sm text-zinc-400">Next payment: <span className="text-emerald-400 font-medium">Oct 01, 2026</span></div>
                </div>
                <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/30">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400">
                      <tr>
                        <th className="px-4 py-3 font-medium">Invoice ID</th>
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-4 py-3 font-medium">Amount</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 text-right font-medium">Download</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-zinc-800/40">
                          <td className="px-4 py-3 font-mono text-zinc-300">{inv.id}</td>
                          <td className="px-4 py-3 text-zinc-400">{inv.date}</td>
                          <td className="px-4 py-3 text-zinc-300">{inv.amount}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded text-xs bg-emerald-950/60 text-emerald-400 border border-emerald-900/50">
                              {inv.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 rounded transition-colors inline-block">
                              <Download className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'danger' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center gap-2 text-rose-500 mb-6">
                <AlertTriangle className="w-5 h-5" />
                <h2 className="text-lg font-semibold">Danger Zone</h2>
              </div>

              {/* Pause Org */}
              <div className="p-5 border border-zinc-800 bg-zinc-900/50 rounded-xl flex items-start justify-between gap-6">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-zinc-200">Pause Organization</h3>
                  <p className="text-sm text-zinc-400 max-w-xl">
                    Temporarily halt all scheduled tasks, proactive heartbeats, and automated routing within this organization. Agents will not execute until resumed.
                  </p>
                </div>
                <button className="px-4 py-2 shrink-0 bg-amber-950/50 hover:bg-amber-900/60 text-amber-500 border border-amber-900/50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                  <PauseCircle className="w-4 h-4" /> Pause Activity
                </button>
              </div>

              {/* Transfer Org */}
              <div className="p-5 border border-zinc-800 bg-zinc-900/50 rounded-xl space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-zinc-200">Transfer Organization Ownership</h3>
                  <p className="text-sm text-zinc-400 max-w-xl">
                    Invite another user by email to take full ownership of this organization. You will lose owner privileges once they accept.
                  </p>
                </div>
                <div className="flex items-center gap-3 max-w-md">
                  <input
                    type="email"
                    value={transferEmail}
                    onChange={e => setTransferEmail(e.target.value)}
                    placeholder="new_owner@example.com"
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                  <button 
                    disabled={!transferEmail}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <ArrowRightLeft className="w-4 h-4" /> Transfer
                  </button>
                </div>
              </div>

              {/* Delete Org */}
              <div className="p-5 border border-rose-900/50 bg-rose-950/10 rounded-xl space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-rose-500">Delete Organization</h3>
                  <p className="text-sm text-zinc-400 max-w-xl">
                    Permanently delete this organization, including all agent threads, semantic memory, board tasks, and members. <strong>This action cannot be undone.</strong>
                  </p>
                </div>
                <div className="space-y-3 max-w-md">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider font-mono">
                    Type "delete" or the organization name to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirm}
                    onChange={e => setDeleteConfirm(e.target.value)}
                    placeholder="Organization name or 'delete'"
                    className="w-full bg-zinc-950 border border-rose-900/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500"
                  />
                  <button 
                    disabled={deleteConfirm.toLowerCase() !== 'delete'}
                    className="w-full py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-900/50 disabled:text-rose-500/50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> Permanently Delete
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
};
