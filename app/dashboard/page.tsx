'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { Sidebar } from '@/components/Sidebar';
import { ProfilesView } from '@/components/ProfilesView';
import { ContextBuilder } from '@/components/ContextBuilder';
import { SourcesView } from '@/components/SourcesView';
import { EndpointsView } from '@/components/EndpointsView';
import { ApiKeysView } from '@/components/ApiKeysView';
import { LogsView } from '@/components/LogsView';
import { SdkIntegrationsView } from '@/components/SdkIntegrationsView';
import { SettingsView } from '@/components/SettingsView';
import { McpHubView } from '@/components/McpHubView';
import { LibraryView } from '@/components/LibraryView';
import { AgentSessionStudio } from '@/components/AgentSessionStudio';
import { AgentTeamBuilder } from '@/components/AgentTeamBuilder';
import { TaskCalendarView } from '@/components/TaskCalendarView';
import { SupervisorBoardView } from '@/components/SupervisorBoardView';
import { Conversations } from '@/components/Conversations';
import { SimulatorView } from '@/components/SimulatorView';
import { PlatformMcpServerView } from '@/components/PlatformMcpServerView';
import { GeminiTestModal } from '@/components/GeminiTestModal';
import { CreateProfileModal } from '@/components/CreateProfileModal';
import { AccountSettingsView } from '@/components/AccountSettingsView';
import { FunctionStudio } from '@/components/FunctionStudio';
import { DemoBanner } from '@/components/DemoBanner';
import { INITIAL_PROFILES, INITIAL_SOURCES, isDemoMode } from '@/lib/demo';
import { ContextProfile, ContextSource } from '@/lib/types';

// Sample workspace content is only shown in demo mode; real accounts start empty.
const DEMO = isDemoMode();

