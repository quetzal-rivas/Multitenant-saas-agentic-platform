'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Plus, ArrowRight, Settings, Users, LogOut, CheckCircle2, Lock } from 'lucide-react';
import PricingSection from '@/components/PricingSection';

interface Organization {
  id: string;
  name: string;
  role: string;
  subscription_status?: string;
}

export default function OrganizationsPage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  
  // Paywall Modal State
  const [selectedLockedOrgId, setSelectedLockedOrgId] = useState<string | null>(null);

  // Settings view for active org
  const [managingOrg, setManagingOrg] = useState<Organization | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState('');

  useEffect(() => {
    fetchMyOrgs();
  }, []);

  const fetchMyOrgs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/organizations/me');
      if (res.ok) {
        const data = await res.json();
        setOrgs(data.organizations || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName) return;
    
    try {
      const res = await fetch('/api/v1/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newOrgName })
      });
      if (res.ok) {
        setNewOrgName('');
        setIsCreating(false);
        fetchMyOrgs();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingOrg || !inviteEmail) return;
    
    try {
      const res = await fetch(`/api/v1/organizations/${managingOrg.id}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail })
      });
      if (res.ok) {
        setInviteStatus('Invitation sent to ' + inviteEmail);
        setInviteEmail('');
        setTimeout(() => setInviteStatus(''), 3000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const selectOrg = (orgId: string, subscription_status?: string) => {
    if (subscription_status !== 'active') {
      setSelectedLockedOrgId(orgId);
      return;
    }
    // In a real app we'd set a cookie or global context for tenant_id/org_id here
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-zinc-100 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-4xl space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white flex items-center gap-2">
              <Building2 className="w-6 h-6 text-emerald-400" />
              My Organizations
            </h1>
            <p className="text-sm text-zinc-400 mt-1">Select an organization to enter your workspace.</p>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg flex items-center gap-2 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Organization
          </button>
        </div>

        {/* Organization Wall */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            <div className="col-span-full py-12 text-center text-zinc-500 text-sm font-mono animate-pulse">
              Loading your organizations...
            </div>
          ) : orgs.length === 0 ? (
            <div className="col-span-full py-12 text-center border border-dashed border-zinc-800 rounded-xl bg-zinc-900/30">
              <Building2 className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-zinc-300">No Organizations Found</h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
                You are not a member of any organizations yet. Create one to get started.
              </p>
            </div>
          ) : (
            orgs.map((org) => {
              const isLocked = org.subscription_status !== 'active';
              return (
              <div 
                key={org.id}
                className={`group relative bg-[#0d1017] border border-zinc-800 rounded-xl p-5 cursor-pointer transition-all ${
                  isLocked 
                    ? 'opacity-70 grayscale hover:opacity-100 hover:grayscale-0 hover:border-zinc-500' 
                    : 'hover:border-emerald-500/50 hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-900/10'
                }`}
                onClick={() => selectOrg(org.id, org.subscription_status)}
              >
                {isLocked && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-[1px] rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-lg text-sm font-semibold text-white shadow-xl">
                      <Lock className="w-4 h-4 text-emerald-400" /> Unlock Workspace
                    </div>
                  </div>
                )}
                <div className="flex justify-between items-start mb-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-950 flex items-center justify-center text-emerald-400 border border-emerald-900/50">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 uppercase tracking-wider">
                    {org.role}
                  </span>
                </div>
                
                <h3 className="text-lg font-semibold text-zinc-100 group-hover:text-emerald-400 transition-colors">
                  {org.name}
                </h3>
                <p className="text-[11px] font-mono text-zinc-500 mt-2 truncate">
                  ID: {org.id.split('-')[0]}...
                </p>

                <div className="mt-4 pt-4 border-t border-zinc-800/80 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-xs text-zinc-400 font-medium">Enter Workspace</span>
                  <ArrowRight className="w-4 h-4 text-emerald-400" />
                </div>

                {/* Settings Gear (stops propagation to open settings modal instead of entering) */}
                {(org.role === 'owner' || org.role === 'admin') && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setManagingOrg(org);
                    }}
                    className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                )}
              </div>
            )})
          )}
        </div>
      </div>

      {/* Create Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f121a] border border-zinc-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Create New Organization</h3>
              <button onClick={() => setIsCreating(false)} className="text-zinc-400 hover:text-white">
                <Plus className="w-4 h-4 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleCreateOrg} className="p-5 space-y-4 text-sm">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-400">Organization Name</label>
                <input
                  required
                  autoFocus
                  value={newOrgName}
                  onChange={e => setNewOrgName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button type="submit" className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors">
                Create & Continue
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Manage/Invite Modal */}
      {managingOrg && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f121a] border border-zinc-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  Manage Team: {managingOrg.name}
                </h3>
              </div>
              <button onClick={() => setManagingOrg(null)} className="text-zinc-400 hover:text-white">
                <Plus className="w-4 h-4 rotate-45" />
              </button>
            </div>
            
            <div className="p-5 space-y-6">
              <form onSubmit={handleInvite} className="space-y-3 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono">Invite Member via Email</label>
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="teammate@example.com"
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                  <button type="submit" className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg">
                    Send Invite
                  </button>
                </div>
                {inviteStatus && (
                  <div className="text-xs text-emerald-400 flex items-center gap-1.5 mt-2">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {inviteStatus}
                  </div>
                )}
              </form>

              <div className="space-y-3">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono">Current Members (Simulated)</label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-400">YOU</div>
                      <div>
                        <div className="text-sm font-medium text-zinc-200">Current User</div>
                        <div className="text-[10px] text-zinc-500 font-mono">Admin</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded border border-emerald-900">Owner</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Paywall Modal */}
      {selectedLockedOrgId && (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center overflow-y-auto">
          <div className="relative w-full py-12">
            <button 
              onClick={() => setSelectedLockedOrgId(null)}
              className="absolute top-6 right-6 p-2 bg-zinc-900 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors z-10"
            >
              <Plus className="w-6 h-6 rotate-45" />
            </button>
            <PricingSection orgId={selectedLockedOrgId} />
          </div>
        </div>
      )}
    </div>
  );
}
