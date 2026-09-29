'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BookOpen,
  UploadCloud,
  Plus,
  Search,
  Check,
  Copy,
  Trash2,
  Star,
  Download,
  Shield,
  Code2,
  Database,
  Brain,
  Sparkles,
  Layers,
  Building2,
  SlidersHorizontal,
  Terminal,
  CheckCircle2,
  User,
  Tag,
  AlertCircle,
  FileText,
  X,
  Zap,
  ArrowRight,
} from 'lucide-react';
import { SkillItem, SkillCategory, SkillSource } from '@/Backend/legacy_ts_mocks/types';

interface LibraryViewProps {
  onOpenSimulatorWithSkill?: (skillPrompt: string) => void;
  onSkillCountChange?: (count: number) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  onOpenSimulatorWithSkill,
  onSkillCountChange,
}) => {
  // State
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [stats, setStats] = useState({
    totalSkills: 0,
    inLibraryCount: 0,
    platformCount: 0,
    communityCount: 0,
    customCount: 0,
    totalTokensInLibrary: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'library' | 'platform' | 'community' | 'all'>('library');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'recommended' | 'rating' | 'tokens' | 'name'>('recommended');

  // Modal states
  const [inspectingSkill, setInspectingSkill] = useState<SkillItem | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // File upload state
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFileContent, setUploadedFileContent] = useState<string>('');
  const [parsedPreview, setParsedPreview] = useState<any>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Manual create form state
  const [newSkillForm, setNewSkillForm] = useState({
    name: '',
    category: 'agentic' as SkillCategory,
    description: '',
    systemPromptAddendum: '',
    tags: '',
    version: '1.0.0',
    requiredTools: '',
  });

  // Fetch skills from API
  const refreshSkills = async () => {
    try {
      const res = await fetch('/api/skills');
      if (res.ok) {
        const data = await res.json();
        setSkills(data.skills || []);
        if (data.stats) {
          setStats(data.stats);
          onSkillCountChange?.(data.stats.inLibraryCount);
        }
      }
    } catch (err) {
      console.error('Failed to fetch skills:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const res = await fetch('/api/skills');
        if (res.ok && isMounted) {
          const data = await res.json();
          setSkills(data.skills || []);
          if (data.stats) {
            setStats(data.stats);
            onSkillCountChange?.(data.stats.inLibraryCount);
          }
        }
      } catch (err) {
        console.error('Failed to fetch skills:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [onSkillCountChange]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  // Add / Remove / Toggle Actions
  const handleAddToLibrary = async (skillId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-to-library', id: skillId }),
      });
      if (res.ok) {
        const data = await res.json();
        setSkills((prev) => prev.map((s) => (s.id === skillId ? { ...s, isInLibrary: true, isEnabled: true } : s)));
        if (data.stats) {
          setStats(data.stats);
          onSkillCountChange?.(data.stats.inLibraryCount);
        }
        showToast('Skill added to your Library!');
        if (inspectingSkill && inspectingSkill.id === skillId) {
          setInspectingSkill((prev) => (prev ? { ...prev, isInLibrary: true, isEnabled: true } : null));
        }
      }
    } catch {
      showToast('Failed to add skill', 'error');
    }
  };

  const handleRemoveFromLibrary = async (skillId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove-from-library', id: skillId }),
      });
      if (res.ok) {
        const data = await res.json();
        setSkills((prev) => prev.map((s) => (s.id === skillId ? { ...s, isInLibrary: false, isEnabled: false } : s)));
        if (data.stats) {
          setStats(data.stats);
          onSkillCountChange?.(data.stats.inLibraryCount);
        }
        showToast('Skill removed from Library.');
        if (inspectingSkill && inspectingSkill.id === skillId) {
          setInspectingSkill((prev) => (prev ? { ...prev, isInLibrary: false, isEnabled: false } : null));
        }
      }
    } catch {
      showToast('Failed to remove skill', 'error');
    }
  };

  const handleToggleEnable = async (skillId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle-enable', id: skillId }),
      });
      if (res.ok) {
        setSkills((prev) =>
          prev.map((s) => (s.id === skillId ? { ...s, isEnabled: !s.isEnabled } : s))
        );
      }
    } catch {
      showToast('Failed to toggle skill', 'error');
    }
  };

  const handleDeleteCustomSkill = async (skillId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm('Are you sure you want to permanently delete this custom skill?')) return;
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: skillId }),
      });
      if (res.ok) {
        const data = await res.json();
        setSkills((prev) => prev.filter((s) => s.id !== skillId));
        if (data.stats) {
          setStats(data.stats);
          onSkillCountChange?.(data.stats.inLibraryCount);
        }
        if (inspectingSkill?.id === skillId) setInspectingSkill(null);
        showToast('Custom skill deleted.');
      }
    } catch {
      showToast('Failed to delete skill', 'error');
    }
  };

  const handleCopyPrompt = (text: string, id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    showToast('Prompt directives copied to clipboard!');
  };

  // Upload handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setUploadError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setUploadedFileContent(content);

      try {
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(content);
          if (!parsed.name) throw new Error('Missing "name" field in JSON');
          setParsedPreview({
            name: parsed.name,
            category: parsed.category || 'agentic',
            description: parsed.description || 'Imported JSON skill',
            tokenEstimate: Math.max(40, Math.round((parsed.systemPromptAddendum || parsed.prompt || '').length / 4)),
            systemPromptAddendum: parsed.systemPromptAddendum || parsed.prompt || '',
            tags: parsed.tags || ['custom', 'imported'],
          });
        } else {
          // Markdown or text
          const lines = content.split('\n');
          const firstHeader = lines.find((l) => l.startsWith('# '));
          const name = firstHeader ? firstHeader.replace('# ', '').trim() : file.name.replace(/\.[^/.]+$/, '');
          setParsedPreview({
            name,
            category: 'agentic',
            description: 'Imported agent capability from Markdown',
            tokenEstimate: Math.max(40, Math.round(content.length / 4)),
            systemPromptAddendum: content.trim(),
            tags: ['custom', 'markdown-import'],
          });
        }
      } catch (err: any) {
        setUploadError(`Failed to parse file: ${err.message}`);
        setParsedPreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmUpload = async () => {
    if (!uploadedFileContent) return;
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload', manifest: uploadedFileContent }),
      });
      if (res.ok) {
        const data = await res.json();
        setSkills((prev) => [data.skill, ...prev]);
        if (data.stats) {
          setStats(data.stats);
          onSkillCountChange?.(data.stats.inLibraryCount);
        }
        setIsUploadModalOpen(false);
        setUploadedFileName(null);
        setUploadedFileContent('');
        setParsedPreview(null);
        showToast(`Skill "${data.skill.name}" successfully added to your Library!`);
      } else {
        const err = await res.json();
        setUploadError(err.error || 'Upload failed');
      }
    } catch (err: any) {
      setUploadError(err.message || 'Network error');
    }
  };

  // Manual create form submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillForm.name.trim() || !newSkillForm.systemPromptAddendum.trim()) {
      alert('Skill Name and System Prompt Instructions are required.');
      return;
    }

    try {
      const tagsArray = newSkillForm.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const toolsArray = newSkillForm.requiredTools
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          data: {
            name: newSkillForm.name,
            category: newSkillForm.category,
            description: newSkillForm.description || 'Custom crafted skill',
            systemPromptAddendum: newSkillForm.systemPromptAddendum,
            version: newSkillForm.version || '1.0.0',
            tags: tagsArray.length > 0 ? tagsArray : ['custom'],
            requiredTools: toolsArray,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSkills((prev) => [data.skill, ...prev]);
        if (data.stats) {
          setStats(data.stats);
          onSkillCountChange?.(data.stats.inLibraryCount);
        }
        setIsCreateModalOpen(false);
        setNewSkillForm({
          name: '',
          category: 'agentic',
          description: '',
          systemPromptAddendum: '',
          tags: '',
          version: '1.0.0',
          requiredTools: '',
        });
        showToast(`Created "${data.skill.name}" and added to Library!`);
      }
    } catch {
      showToast('Error creating custom skill', 'error');
    }
  };

  // Filter & Sort
  const filteredSkills = useMemo(() => {
    let list = skills;

    // Filter by tab
    if (activeTab === 'library') {
      list = list.filter((s) => s.isInLibrary);
    } else if (activeTab === 'platform') {
      list = list.filter((s) => s.source === 'platform');
    } else if (activeTab === 'community') {
      list = list.filter((s) => s.source === 'community');
    }

    // Filter by category
    if (selectedCategory !== 'all') {
      list = list.filter((s) => s.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)) ||
          s.author?.name.toLowerCase().includes(q)
      );
    }

    // Sort
    const sorted = [...list];
    if (sortBy === 'rating') {
      sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortBy === 'tokens') {
      sorted.sort((a, b) => a.tokenEstimate - b.tokenEstimate);
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // recommended: platform first, then inLibrary, then stars
      sorted.sort((a, b) => {
        if (a.isInLibrary && !b.isInLibrary) return -1;
        if (!a.isInLibrary && b.isInLibrary) return 1;
        if (a.source === 'platform' && b.source !== 'platform') return -1;
        if (a.source !== 'platform' && b.source === 'platform') return 1;
        return (b.stars || 0) - (a.stars || 0);
      });
    }

    return sorted;
  }, [skills, activeTab, selectedCategory, searchQuery, sortBy]);

  // Category Icon helper
  const getCategoryIcon = (category: SkillCategory) => {
    switch (category) {
      case 'reasoning':
        return <Brain className="w-4 h-4 text-purple-400" />;
      case 'coding':
        return <Code2 className="w-4 h-4 text-blue-400" />;
      case 'security':
        return <Shield className="w-4 h-4 text-rose-400" />;
      case 'data':
        return <Database className="w-4 h-4 text-amber-400" />;
      case 'enterprise':
        return <Building2 className="w-4 h-4 text-indigo-400" />;
      case 'context':
        return <Layers className="w-4 h-4 text-emerald-400" />;
      case 'productivity':
        return <Zap className="w-4 h-4 text-yellow-400" />;
      case 'agentic':
      default:
        return <Sparkles className="w-4 h-4 text-teal-400" />;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg border shadow-xl flex items-center gap-2.5 text-xs font-medium animate-in slide-in-from-bottom-2 ${
            notification.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-700/80 shadow-emerald-950/40'
              : 'bg-rose-950/90 text-rose-200 border-rose-700/80 shadow-rose-950/40'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">Skills Library</h1>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
              Modular Agent Directives
            </span>
          </div>
          <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
            Upload custom skill manifests, discover official platform standards, or install verified community skills to modularize your agent logic and MCP servers.
          </p>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-all border border-zinc-700 hover:border-zinc-600 shadow-sm"
          >
            <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
            <span>Upload Skill</span>
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all shadow-sm shadow-emerald-950/50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Skill</span>
          </button>
        </div>
      </div>

      {/* Key Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Stat 1: My Library */}
        <div
          onClick={() => setActiveTab('library')}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            activeTab === 'library'
              ? 'bg-zinc-800/80 border-emerald-600/60 shadow-sm'
              : 'bg-[#0d1016] border-zinc-800/80 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium">My Active Library</span>
            <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">{stats.inLibraryCount}</span>
            <span className="text-[11px] text-zinc-500">skills installed</span>
          </div>
          <div className="mt-2 text-[10px] text-emerald-400 font-mono flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
            Active in Agent Context
          </div>
        </div>

        {/* Stat 2: Platform Standards */}
        <div
          onClick={() => setActiveTab('platform')}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            activeTab === 'platform'
              ? 'bg-zinc-800/80 border-emerald-600/60 shadow-sm'
              : 'bg-[#0d1016] border-zinc-800/80 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium">Platform Official</span>
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">{stats.platformCount}</span>
            <span className="text-[11px] text-zinc-500">verified skills</span>
          </div>
          <div className="mt-2 text-[10px] text-zinc-400 font-mono">
            Deterministic & Benchmarked
          </div>
        </div>

        {/* Stat 3: Community Hub */}
        <div
          onClick={() => setActiveTab('community')}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            activeTab === 'community'
              ? 'bg-zinc-800/80 border-indigo-600/60 shadow-sm'
              : 'bg-[#0d1016] border-zinc-800/80 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium">Community Hub</span>
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">{stats.communityCount}</span>
            <span className="text-[11px] text-zinc-500">contributions</span>
          </div>
          <div className="mt-2 text-[10px] text-indigo-400 font-mono">
            Open-Source Ecosystem
          </div>
        </div>

        {/* Stat 4: Token Budget Footprint */}
        <div className="p-4 rounded-xl border border-zinc-800/80 bg-[#0d1016]">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium">Library Token Footprint</span>
            <Terminal className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">
              ~{stats.totalTokensInLibrary.toLocaleString()}
            </span>
            <span className="text-[11px] text-zinc-500">tokens</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.round((stats.totalTokensInLibrary / 8000) * 100))}%`,
                }}
              />
            </div>
            <span className="text-[10px] font-mono text-zinc-500">
              {Math.round((stats.totalTokensInLibrary / 8000) * 100)}% of 8k
            </span>
          </div>
        </div>
      </div>

      {/* Main Tab Controls & Search Bar */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/70 pb-3">
          {/* Main Navigation Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('library')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'library'
                  ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
              <span>My Library</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-700 text-zinc-300">
                {stats.inLibraryCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('platform')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'platform'
                  ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Platform Standards</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-700 text-zinc-300">
                {stats.platformCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('community')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'community'
                  ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Community Hub</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-700 text-zinc-300">
                {stats.communityCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('all')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'all'
                  ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <span>All Skills</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-700 text-zinc-300">
                {skills.length}
              </span>
            </button>
          </div>

          {/* Right search and sort */}
          <div className="flex items-center gap-2.5">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search skills, tags, or authors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-56 md:w-64 pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 outline-none transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Sort Select */}
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5">
              <SlidersHorizontal className="w-3 h-3 text-zinc-400" />
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="bg-transparent text-xs text-zinc-300 outline-none font-medium cursor-pointer"
              >
                <option value="recommended" className="bg-zinc-900 text-zinc-300">
                  Recommended
                </option>
                <option value="rating" className="bg-zinc-900 text-zinc-300">
                  Highest Rated
                </option>
                <option value="tokens" className="bg-zinc-900 text-zinc-300">
                  Lowest Token Cost
                </option>
                <option value="name" className="bg-zinc-900 text-zinc-300">
                  Name (A-Z)
                </option>
              </select>
            </div>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          {[
            { id: 'all', label: 'All Categories' },
            { id: 'reasoning', label: 'Reasoning & Logic' },
            { id: 'context', label: 'Context & Tokens' },
            { id: 'coding', label: 'Coding & Architecture' },
            { id: 'security', label: 'Security & Guardrails' },
            { id: 'data', label: 'Database & SQL' },
            { id: 'enterprise', label: 'Enterprise & CRM' },
            { id: 'agentic', label: 'Agentic & Loops' },
            { id: 'productivity', label: 'Productivity' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all ${
                selectedCategory === cat.id
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/80 font-semibold'
                  : 'bg-zinc-900/80 text-zinc-400 border border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Skills Grid */}
      {isLoading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-3 text-zinc-500">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-mono">Loading skill manifests...</span>
        </div>
      ) : filteredSkills.length === 0 ? (
        <div className="h-64 rounded-xl border border-dashed border-zinc-800 flex flex-col items-center justify-center gap-3 text-zinc-500 p-6 text-center">
          <BookOpen className="w-8 h-8 text-zinc-600" />
          <div>
            <h4 className="text-sm font-semibold text-zinc-300">No skills match your filters</h4>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm">
              {activeTab === 'library'
                ? "You haven't added any skills to your library yet. Browse Platform Standards or Community Hub to install capabilities."
                : 'Try adjusting your search terms or category selection.'}
            </p>
          </div>
          {activeTab === 'library' && (
            <button
              onClick={() => setActiveTab('platform')}
              className="mt-2 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all"
            >
              Browse Platform Skills
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSkills.map((skill) => {
            const isInstalled = skill.isInLibrary;

            return (
              <div
                key={skill.id}
                onClick={() => setInspectingSkill(skill)}
                className={`group relative rounded-xl border bg-[#0d1016] p-5 flex flex-col justify-between transition-all hover:border-zinc-700 hover:shadow-lg cursor-pointer ${
                  isInstalled ? 'border-zinc-800 ring-1 ring-emerald-500/20' : 'border-zinc-850'
                }`}
              >
                {/* Top Badge & Source Row */}
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                        {getCategoryIcon(skill.category)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors line-clamp-1">
                            {skill.name}
                          </h3>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono mt-0.5">
                          <span>v{skill.version}</span>
                          <span>•</span>
                          <span className="capitalize">{skill.category}</span>
                        </div>
                      </div>
                    </div>

                    {/* Source Badge */}
                    <div>
                      {skill.source === 'platform' && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-semibold flex items-center gap-1">
                          <Shield className="w-2.5 h-2.5" />
                          Platform
                        </span>
                      )}
                      {skill.source === 'community' && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-400 border border-indigo-800/60 font-semibold flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          Community
                        </span>
                      )}
                      {skill.source === 'custom' && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/60 font-semibold flex items-center gap-1">
                          <User className="w-2.5 h-2.5" />
                          Custom
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2 mb-3">
                    {skill.description}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 mb-4">
                    {skill.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800"
                      >
                        #{tag}
                      </span>
                    ))}
                    {skill.tags.length > 3 && (
                      <span className="text-[10px] font-mono text-zinc-500">
                        +{skill.tags.length - 3}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Footer: Metadata & Action Row */}
                <div className="pt-3 border-t border-zinc-850/80 flex items-center justify-between text-xs gap-2">
                  <div className="flex items-center gap-3 text-zinc-500 text-[11px] font-mono">
                    <span className="flex items-center gap-1 text-zinc-400" title="Estimated system prompt token overhead">
                      <Terminal className="w-3 h-3 text-emerald-400" />
                      ~{skill.tokenEstimate} tok
                    </span>

                    {skill.rating && (
                      <span className="flex items-center gap-1 text-amber-400/90">
                        <Star className="w-3 h-3 fill-amber-400" />
                        {skill.rating.toFixed(1)}
                      </span>
                    )}
                  </div>

                  {/* Action Button */}
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {isInstalled ? (
                      <button
                        onClick={(e) => handleRemoveFromLibrary(skill.id, e)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-700/80 text-[11px] font-semibold hover:bg-rose-950 hover:text-rose-300 hover:border-rose-700/80 transition-colors group/btn"
                        title="Click to remove from library"
                      >
                        <Check className="w-3 h-3 group-hover/btn:hidden text-emerald-400" />
                        <X className="w-3 h-3 hidden group-hover/btn:inline text-rose-400" />
                        <span className="group-hover/btn:hidden">In Library</span>
                        <span className="hidden group-hover/btn:inline">Remove</span>
                      </button>
                    ) : (
                      <button
                        onClick={(e) => handleAddToLibrary(skill.id, e)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-emerald-600 text-zinc-300 hover:text-white border border-zinc-700 text-[11px] font-semibold transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add to Library</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: INSPECT SKILL MODAL                                              */}
      {/* ========================================================================= */}
      {inspectingSkill && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e1117] border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-zinc-800 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                  {getCategoryIcon(inspectingSkill.category)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white">{inspectingSkill.name}</h2>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                      v{inspectingSkill.version}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
                    <span>By {inspectingSkill.author?.name || 'Workspace'}</span>
                    <span>•</span>
                    <span className="capitalize">{inspectingSkill.category}</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-mono">~{inspectingSkill.tokenEstimate} tokens</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setInspectingSkill(null)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {/* Description */}
              <div>
                <h4 className="text-[11px] font-semibold text-zinc-300 uppercase font-mono mb-1.5">
                  Overview
                </h4>
                <p className="text-zinc-300 leading-relaxed text-sm">
                  {inspectingSkill.description}
                </p>
              </div>

              {/* Required MCP Tools if any */}
              {inspectingSkill.requiredTools && inspectingSkill.requiredTools.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-semibold text-zinc-300 uppercase font-mono mb-1.5">
                    Recommended / Required MCP Tools
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {inspectingSkill.requiredTools.map((tool) => (
                      <span
                        key={tool}
                        className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-[11px]"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* System Prompt Addendum Directives */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[11px] font-semibold text-zinc-300 uppercase font-mono">
                    System Prompt Addendum Directives
                  </h4>
                  <button
                    onClick={(e) =>
                      handleCopyPrompt(inspectingSkill.systemPromptAddendum, inspectingSkill.id, e)
                    }
                    className="flex items-center gap-1.5 text-zinc-400 hover:text-emerald-400 text-xs transition-colors"
                  >
                    {copiedId === inspectingSkill.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedId === inspectingSkill.id ? 'Copied!' : 'Copy Directives'}</span>
                  </button>
                </div>
                <div className="p-4 rounded-xl bg-black/60 border border-zinc-800 font-mono text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                  {inspectingSkill.systemPromptAddendum}
                </div>
              </div>

              {/* LLM Compatibility */}
              {inspectingSkill.compatibility && (
                <div>
                  <h4 className="text-[11px] font-semibold text-zinc-300 uppercase font-mono mb-1.5">
                    Model Compatibility
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {inspectingSkill.compatibility.map((model) => (
                      <span
                        key={model}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300"
                      >
                        {model}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-800 bg-[#07090e] flex items-center justify-between">
              {inspectingSkill.source === 'custom' ? (
                <button
                  onClick={(e) => handleDeleteCustomSkill(inspectingSkill.id, e)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/80 text-xs font-semibold transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Custom Skill</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                {inspectingSkill.isInLibrary ? (
                  <button
                    onClick={(e) => handleRemoveFromLibrary(inspectingSkill.id, e)}
                    className="px-4 py-2 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800 text-xs font-semibold transition-colors"
                  >
                    Remove from Library
                  </button>
                ) : (
                  <button
                    onClick={(e) => handleAddToLibrary(inspectingSkill.id, e)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add to Library</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: UPLOAD SKILL MANIFEST MODAL                                      */}
      {/* ========================================================================= */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e1117] border border-zinc-800 rounded-2xl w-full max-w-xl overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <UploadCloud className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Upload Agent Skill</h3>
                  <p className="text-xs text-zinc-400">
                    Import standard JSON or Markdown skill definitions
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setUploadedFileName(null);
                  setUploadedFileContent('');
                  setParsedPreview(null);
                  setUploadError(null);
                }}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {/* Drop Area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-700 hover:border-emerald-500 rounded-xl p-8 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-colors bg-zinc-900/40 hover:bg-zinc-900/70"
              >
                <UploadCloud className="w-8 h-8 text-zinc-400" />
                <div className="text-xs font-semibold text-zinc-200">
                  {uploadedFileName ? uploadedFileName : 'Click to select or drag and drop skill file'}
                </div>
                <div className="text-[11px] text-zinc-500">
                  Supports .json manifest files or .md markdown instructions
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".json,.md,.yaml,.txt"
                  className="hidden"
                />
              </div>

              {uploadError && (
                <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Parsed Preview */}
              {parsedPreview && (
                <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{parsedPreview.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                      ~{parsedPreview.tokenEstimate} tokens
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">{parsedPreview.description}</p>
                  <div className="text-[11px] font-mono text-zinc-500 line-clamp-3 bg-black/40 p-2 rounded border border-zinc-800/80">
                    {parsedPreview.systemPromptAddendum}
                  </div>
                </div>
              )}

              {/* Sample Template Tip */}
              <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 text-[11px] text-zinc-400 space-y-1">
                <span className="font-semibold text-zinc-300">Format Guide:</span>
                <p>
                  JSON files should have <code className="text-emerald-400 font-mono">name</code>, <code className="text-emerald-400 font-mono">description</code>, and <code className="text-emerald-400 font-mono">systemPromptAddendum</code>. Markdown files can start with YAML frontmatter or a markdown title.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-zinc-800 bg-[#07090e] flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setUploadedFileName(null);
                  setUploadedFileContent('');
                  setParsedPreview(null);
                }}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUpload}
                disabled={!uploadedFileContent || !parsedPreview}
                className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  uploadedFileContent && parsedPreview
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>Import & Add to Library</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CREATE CUSTOM SKILL BUILDER                                      */}
      {/* ========================================================================= */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e1117] border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Create Custom Agent Skill</h3>
                  <p className="text-xs text-zinc-400">
                    Define high-precision behavioral directives and tool requirements
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 font-medium mb-1">Skill Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AST Dependency Auditor"
                    value={newSkillForm.name}
                    onChange={(e) => setNewSkillForm({ ...newSkillForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-lg text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-medium mb-1">Category</label>
                  <select
                    value={newSkillForm.category}
                    onChange={(e: any) => setNewSkillForm({ ...newSkillForm, category: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-lg text-white outline-none"
                  >
                    <option value="reasoning">Reasoning & Logic</option>
                    <option value="context">Context & Tokens</option>
                    <option value="coding">Coding & Architecture</option>
                    <option value="security">Security & Guardrails</option>
                    <option value="data">Database & SQL</option>
                    <option value="enterprise">Enterprise & CRM</option>
                    <option value="agentic">Agentic & Loops</option>
                    <option value="productivity">Productivity</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 font-medium mb-1">Short Description *</label>
                <input
                  type="text"
                  required
                  placeholder="One sentence explaining the purpose and value of this skill"
                  value={newSkillForm.description}
                  onChange={(e) => setNewSkillForm({ ...newSkillForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-lg text-white outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-zinc-400 font-medium">
                    System Prompt Instructions (Directives) *
                  </label>
                  <span className="text-[10px] font-mono text-zinc-500">
                    Est. ~{Math.max(20, Math.round(newSkillForm.systemPromptAddendum.length / 3.8))} tokens
                  </span>
                </div>
                <textarea
                  required
                  rows={6}
                  placeholder={`## Specific Instructions\n- Enforce strict rules and execution logic.\n- Specify output schemas or step-by-step reasoning.`}
                  value={newSkillForm.systemPromptAddendum}
                  onChange={(e) =>
                    setNewSkillForm({ ...newSkillForm, systemPromptAddendum: e.target.value })
                  }
                  className="w-full p-3 bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-lg text-white font-mono text-xs outline-none leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 font-medium mb-1">Tags (comma-separated)</label>
                  <input
                    type="text"
                    placeholder="e.g. audit, ast, typescript"
                    value={newSkillForm.tags}
                    onChange={(e) => setNewSkillForm({ ...newSkillForm, tags: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-lg text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-medium mb-1">Required MCP Tools (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. github_search_code, postgres_execute_read_query"
                    value={newSkillForm.requiredTools}
                    onChange={(e) =>
                      setNewSkillForm({ ...newSkillForm, requiredTools: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-lg text-white outline-none"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-zinc-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save & Add to Library</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
