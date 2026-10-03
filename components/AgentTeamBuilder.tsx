'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  Bot,
  Plus,
  Trash2,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Server,
  Database,
  ArrowRight,
  RefreshCw,
  Layers,
  ChevronRight,
  ExternalLink,
  Code2,
  Check,
  Zap,
  DollarSign,
  Mail,
  FileText,
  AlertTriangle,
  Play,
  Copy,
  Sliders,
  Radio,
  SlidersHorizontal,
  BookmarkCheck,
  Key,
  Wrench,
  Search,
  CheckSquare,
  Square,
  Filter,
} from 'lucide-react';
import { McpServerProfile } from '@/lib/demo/legacy_mocks/types';
import { ContextProfile } from '@/lib/types';
import { McpProfileManager } from '@/lib/demo/legacy_mocks/profile-manager';
import { INITIAL_PROFILES } from '@/lib/demo';
import { AuthenticatedMcpTool, PLATFORM_MCP_TOOLS_CATALOG } from '@/lib/demo/legacy_mocks/team-blueprint-manager';


interface WorkerForm {
  id: string;
  name: string;
  role: string;
  mcpProfileId?: string;
  contextProfileSlug?: string;
  avatarIcon: string;
  skills: string[]; // Assigned capability skill ids
}

interface TeamProfile {
  id: string;
  tenantId: string;
  name: string;
  supervisorPrompt?: string;
  supervisorSkills?: string[];
  supervisorMcpProfileId?: string;
  supervisorContextProfileSlug?: string;
  routingStrategy: string;
  workers: {
    id: string;
    name: string;
    role: string;
    skills?: string[];
    mcpTools?: string[];
    mcpProfileId?: string;
    contextProfileSlug?: string;
    avatarIcon: string;
  }[];
  createdAt: string;
}

interface ThreadInstance {
  id: string;
  tenantId: string;
  profileId: string;
  threadId: string;
  title: string;
  totalSteps: number;
  lastActive: string;
  createdAt: string;
}

interface AgentTeamBuilderProps {
  tenantId?: string;
  onLaunchThread?: (profileId: string, threadId: string) => void;
}

const PRESET_TEMPLATES = [
  {
    name: 'Front Desk & Voice Concierge Team',
    supervisorMcpProfileId: 'mcp-profile-sales',
    supervisorContextProfileSlug: 'sales-agent',
    supervisorSkills: ['crm.search_contact', 'gmail.send_draft', 'slack.post_incident_alert'],
    routingStrategy: 'supervisor_router',
    workers: [
      {
        id: 'wkr_crm_preset',
        name: 'CRM Specialist',
        role: 'Lead Enrichment & CRM Operations',
        mcpProfileId: 'mcp-profile-sales',
        contextProfileSlug: 'sales-agent',
        skills: ['crm.search_contact', 'crm.add_lead', 'crm.tag_contact', 'crm.update_deal_stage'],
        avatarIcon: 'bot',
      },
      {
        id: 'wkr_billing_preset',
        name: 'Billing Clerk',
        role: 'Invoicing & Stripe Audit',
        mcpProfileId: 'mcp-profile-sales',
        contextProfileSlug: 'customer-support',
        skills: ['stripe.get_invoice', 'stripe.pay', 'stripe.refund_status'],
        avatarIcon: 'dollar',
      },
    ],
  },
  {
    name: 'Night Audit & SRE Operations Team',
    supervisorMcpProfileId: 'mcp-profile-dev',
    supervisorContextProfileSlug: 'code-reviewer',
    supervisorSkills: ['slack.post_incident_alert', 'postgres.execute_read_query'],
    routingStrategy: 'supervisor_router',
    workers: [
      {
        id: 'wkr_db_preset',
        name: 'Database Auditor',
        role: 'PostgreSQL Consistency Inspector',
        mcpProfileId: 'mcp-profile-dev',
        contextProfileSlug: 'code-reviewer',
        skills: ['postgres.describe_table', 'postgres.execute_read_query'],
        avatarIcon: 'database',
      },
      {
        id: 'wkr_pager_preset',
        name: 'Incident Dispatcher',
        role: 'Ops Alert & Escalations',
        mcpProfileId: 'mcp-profile-dev',
        contextProfileSlug: 'executive-briefing',
        skills: ['slack.post_incident_alert', 'gmail.send_draft'],
        avatarIcon: 'shield',
      },
    ],
  },
  {
    name: 'Enterprise Outbound & Research Team',
    supervisorMcpProfileId: 'mcp-profile-exec',
    supervisorContextProfileSlug: 'executive-briefing',
    supervisorSkills: ['gmail.send_draft', 'notion.search_pages'],
    routingStrategy: 'supervisor_router',
    workers: [
      {
        id: 'wkr_lead_preset',
        name: 'Lead Research Specialist',
        role: 'CRM Account Insights',
        mcpProfileId: 'mcp-profile-sales',
        contextProfileSlug: 'sales-agent',
        skills: ['crm.search_contact', 'crm.add_lead', 'notion.search_pages'],
        avatarIcon: 'bot',
      },
      {
        id: 'wkr_mail_preset',
        name: 'Communications Clerk',
        role: 'Gmail Outreach & Follow-up',
        mcpProfileId: 'mcp-profile-exec',
        contextProfileSlug: 'customer-support',
        skills: ['gmail.send_draft', 'slack.post_incident_alert'],
        avatarIcon: 'mail',
      },
    ],
  },
];