export default function DashboardPage() {
  const [profiles, setProfiles] = useState<ContextProfile[]>(DEMO ? INITIAL_PROFILES : []);
  const [sources, setSources] = useState<ContextSource[]>(DEMO ? INITIAL_SOURCES : []);
  const [skillsCount, setSkillsCount] = useState<number>(5);
  const [activeTab, setActiveTab] = useState<string>('profiles');
  const [selectedProfile, setSelectedProfile] = useState<ContextProfile | null>(profiles[0] ?? null);
  const [studioProfileId, setStudioProfileId] = useState<string | undefined>(undefined);
  const [studioThreadId, setStudioThreadId] = useState<string | undefined>(undefined);

  // Modal states
  const [isGeminiModalOpen, setIsGeminiModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [testGeminiContext, setTestGeminiContext] = useState('');
  const [testGeminiQuery, setTestGeminiQuery] = useState('');

  const handleSelectProfile = (profile: ContextProfile) => {
    setSelectedProfile(profile);
    setActiveTab('builder');
  };

  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Real accounts load their persisted context profiles; demo mode keeps the local seed.
  useEffect(() => {
    if (DEMO) return;
    fetch('/api/v1/context-profiles', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: { profiles: ContextProfile[] }) => {
        setProfiles(data.profiles);
        setSelectedProfile((current) => current ?? data.profiles[0] ?? null);
      })
      .catch(() => setProfileSaveError('Could not load context profiles.'));
  }, []);

  const handleUpdateProfile = (updated: ContextProfile) => {
    setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setSelectedProfile(updated);
    if (DEMO) return;
    // ContextBuilder reports every edit; save once typing pauses.
    const timers = saveTimers.current;
    clearTimeout(timers.get(updated.id));
    timers.set(
      updated.id,
      setTimeout(async () => {
        timers.delete(updated.id);
        const res = await fetch(`/api/v1/context-profiles/${updated.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        }).catch(() => null);
        setProfileSaveError(res?.ok ? null : 'Could not save context profile changes.');
      }, 800)
    );
  };

  const handleCreateProfile = async (newProfile: ContextProfile) => {
    if (DEMO) {
      setProfiles([newProfile, ...profiles]);
      setSelectedProfile(newProfile);
      setActiveTab('builder');
      return;
    }
    const res = await fetch('/api/v1/context-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProfile),
    }).catch(() => null);
    const data = res?.ok ? await res.json() : null;
    if (!data?.profile) {
      const err = res ? await res.json().catch(() => ({})) : {};
      setProfileSaveError(err.error || 'Could not create context profile.');
      return;
    }
    setProfileSaveError(null);
    setProfiles((prev) => [data.profile, ...prev]);
    setSelectedProfile(data.profile);
    setActiveTab('builder');
  };

  const handleQuickResolve = (profile: ContextProfile) => {
    setSelectedProfile(profile);
    setActiveTab('simulator');
  };

  const handleTestLLM = (compiledMarkdown: string, queryText: string) => {
    setTestGeminiContext(compiledMarkdown);
    setTestGeminiQuery(queryText);
    setIsGeminiModalOpen(true);
  };

  const handleLaunchThread = (profileId: string, threadId: string) => {
    setStudioProfileId(profileId);
    setStudioThreadId(threadId);
    setActiveTab('session-studio');
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-zinc-100 flex flex-col font-sans selection:bg-emerald-900 selection:text-emerald-200">
      <DemoBanner />
      {/* Top Universal Navbar */}
      <Navbar

        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSimulator={() => setActiveTab('simulator')}
        onOpenNewProfile={() => setIsCreateModalOpen(true)}
      />

      {/* Main Layout Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Developer Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={(tab) => setActiveTab(tab)}
          profilesCount={profiles.length}
          sourcesCount={sources.length}
          skillsCount={skillsCount}
        />

        {/* Content Container */}
        <main className="flex-1 overflow-y-auto bg-[#090b10]">
          {profileSaveError && (activeTab === 'profiles' || activeTab === 'builder') && (
            <div className="mx-8 mt-4 px-3 py-2 rounded-lg bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300">
              {profileSaveError}
            </div>
          )}
          {activeTab === 'session-studio' && (
            <AgentSessionStudio
              initialProfileId={studioProfileId}
              initialThreadId={studioThreadId}
            />
          )}

          {activeTab === 'team-builder' && (
            <AgentTeamBuilder onLaunchThread={handleLaunchThread} />
          )}

          {activeTab === 'calendar' && (
            <TaskCalendarView onNavigateToStudio={() => setActiveTab('session-studio')} />
          )}

          {activeTab === 'board' && (
            <SupervisorBoardView />
          )}

          {activeTab === 'account' && (
            <AccountSettingsView />
          )}

          {activeTab === 'function-studio' && (
            <FunctionStudio />
          )}

          {activeTab === 'conversations' && (
            <Conversations
              onSelectThreadForStudio={(threadId, profileId) =>
                handleLaunchThread(profileId || 'devops_auditor_persona', threadId)
              }
              onOpenTeamBuilder={() => setActiveTab('team-builder')}
            />
          )}

          {activeTab === 'profiles' && (
            <ProfilesView
              profiles={profiles}
              onSelectProfile={handleSelectProfile}
              onOpenCreate={() => setIsCreateModalOpen(true)}
              onQuickResolve={handleQuickResolve}
            />
          )}

          {activeTab === 'builder' && selectedProfile && (
            <ContextBuilder
              profile={selectedProfile}
              onBack={() => setActiveTab('profiles')}
              onUpdateProfile={handleUpdateProfile}
              onPublishVersion={(updated) => handleUpdateProfile(updated)}
              onTestLLM={handleTestLLM}
            />
          )}

          {activeTab === 'mcp-hub' && (
            <McpHubView onOpenPlatformMcp={() => setActiveTab('platform-mcp')} />
          )}

          {activeTab === 'library' && (
            <LibraryView
              onSkillCountChange={(count) => setSkillsCount(count)}
              onOpenSimulatorWithSkill={(skillPrompt) => {
                setTestGeminiContext(skillPrompt);
                setActiveTab('simulator');
              }}
            />
          )}

          {activeTab === 'simulator' && (
            <SimulatorView
              profiles={profiles}
              initialProfile={selectedProfile || undefined}
              onOpenTeamBuilder={() => setActiveTab('team-builder')}
              onOpenCalendar={() => setActiveTab('calendar')}
            />
          )}

          {activeTab === 'platform-mcp' && (
            <PlatformMcpServerView
              onOpenTeamBuilder={() => setActiveTab('team-builder')}
              onOpenCalendar={() => setActiveTab('calendar')}
            />
          )}

          {activeTab === 'sources' && <SourcesView sources={sources} />}

          {activeTab === 'endpoints' && <EndpointsView />}

          {activeTab === 'api-keys' && <ApiKeysView />}

          {activeTab === 'logs' && <LogsView />}

          {activeTab === 'sdk-docs' && <SdkIntegrationsView profiles={profiles} />}

          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* Live Gemini LLM Test Modal */}
      <GeminiTestModal
        isOpen={isGeminiModalOpen}
        onClose={() => setIsGeminiModalOpen(false)}
        compiledContext={testGeminiContext}
        defaultQuery={testGeminiQuery}
      />

      {/* Create Profile Modal */}
      <CreateProfileModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateProfile}
      />
    </div>
  );
}
