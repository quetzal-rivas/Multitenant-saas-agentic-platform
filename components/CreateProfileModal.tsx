'use client';

import React, { useState } from 'react';
import { ContextProfile, ContextPipelineStep } from '@/lib/types';
import {
  X,
  Plus,
  Layers,
  Sparkles,
  Bot,
  Headphones,
  Zap,
  Briefcase,
  Code2,
} from 'lucide-react';

interface CreateProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (newProfile: ContextProfile) => void;
}

const TEMPLATES = [
  {
    id: 'tpl-sales',
    name: 'Sales & Conversions Agent',
    slug: 'sales-agent-v2',
    description: 'High-touch sales context with qualification playbooks, user memory, and live inventory.',
    icon: <Briefcase className="w-4 h-4 text-emerald-400" />,
    required: ['tenant_id'],
    stepsCount: 7,
  },
  {
    id: 'tpl-voice',
    name: 'Voice Assistant & Phone Agent',
    slug: 'voice-agent',
    description: 'Ultra-low latency context assembly optimized for real-time speech and turn-taking.',
    icon: <Headphones className="w-4 h-4 text-sky-400" />,
    required: ['tenant_id', 'user_id'],
    stepsCount: 5,
  },
  {
    id: 'tpl-copilot',
    name: 'Executive & Financial Copilot',
    slug: 'financial-copilot',
    description: 'C-suite briefing context with live metrics, ARR projections, and board memos.',
    icon: <Bot className="w-4 h-4 text-purple-400" />,
    required: ['tenant_id'],
    stepsCount: 6,
  },
  {
    id: 'tpl-auto',
    name: 'Webhook Automation Runner',
    slug: 'automation-worker',
    description: 'Event-driven context assembly for webhook payloads and asynchronous workflows.',
    icon: <Zap className="w-4 h-4 text-amber-400" />,
    required: ['tenant_id'],
    stepsCount: 4,
  },
];

export const CreateProfileModal: React.FC<CreateProfileModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectTemplate = (tpl: typeof TEMPLATES[0]) => {
    setSelectedTemplate(tpl.id);
    setName(tpl.name);
    setSlug(tpl.slug);
    setDescription(tpl.description);
  };

  const handleCreate = () => {
    if (!name.trim() || !slug.trim()) return;

    const basePipeline: ContextPipelineStep[] = [
      {
        id: `step-sys-${Date.now()}`,
        type: 'system_instructions',
        title: 'System Instructions',
        description: 'Core behavioral directives and role boundaries.',
        sourceId: 'src-static-sys',
        priority: 10,
        enabled: true,
        config: {
          staticContent: `You are the ${name}.\n- Provide accurate, model-agnostic contextual responses.\n- Adhere strictly to the verified tenant and user parameters provided in the compiled context.`,
          tokenBudget: 350,
        },
      },
      {
        id: `step-tenant-${Date.now()}`,
        type: 'tenant_context',
        title: 'Tenant Organization Context',
        description: 'Tenant SLA, brand guidelines, and organizational policies.',
        sourceId: 'src-db-tenants',
        priority: 8,
        enabled: true,
        config: {
          retrievalStrategy: 'exact',
          tokenBudget: 600,
        },
      },
      {
        id: `step-user-${Date.now()}`,
        type: 'current_user',
        title: 'User Profile & Identity',
        description: 'Current user profile, account tenure, and preferences.',
        sourceId: 'src-db-users',
        priority: 8,
        enabled: true,
        config: {
          retrievalStrategy: 'exact',
          tokenBudget: 600,
        },
      },
      {
        id: `step-rag-${Date.now()}`,
        type: 'relevant_knowledge',
        title: 'Relevant Knowledge (RAG)',
        description: 'Vector-retrieved knowledge articles & product documentation.',
        sourceId: 'src-rag-knowledge',
        priority: 6,
        enabled: true,
        config: {
          retrievalStrategy: 'semantic',
          topK: 4,
          minimumScore: 0.72,
          tokenBudget: 1800,
        },
      },
      {
        id: `step-input-${Date.now()}`,
        type: 'runtime_input',
        title: 'Runtime Input & Trigger',
        description: 'Runtime user query and incoming event payload.',
        sourceId: 'src-webhook-event',
        priority: 10,
        enabled: true,
        config: {
          retrievalStrategy: 'webhook',
          tokenBudget: 800,
        },
      },
    ];

    const newProfile: ContextProfile = {
      id: `prof-${Date.now()}`,
      name,
      slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      description: description || 'Custom AI Context Profile',
      environment: 'production',
      version: 1,
      avgTokens: 4200,
      lastRequestAt: 'Just created',
      tags: ['Custom', 'v1'],
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      contract: {
        required: ['tenant_id'],
        optional: ['user_id', 'conversation_id', 'query'],
        runtime: {
          trigger: 'object',
        },
      },
      budget: {
        maxTokens: 10000,
        strategy: 'truncate_lowest_priority',
        outputFormat: 'markdown',
      },
      pipeline: basePipeline,
    };

    onCreate(newProfile);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#0e121a] border border-zinc-800 rounded-xl shadow-2xl overflow-hidden space-y-6 p-6">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-950 flex items-center justify-center border border-emerald-800 text-emerald-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Create Context Profile</h3>
              <p className="text-xs text-zinc-400 font-mono">
                Define the context assembly definition for your AI application
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-1 rounded text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Template Selectors */}
        <div className="space-y-2">
          <label className="text-xs font-mono font-semibold uppercase text-zinc-400 block">
            Start with an Archetype Template:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {TEMPLATES.map((tpl) => (
              <div
                key={tpl.id}
                onClick={() => handleSelectTemplate(tpl)}
                className={`p-3 rounded-lg border transition-all cursor-pointer space-y-1 ${
                  selectedTemplate === tpl.id
                    ? 'bg-[#151b27] border-emerald-500 ring-1 ring-emerald-500/30'
                    : 'bg-[#11151e] hover:bg-[#131823] border-zinc-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  {tpl.icon}
                  <h4 className="text-xs font-bold text-white">{tpl.name}</h4>
                </div>
                <p className="text-[11px] text-zinc-400 line-clamp-1">{tpl.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-3 pt-2 border-t border-zinc-800">
          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">Profile Name</label>
            <input
              type="text"
              placeholder="e.g. Sales Agent"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slug) {
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
                }
              }}
              className="w-full bg-[#111622] border border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">
              Profile Slug (API Identifier)
            </label>
            <input
              type="text"
              placeholder="e.g. sales-agent"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full bg-[#111622] border border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-zinc-300 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-zinc-400 block mb-1">Description</label>
            <textarea
              rows={2}
              placeholder="Describe what context this AI application needs..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#111622] border border-zinc-700 rounded-lg p-2 text-xs font-mono text-zinc-300 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || !slug.trim()}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition-all shadow-md disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Create Profile</span>
          </button>
        </div>
      </div>
    </div>
  );
};