export const AgentTeamBuilder: React.FC<AgentTeamBuilderProps> = ({
  tenantId = 'tenant_enterprise_corp',
  onLaunchThread,
}) => {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [existingTeams, setExistingTeams] = useState<TeamProfile[]>([]);
  const [threadInstances, setThreadInstances] = useState<ThreadInstance[]>([]);
  const [mcpProfilesList, setMcpProfilesList] = useState<McpServerProfile[]>(() =>
    McpProfileManager.listProfiles()
  );
  const [contextProfilesList, setContextProfilesList] = useState<ContextProfile[]>(INITIAL_PROFILES);
  const [skillsCatalog, setSkillsCatalog] = useState<AuthenticatedMcpTool[]>(PLATFORM_MCP_TOOLS_CATALOG);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);

  // Blueprint Form State (Profiles-Centric)
  const [teamName, setTeamName] = useState<string>('Front Desk Automation Team');
  const [supervisorMcpProfileId, setSupervisorMcpProfileId] = useState<string>('mcp-profile-sales');
  const [supervisorContextProfileSlug, setSupervisorContextProfileSlug] = useState<string>('sales-agent');
  const [supervisorSkills, setSupervisorSkills] = useState<string[]>([
    'crm.search_contact',
    'slack.post_incident_alert',
  ]);
  const [routingStrategy, setRoutingStrategy] = useState<string>('supervisor_router');

  // Heartbeat Config State
  const [heartbeatEnabled, setHeartbeatEnabled] = useState<boolean>(false);
  const [heartbeatRateMinutes, setHeartbeatRateMinutes] = useState<number>(15);
  const [heartbeatGoal, setHeartbeatGoal] = useState<string>('Monitor the supervisor board and claim new tasks.');

  const [workers, setWorkers] = useState<WorkerForm[]>([
    {
      id: 'wkr_crm_01',
      name: 'CRM Specialist',
      role: 'Lead Enrichment & CRM Operations',
      mcpProfileId: 'mcp-profile-sales',
      contextProfileSlug: 'sales-agent',
      skills: ['crm.search_contact', 'crm.add_lead', 'crm.tag_contact'],
      avatarIcon: 'bot',
    },
    {
      id: 'wkr_billing_01',
      name: 'Billing Clerk',
      role: 'Invoicing & Stripe Audit',
      mcpProfileId: 'mcp-profile-sales',
      contextProfileSlug: 'customer-support',
      skills: ['stripe.get_invoice', 'stripe.pay', 'stripe.refund_status'],
      avatarIcon: 'dollar',
    },
  ]);

  // Target selected in Step 3: 'supervisor' or worker id
  const [selectedTargetId, setSelectedTargetId] = useState<string>('supervisor');
  const [skillSearchQuery, setSkillSearchQuery] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [spawnedThreadId, setSpawnedThreadId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'builder' | 'instances'>('builder');
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Fetch initial profiles catalog, skills catalog, and existing team blueprints
  useEffect(() => {
    let ignore = false;

    async function loadData() {
      try {
        // 1. Fetch available MCP profiles, Context profiles, and Skills
        const catalogRes = await fetch('/api/v1/profiles/assigned-catalog');
        if (catalogRes.ok) {
          const catalogData = await catalogRes.json();
          if (!ignore) {
            if (catalogData.mcp_profiles && catalogData.mcp_profiles.length > 0) {
              setMcpProfilesList(catalogData.mcp_profiles);
            }
            if (catalogData.context_profiles && catalogData.context_profiles.length > 0) {
              setContextProfilesList(catalogData.context_profiles);
            }
            if (catalogData.skills_catalog && catalogData.skills_catalog.length > 0) {
              setSkillsCatalog(catalogData.skills_catalog);
            }
          }
        }

        // 2. Fetch existing team blueprints and instances
        const teamsRes = await fetch(`/api/v1/teams?tenant_id=${tenantId}`);
        if (teamsRes.ok) {
          const teamsData = await teamsRes.json();
          if (!ignore) {
            setExistingTeams(teamsData.teams || []);
            setThreadInstances(teamsData.all_instances || []);
          }
        }
      } catch (err) {
        console.error('Failed to load profiles catalog or team blueprints:', err);
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      ignore = true;
    };
  }, [tenantId, refreshTrigger]);

  // Add Worker
  const handleAddWorker = () => {
    const newWorkerId = `wkr_custom_${Date.now()}`;
    const defaultMcp = mcpProfilesList[0]?.id || 'mcp-profile-sales';
    const defaultCtx = contextProfilesList[0]?.slug || 'sales-agent';
    const newWorker: WorkerForm = {
      id: newWorkerId,
      name: `Specialist Worker ${workers.length + 1}`,
      role: 'Operational Specialist',
      mcpProfileId: defaultMcp,
      contextProfileSlug: defaultCtx,
      skills: ['crm.search_contact'],
      avatarIcon: 'bot',
    };
    setWorkers([...workers, newWorker]);
  };

  // Remove Worker
  const handleRemoveWorker = (index: number) => {
    if (workers.length <= 1) return;
    const removedId = workers[index].id;
    const updated = workers.filter((_, i) => i !== index);
    setWorkers(updated);
    if (selectedTargetId === removedId) {
      setSelectedTargetId('supervisor');
    }
  };

  // Update Worker Field
  const handleUpdateWorker = (index: number, field: keyof WorkerForm, value: any) => {
    const updated = [...workers];
    updated[index] = { ...updated[index], [field]: value };
    setWorkers(updated);
  };

  // Load Preset Blueprint
  const handleLoadPreset = (preset: (typeof PRESET_TEMPLATES)[0]) => {
    setTeamName(preset.name);
    setSupervisorMcpProfileId(preset.supervisorMcpProfileId);
    setSupervisorContextProfileSlug(preset.supervisorContextProfileSlug);
    setSupervisorSkills(preset.supervisorSkills || []);
    setRoutingStrategy(preset.routingStrategy);
    setWorkers(
      preset.workers.map((w) => ({
        id: w.id,
        name: w.name,
        role: w.role,
        mcpProfileId: w.mcpProfileId,
        contextProfileSlug: w.contextProfileSlug,
        skills: w.skills || [],
        avatarIcon: w.avatarIcon || 'bot',
      }))
    );
    setSelectedTargetId('supervisor');
    setPublishSuccess(null);
  };

  // Toggle Skill for Supervisor
  const handleToggleSupervisorSkill = (skillId: string) => {
    setSupervisorSkills((prev) =>
      prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId]
    );
  };

  // Toggle Skill for a specific Worker
  const handleToggleWorkerSkill = (workerId: string, skillId: string) => {
    setWorkers((prev) =>
      prev.map((w) => {
        if (w.id !== workerId) return w;
        const hasSkill = w.skills.includes(skillId);
        return {
          ...w,
          skills: hasSkill ? w.skills.filter((id) => id !== skillId) : [...w.skills, skillId],
        };
      })
    );
  };

  // Bulk select all / deselect all skills for current target
  const handleBulkToggleCurrentTarget = (skillsToToggle: string[], selectAll: boolean) => {
    if (selectedTargetId === 'supervisor') {
      if (selectAll) {
        setSupervisorSkills((prev) => Array.from(new Set([...prev, ...skillsToToggle])));
      } else {
        setSupervisorSkills((prev) => prev.filter((id) => !skillsToToggle.includes(id)));
      }
    } else {
      setWorkers((prev) =>
        prev.map((w) => {
          if (w.id !== selectedTargetId) return w;
          const nextSkills = selectAll
            ? Array.from(new Set([...w.skills, ...skillsToToggle]))
            : w.skills.filter((id) => !skillsToToggle.includes(id));
          return { ...w, skills: nextSkills };
        })
      );
    }
  };

  // Publish Team Blueprint to Supabase
  const handlePublishBlueprint = async () => {
    setIsPublishing(true);
    setPublishSuccess(null);
    try {
      const payload = {
        name: teamName,
        supervisor_prompt: "You are the corporate front desk supervisor. Route caller identity verification and lead updates to the CRM Specialist first.",
        routing_strategy: routingStrategy,
        heartbeat_enabled: heartbeatEnabled,
        heartbeat_rate_minutes: heartbeatRateMinutes,
        heartbeat_goal: heartbeatGoal,
        workers: workers.map((w) => ({
          name: w.name,
          role: w.role,
          skills: w.skills,
          mcp_tools: w.skills,
          mcp_profile_id: w.mcpProfileId,
          context_profile_slug: w.contextProfileSlug,
          avatar_icon: w.avatarIcon,
        })),
      };

      const res = await fetch('/api/mcp/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setPublishSuccess(`Team Blueprint '${data.profile.name}' published to Postgres successfully!`);
        setRefreshTrigger((prev) => prev + 1);
      } else {
        const err = await res.json();
        alert(`Failed to publish team blueprint: ${err.error}`);
      }
    } catch (e: any) {
      alert(`Publish error: ${e.message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  // Spawn Fresh Thread Instance for this Team Blueprint
  const handleSpawnFreshSession = async (targetProfileId?: string) => {
    const profileIdToUse = targetProfileId || existingTeams[0]?.id || 'team_front_desk_automation';
    try {
      const res = await fetch('/api/v1/threads/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: profileIdToUse,
          tenant_id: tenantId,
          title: `Session with ${teamName}`,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSpawnedThreadId(data.thread_id);
        setRefreshTrigger((prev) => prev + 1);

        if (onLaunchThread) {
          onLaunchThread(profileIdToUse, data.thread_id);
        }
      }
    } catch (err) {
      console.error('Failed to spawn thread instance:', err);
    }
  };

  const supervisorMcpProfile = mcpProfilesList.find(
    (p) => p.id === supervisorMcpProfileId || p.slug === supervisorMcpProfileId
  );
  const supervisorContextProfile = contextProfilesList.find(
    (p) => p.slug === supervisorContextProfileSlug || p.id === supervisorContextProfileSlug
  );

  // Categories list for skills filter
  const skillCategories = Array.from(new Set(skillsCatalog.map((s) => s.category)));

  // Filtered skills list
  const filteredSkills = skillsCatalog.filter((skill) => {
    const matchesCategory = selectedCategoryFilter === 'all' || skill.category === selectedCategoryFilter;
    const matchesSearch =
      !skillSearchQuery.trim() ||
      skill.displayName.toLowerCase().includes(skillSearchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(skillSearchQuery.toLowerCase()) ||
      skill.id.toLowerCase().includes(skillSearchQuery.toLowerCase()) ||
      skill.spoke.toLowerCase().includes(skillSearchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Current active target object and assigned skills for Step 3
  const isSupervisorTarget = selectedTargetId === 'supervisor';
  const currentWorkerTarget = workers.find((w) => w.id === selectedTargetId) || workers[0];
  const currentTargetSkills = isSupervisorTarget
    ? supervisorSkills
    : currentWorkerTarget
    ? currentWorkerTarget.skills
    : [];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 font-sans">
      {/* Top Header & Architecture Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Agent Team Blueprint Builder
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Profiles & Skills Architecture: Assign MCP & Context Profiles in Steps 1–2, and configure Skill checkboxes across Supervisor and Workers in Step 3.
              </p>
            </div>
          </div>
        </div>

        {/* View Toggle / Active Threads counter */}
        <div className="flex items-center gap-3">
          <div className="flex items-center p-1 bg-zinc-900 border border-zinc-800 rounded-lg">
            <button
              onClick={() => setActiveView('builder')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                activeView === 'builder'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Blueprint Builder
            </button>
            <button
              onClick={() => setActiveView('instances')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                activeView === 'instances'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span>Deployed Blueprints</span>
              <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-zinc-800 text-emerald-400 font-mono">
                {existingTeams.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {activeView === 'instances' ? (
        /* INSTANCES / PUBLISHED TEAMS VIEW */
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider font-mono">
                Published Team Blueprints (PostgreSQL Profiles)
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Static multi-agent team designs stored in the database. Each blueprint can be instantiated into dynamic session threads.
              </p>
            </div>
            <button
              onClick={() => setActiveView('builder')}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Build New Team
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {existingTeams.map((team) => (
              <div
                key={team.id}
                className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-900/60">
                        {team.routingStrategy}
                      </span>
                      <h3 className="text-sm font-bold text-white mt-2">{team.name}</h3>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
                      <Users className="w-4 h-4 text-emerald-400" />
                    </div>
                  </div>

                  <div className="text-xs text-zinc-400 space-y-1.5 bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/80">
                    <div className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      Supervisor Profiles & Skills:
                    </div>
                    <div className="text-[11px] text-zinc-400 pl-4 space-y-0.5">
                      <div>MCP: <span className="text-white font-mono">{team.supervisorMcpProfileId || 'mcp-profile-sales'}</span></div>
                      <div>Context: <span className="text-emerald-400 font-mono">{team.supervisorContextProfileSlug || 'sales-agent'}</span></div>
                      <div>Skills: <span className="text-amber-400 font-mono">{team.supervisorSkills?.length || 0} assigned</span></div>
                    </div>
                  </div>

                  {/* Workers list */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-mono text-zinc-500 uppercase">
                      Workers Assigned ({team.workers.length})
                    </span>
                    <div className="space-y-1">
                      {team.workers.map((w) => (
                        <div
                          key={w.id}
                          className="flex items-center justify-between text-xs p-2 rounded-lg bg-zinc-950 border border-zinc-800/60"
                        >
                          <div className="flex items-center gap-2">
                            <Bot className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-zinc-200 font-medium">{w.name}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] font-mono">
                            <span className="text-amber-400 bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-800/40">
                              {(w.skills || w.mcpTools || []).length} skills
                            </span>
                            <span className="text-emerald-400 bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-800/40">
                              {w.mcpProfileId || 'default-mcp'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-zinc-500">
                    Created {new Date(team.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => handleSpawnFreshSession(team.id)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-900/20"
                  >
                    <Play className="w-3 h-3" />
                    Launch Thread
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Blueprint Multi-Step Builder */
        <div className="space-y-8">
          {/* Preset Quick Load Bar */}
          <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Load Pre-Configured Enterprise Templates:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {PRESET_TEMPLATES.map((tpl, i) => (
                <button
                  key={i}
                  onClick={() => handleLoadPreset(tpl)}
                  className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 transition-all flex items-center gap-1.5"
                >
                  <Zap className="w-3 h-3 text-emerald-400" />
                  {tpl.name.split(' ')[0]} {tpl.name.split(' ')[1]}
                </button>
              ))}
            </div>
          </div>

          {/* Stepper Navigation */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              { num: 1, title: 'Team Blueprint', desc: 'Name, Strategy & Supervisor Profiles' },
              { num: 2, title: 'Worker Factory', desc: 'Specialists & Profile Bindings' },
              { num: 3, title: 'Skills Assignment', desc: 'Capability Checkboxes (Supervisor & Workers)' },
              { num: 4, title: 'Publish & Spawn', desc: 'Commit to Postgres & Run' },
            ].map((step) => (
              <button
                key={step.num}
                onClick={() => setActiveStep(step.num)}
                className={`p-3.5 rounded-xl text-left border transition-all ${
                  activeStep === step.num
                    ? 'bg-zinc-900 border-emerald-500 shadow-md shadow-emerald-950/20'
                    : 'bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                      activeStep === step.num
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {step.num}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white leading-none">{step.title}</h4>
                    <p className="text-[10px] text-zinc-400 mt-1 leading-tight">{step.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* STEP 1: Team Blueprint & Supervisor Profiles */}
          {activeStep === 1 && (
            <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 space-y-6">
              <div className="border-b border-zinc-800 pb-4">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  Step 1: Configure Team Blueprint & Supervisor Profiles
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Define the team identity and assign dedicated MCP Server and Context Control profiles to the Supervisor node.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase font-mono text-zinc-400">
                    Team Blueprint Name
                  </label>
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="e.g. Front Desk Automation Team"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-sans"
                  />
                  <p className="text-[11px] text-zinc-500">
                    Saved in <code className="text-zinc-400">profiles.name</code> scoped under your tenant.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase font-mono text-zinc-400">
                    Routing Engine Strategy
                  </label>
                  <select
                    value={routingStrategy}
                    onChange={(e) => setRoutingStrategy(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-sans"
                  >
                    <option value="supervisor_router">Supervisor Directed Router (LangGraph Node)</option>
                    <option value="hierarchical">Hierarchical Delegator (Manager & Sub-agents)</option>
                    <option value="sequential">Sequential Pipeline (Step-by-step Triage)</option>
                  </select>
                  <p className="text-[11px] text-zinc-500">
                    Determines how the supervisor node orchestrates worker sub-graphs.
                  </p>
                </div>
              </div>

              {/* Supervisor Profiles Assignment */}
              <div className="p-5 rounded-xl bg-zinc-950/80 border border-zinc-800/80 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-semibold uppercase font-mono text-zinc-200">
                      Supervisor Profiles Assignment
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-900/60">
                    Supervisor Node
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Supervisor MCP Profile */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-cyan-400" />
                      MCP Server Profile (Supervisor)
                    </label>
                    <select
                      value={supervisorMcpProfileId}
                      onChange={(e) => setSupervisorMcpProfileId(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                    >
                      {mcpProfilesList.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.selectedToolNames?.length || 0} tools)
                        </option>
                      ))}
                    </select>
                    {supervisorMcpProfile && (
                      <p className="text-[11px] text-zinc-400">
                        {supervisorMcpProfile.description}
                      </p>
                    )}
                  </div>

                  {/* Supervisor Context Control Profile */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-emerald-400" />
                      Context Control Profile (Supervisor)
                    </label>
                    <select
                      value={supervisorContextProfileSlug}
                      onChange={(e) => setSupervisorContextProfileSlug(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                    >
                      {contextProfilesList.map((cp) => (
                        <option key={cp.id} value={cp.slug}>
                          {cp.name} (v{cp.version})
                        </option>
                      ))}
                    </select>
                    {supervisorContextProfile && (
                      <p className="text-[11px] text-zinc-400">
                        {supervisorContextProfile.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Architecture Note:</strong> The supervisor inherits governance, memory budgets, and authorized routing tools directly from these assigned profiles. In Step 3, you will configure specific skills using checkboxes.
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-zinc-800">
                <button
                  onClick={() => setActiveStep(2)}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-all shadow-md shadow-emerald-900/20"
                >
                  Proceed to Worker Factory
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Worker Factory */}
          {activeStep === 2 && (
            <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <div>
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <Bot className="w-4 h-4 text-emerald-400" />
                    Step 2: Worker Factory (Staff Members & Profile Assignment)
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Assemble specialized workers for this team and bind them to their respective MCP and Context Control profiles.
                  </p>
                </div>
                <button
                  onClick={handleAddWorker}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all border border-zinc-700"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  Add Specialist Worker
                </button>
              </div>

              {/* Workers Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {workers.map((worker, index) => {
                  return (
                    <div
                      key={worker.id}
                      className="p-4 rounded-xl border bg-zinc-950/60 border-zinc-800 hover:border-zinc-700 transition-all space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-emerald-950 border border-emerald-800/60 flex items-center justify-center text-emerald-400 font-bold text-xs">
                            {index + 1}
                          </div>
                          <span className="text-xs font-mono font-semibold text-white">
                            Worker #{index + 1}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {workers.length > 1 && (
                            <button
                              onClick={() => handleRemoveWorker(index)}
                              className="p-1 text-zinc-500 hover:text-red-400 rounded hover:bg-zinc-800 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="text-[11px] font-mono text-zinc-400 uppercase">Worker Name</label>
                          <input
                            type="text"
                            value={worker.name}
                            onChange={(e) => handleUpdateWorker(index, 'name', e.target.value)}
                            placeholder="e.g. CRM Specialist"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 mt-1"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-mono text-zinc-400 uppercase">Operational Role</label>
                          <input
                            type="text"
                            value={worker.role}
                            onChange={(e) => handleUpdateWorker(index, 'role', e.target.value)}
                            placeholder="e.g. Invoicing & Payment Specialist"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500 mt-1"
                          />
                        </div>

                        {/* Assigned Profiles Controls */}
                        <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                          <div>
                            <span className="text-[10px] font-mono text-zinc-400 uppercase flex items-center gap-1">
                              <Server className="w-3 h-3 text-cyan-400" />
                              Assigned MCP Server Profile:
                            </span>
                            <select
                              value={worker.mcpProfileId || mcpProfilesList[0]?.id}
                              onChange={(e) => handleUpdateWorker(index, 'mcpProfileId', e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-cyan-300 font-mono mt-1"
                            >
                              {mcpProfilesList.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.selectedToolNames?.length || 0} tools)
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <span className="text-[10px] font-mono text-zinc-400 uppercase flex items-center gap-1">
                              <Layers className="w-3 h-3 text-emerald-400" />
                              Assigned Context Control Profile:
                            </span>
                            <select
                              value={worker.contextProfileSlug || contextProfilesList[0]?.slug}
                              onChange={(e) => handleUpdateWorker(index, 'contextProfileSlug', e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-emerald-300 font-mono mt-1"
                            >
                              {contextProfilesList.map((cp) => (
                                <option key={cp.id} value={cp.slug}>
                                  {cp.name} (v{cp.version})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between pt-4 border-t border-zinc-800">
                <button
                  onClick={() => setActiveStep(1)}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 text-xs font-semibold rounded-lg hover:bg-zinc-700 transition-all"
                >
                  Back to Blueprint
                </button>
                <button
                  onClick={() => setActiveStep(3)}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-all shadow-md shadow-emerald-900/20"
                >
                  Proceed to Skills Assignment
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Skills Assignment (Checkboxes for Supervisor & Workers) */}
          {activeStep === 3 && (
            <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 space-y-6">
              <div className="border-b border-zinc-800 pb-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-white flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-emerald-400" />
                      Step 3: Skills Assignment (Supervisor & Workers Checkboxes)
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      Assign operational skills to the supervisor router and individual specialist workers using capability checkboxes.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400 font-mono">
                      Target:{' '}
                      <strong className="text-emerald-400">
                        {isSupervisorTarget ? 'Supervisor Router' : currentWorkerTarget?.name}
                      </strong>
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-300 text-[11px] font-mono">
                      {currentTargetSkills.length} selected
                    </span>
                  </div>
                </div>
              </div>

              {/* Target Selector Tabs: Supervisor & Workers */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase text-zinc-400">
                    Select Target Node to Assign Skills:
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        handleBulkToggleCurrentTarget(
                          filteredSkills.map((s) => s.id),
                          true
                        )
                      }
                      className="px-2.5 py-1 text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 flex items-center gap-1 transition-all"
                    >
                      <CheckSquare className="w-3 h-3 text-emerald-400" />
                      Select Filtered
                    </button>
                    <button
                      onClick={() =>
                        handleBulkToggleCurrentTarget(
                          filteredSkills.map((s) => s.id),
                          false
                        )
                      }
                      className="px-2.5 py-1 text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 flex items-center gap-1 transition-all"
                    >
                      <Square className="w-3 h-3 text-zinc-400" />
                      Clear Filtered
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {/* Supervisor Target Tab */}
                  <button
                    onClick={() => setSelectedTargetId('supervisor')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-all shrink-0 border ${
                      isSupervisorTarget
                        ? 'bg-emerald-950/80 border-emerald-500 text-white shadow-md shadow-emerald-950/40'
                        : 'bg-zinc-950/70 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
                    }`}
                  >
                    <ShieldCheck
                      className={`w-4 h-4 ${isSupervisorTarget ? 'text-emerald-400' : 'text-zinc-500'}`}
                    />
                    <div className="text-left">
                      <div className="leading-tight">Supervisor Router</div>
                      <div className="text-[10px] font-normal text-zinc-400 font-mono">
                        {supervisorSkills.length} skills active
                      </div>
                    </div>
                  </button>

                  {/* Worker Target Tabs */}
                  {workers.map((w, idx) => {
                    const isSelected = selectedTargetId === w.id;
                    return (
                      <button
                        key={w.id}
                        onClick={() => setSelectedTargetId(w.id)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-all shrink-0 border ${
                          isSelected
                            ? 'bg-emerald-950/80 border-emerald-500 text-white shadow-md shadow-emerald-950/40'
                            : 'bg-zinc-950/70 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
                        }`}
                      >
                        <Bot
                          className={`w-4 h-4 ${isSelected ? 'text-emerald-400' : 'text-zinc-500'}`}
                        />
                        <div className="text-left">
                          <div className="leading-tight">{w.name}</div>
                          <div className="text-[10px] font-normal text-zinc-400 font-mono">
                            Worker #{idx + 1} • {w.skills.length} skills
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Target Quick Context Banner */}
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  {isSupervisorTarget ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Bot className="w-4 h-4 text-emerald-400" />
                  )}
                  <span className="text-zinc-300">
                    Configuring skills for:{' '}
                    <strong className="text-white">
                      {isSupervisorTarget ? 'Supervisor Node' : `${currentWorkerTarget?.name} (${currentWorkerTarget?.role})`}
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-3 text-zinc-400 font-mono text-[11px]">
                  <span>
                    MCP Profile:{' '}
                    <strong className="text-cyan-400">
                      {isSupervisorTarget ? supervisorMcpProfileId : currentWorkerTarget?.mcpProfileId}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Context Profile:{' '}
                    <strong className="text-emerald-400">
                      {isSupervisorTarget ? supervisorContextProfileSlug : currentWorkerTarget?.contextProfileSlug}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={skillSearchQuery}
                    onChange={(e) => setSkillSearchQuery(e.target.value)}
                    placeholder="Search skills by name, spoke (e.g. hubspot, stripe, postgres), or description..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-sans"
                  />
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
                  <button
                    onClick={() => setSelectedCategoryFilter('all')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all shrink-0 ${
                      selectedCategoryFilter === 'all'
                        ? 'bg-zinc-800 text-white font-semibold'
                        : 'bg-zinc-950 text-zinc-400 hover:text-white'
                    }`}
                  >
                    All ({skillsCatalog.length})
                  </button>
                  {skillCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategoryFilter(cat)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all shrink-0 ${
                        selectedCategoryFilter === cat
                          ? 'bg-zinc-800 text-emerald-400 font-semibold border border-zinc-700'
                          : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800/80'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Skills Checkboxes Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredSkills.map((skill) => {
                  const isChecked = isSupervisorTarget
                    ? supervisorSkills.includes(skill.id)
                    : currentWorkerTarget
                    ? currentWorkerTarget.skills.includes(skill.id)
                    : false;

                  const spokeColor =
                    skill.spoke === 'hubspot'
                      ? 'text-orange-400 bg-orange-950/40 border-orange-900/60'
                      : skill.spoke === 'stripe'
                      ? 'text-indigo-400 bg-indigo-950/40 border-indigo-900/60'
                      : skill.spoke === 'postgres'
                      ? 'text-blue-400 bg-blue-950/40 border-blue-900/60'
                      : skill.spoke === 'slack'
                      ? 'text-purple-400 bg-purple-950/40 border-purple-900/60'
                      : skill.spoke === 'google_workspace'
                      ? 'text-red-400 bg-red-950/40 border-red-900/60'
                      : skill.spoke === 'notion'
                      ? 'text-zinc-300 bg-zinc-800/60 border-zinc-700/60'
                      : 'text-emerald-400 bg-emerald-950/40 border-emerald-900/60';

                  return (
                    <label
                      key={skill.id}
                      onClick={() => {
                        if (isSupervisorTarget) {
                          handleToggleSupervisorSkill(skill.id);
                        } else if (currentWorkerTarget) {
                          handleToggleWorkerSkill(currentWorkerTarget.id, skill.id);
                        }
                      }}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                        isChecked
                          ? 'bg-emerald-950/30 border-emerald-500/80 shadow-sm shadow-emerald-950/30'
                          : 'bg-zinc-950/70 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="pt-0.5 shrink-0">
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                            isChecked
                              ? 'bg-emerald-600 border-emerald-500 text-white'
                              : 'bg-zinc-900 border-zinc-700 text-transparent'
                          }`}
                        >
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      </div>

                      <div className="flex-1 space-y-1.5 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-xs font-semibold text-white truncate">
                            {skill.displayName}
                          </h4>
                          <span
                            className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border shrink-0 ${spokeColor}`}
                          >
                            {skill.spoke}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-snug line-clamp-2">
                          {skill.description}
                        </p>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[10px] font-mono text-zinc-500">{skill.id}</span>
                          <span className="text-[9px] font-mono text-emerald-400/80">
                            {skill.category}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {filteredSkills.length === 0 && (
                <div className="p-8 text-center border border-dashed border-zinc-800 rounded-xl text-zinc-500 text-xs">
                  No skills matched your search criteria or category filter.
                </div>
              )}

              {/* Skills Overview Matrix Table (Supervisor + All Workers) */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                  <span className="text-xs font-mono font-semibold uppercase text-zinc-300">
                    Assigned Skills Matrix Summary
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    Live Checkbox State
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* Supervisor Node Summary */}
                  <div
                    onClick={() => setSelectedTargetId('supervisor')}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      isSupervisorTarget
                        ? 'bg-zinc-900 border-emerald-500'
                        : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Supervisor</span>
                      </div>
                      <span className="text-[10px] font-mono text-amber-400">
                        {supervisorSkills.length} skills
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {supervisorSkills.length > 0 ? (
                        supervisorSkills.slice(0, 3).map((s) => (
                          <span
                            key={s}
                            className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700"
                          >
                            {s.split('.')[1] || s}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-zinc-500 italic">No skills assigned</span>
                      )}
                      {supervisorSkills.length > 3 && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-400">
                          +{supervisorSkills.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Workers Summaries */}
                  {workers.map((w, idx) => {
                    const isSelected = selectedTargetId === w.id;
                    return (
                      <div
                        key={w.id}
                        onClick={() => setSelectedTargetId(w.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-zinc-900 border-emerald-500'
                            : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                            <Bot className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="truncate">{w.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-amber-400">
                            {w.skills.length} skills
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {w.skills.length > 0 ? (
                            w.skills.slice(0, 3).map((s) => (
                              <span
                                key={s}
                                className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700"
                              >
                                {s.split('.')[1] || s}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-zinc-500 italic">No skills assigned</span>
                          )}
                          {w.skills.length > 3 && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-400">
                              +{w.skills.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-between pt-4 border-t border-zinc-800">
                <button
                  onClick={() => setActiveStep(2)}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 text-xs font-semibold rounded-lg hover:bg-zinc-700 transition-all"
                >
                  Back to Workers
                </button>
                <button
                  onClick={() => setActiveStep(4)}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-all shadow-md shadow-emerald-900/20"
                >
                  Review & Publish Blueprint
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Review, Publish to Supabase & Dynamic Thread Instance */}
          {activeStep === 4 && (
            <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 space-y-6">
              <div className="border-b border-zinc-800 pb-4">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Step 4: Blueprint Review & Supabase Commitment
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Verify the relational schema representation. Upon publishing, the blueprint is stored in <code className="text-emerald-400">profiles</code> and <code className="text-emerald-400">profile_workers</code> with assigned profiles and skill capabilities.
                </p>
              </div>

              {publishSuccess && (
                <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-600/50 text-emerald-300 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{publishSuccess}</span>
                  </div>
                  <button
                    onClick={() => handleSpawnFreshSession()}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Launch Interactive Session Now
                  </button>
                </div>
              )}

              {/* Proactive Heartbeat Config (Agent Toggle UI) */}
              <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-semibold text-white">Enable Proactive Heartbeat Scheduler</span>
                  </div>
                  <button
                    onClick={() => setHeartbeatEnabled(!heartbeatEnabled)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                      heartbeatEnabled ? 'bg-emerald-500' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        heartbeatEnabled ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                
                {heartbeatEnabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-zinc-800/80">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-zinc-400">Heartbeat Rate (Minutes)</label>
                      <input
                        type="number"
                        value={heartbeatRateMinutes}
                        onChange={(e) => setHeartbeatRateMinutes(parseInt(e.target.value) || 15)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                        min={1}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-zinc-400">Baseline Heartbeat Goal / Prompt</label>
                      <input
                        type="text"
                        value={heartbeatGoal}
                        onChange={(e) => setHeartbeatGoal(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                        placeholder="e.g. Check for open alerts and reply to emails"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Summary Card */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                  <span className="text-[11px] font-mono text-zinc-500 uppercase">Team Blueprint</span>
                  <h4 className="text-sm font-semibold text-white">{teamName}</h4>
                  <div className="text-xs text-zinc-400 space-y-1">
                    <div>MCP Profile: <span className="text-cyan-400 font-mono">{supervisorMcpProfileId}</span></div>
                    <div>Context Profile: <span className="text-emerald-400 font-mono">{supervisorContextProfileSlug}</span></div>
                    <div>Strategy: <span className="text-white font-mono">{routingStrategy}</span></div>
                    <div>Supervisor Skills: <span className="text-amber-400 font-mono">{supervisorSkills.length} assigned</span></div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                  <span className="text-[11px] font-mono text-zinc-500 uppercase">Staff Workers ({workers.length})</span>
                  <div className="space-y-1.5">
                    {workers.map((w) => (
                      <div key={w.id} className="text-xs text-zinc-300 flex items-center justify-between">
                        <span>{w.name}</span>
                        <div className="flex items-center gap-1 font-mono text-[10px]">
                          <span className="text-amber-400">{w.skills.length} skills</span>
                          <span className="text-zinc-600">•</span>
                          <span className="text-cyan-400">{w.mcpProfileId}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                  <span className="text-[11px] font-mono text-zinc-500 uppercase">Execution Model</span>
                  <div className="text-xs text-zinc-300 space-y-1">
                    <div>• <strong>Blueprints</strong>: Stored in Postgres</div>
                    <div>• <strong>Profiles</strong>: Assigned in Steps 1 & 2</div>
                    <div>• <strong>Skills</strong>: Checkbox Assigned in Step 3</div>
                    <div>• <strong>Instances</strong>: Dynamic LangGraph Threads</div>
                  </div>
                </div>
              </div>

              {/* Schema JSON Payload */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase text-zinc-400">
                    Relational Blueprint Payload (Supabase Schema Compliant)
                  </span>
                  <span className="text-[10px] font-mono text-cyan-400">
                    INSERT INTO profiles & profile_workers
                  </span>
                </div>
                <pre className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-xs text-emerald-400 overflow-x-auto max-h-56">
                  {JSON.stringify(
                    {
                      profile: {
                        name: teamName,
                        tenant_id: tenantId,
                        supervisor_mcp_profile_id: supervisorMcpProfileId,
                        supervisor_context_profile_slug: supervisorContextProfileSlug,
                        supervisor_skills: supervisorSkills,
                        routing_strategy: routingStrategy,
                      },
                      workers: workers.map((w) => ({
                        name: w.name,
                        role: w.role,
                        skills: w.skills,
                        mcp_profile_id: w.mcpProfileId,
                        context_profile_slug: w.contextProfileSlug,
                      })),
                    },
                    null,
                    2
                  )}
                </pre>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                <button
                  onClick={() => setActiveStep(3)}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 text-xs font-semibold rounded-lg hover:bg-zinc-700 transition-all"
                >
                  Back to Skills Assignment
                </button>
                <div className="flex items-center gap-3">
                  <button
                    disabled={isPublishing}
                    onClick={handlePublishBlueprint}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-all shadow-md shadow-emerald-900/30"
                  >
                    {isPublishing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Committing to Supabase...
                      </>
                    ) : (
                      <>
                        <Database className="w-4 h-4" />
                        Publish Team Blueprint to Postgres
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
