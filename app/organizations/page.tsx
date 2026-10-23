'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, Plus, ArrowRight, Settings } from 'lucide-react';
import { TeamMembersPanel } from '@/components/TeamMembersPanel';

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

  // Settings view for active org
  const [managingOrg, setManagingOrg] = useState<Organization | null>(null);
  const fetchMyOrgs = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchMyOrgs();
  }, [fetchMyOrgs]);

  // Every organization is usable; its plan only sets limits (Account & Billing).
  const selectOrg = () => {
    // An account belongs to one organization; the dashboard always opens it.
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-zinc-100 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-4xl space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white flex items-center gap-2">
              <Building2 className="w-6 h-6 text-emerald-400" />
              Your organization
            </h1>
            <p className="text-sm text-zinc-400 mt-1">Open your workspace, or manage its members (owners and admins).</p>
          </div>
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
                You are not a member of an organization yet.
              </p>
              <Link href="/onboarding" className="inline-block mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg">
                Create your organization
              </Link>
            </div>
          ) : (
            orgs.map((org) => {
              return (
              <div 
                key={org.id}
                className="group relative bg-[#0d1017] border border-zinc-800 rounded-xl p-5 cursor-pointer transition-all hover:border-emerald-500/50 hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-900/10"
                onClick={selectOrg}
              >
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

      {/* Manage/Invite Modal */}
      {managingOrg && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4">
          <div className="my-auto bg-[#0f121a] border border-zinc-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">{managingOrg.name}</h3>
              </div>
              <button onClick={() => setManagingOrg(null)} className="text-zinc-400 hover:text-white">
                <Plus className="w-4 h-4 rotate-45" />
              </button>
            </div>
            
            <div className="p-5">
              <TeamMembersPanel />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
