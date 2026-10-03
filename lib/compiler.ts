import {
  ContextProfile,
  ResolveRequest,
  ResolveResponse,
  SourceResolutionBreakdown,
} from './types';
import { supabase } from './supabase';

// Rough token estimation helper (1 token ~= 3.8 characters of formatted English text/markdown)
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

interface TenantRecord {
  id: string;
  name: string;
  tier: string;
  industry: string;
  brandVoice: string;
  legalEntity: string;
  sla: string;
  policies: string[];
}

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  loyaltyTier: string;
  tenureYears: number;
  pointsBalance: number;
  preferences: string[];
}

const MOCK_TENANTS: Record<string, TenantRecord> = {
  tenant_123: {
    id: 'tenant_123',
    name: 'Pacific Sands Resorts & Luxury Vacation Club',
    tier: 'Enterprise Platinum',
    industry: 'Hospitality & Luxury Real Estate',
    brandVoice: 'Sophisticated, reassuring, concierge-level hospitality, zero aggressive pressure',
    legalEntity: 'Pacific Sands Global Holdings LLC (Delaware)',
    sla: '99.99% Guaranteed Realtime Availability',
    policies: [
      '30-day cooling-off guarantee on deeded fractionals',
      'Complimentary airport private transfer for Diamond tier',
      'No fees on points rollover before November 1st',
    ],
  },
  '00000000-0000-0000-0000-000000000001': {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Default Enterprise Tenant',
    tier: 'Enterprise Platinum',
    industry: 'Automated Agent Operations',
    brandVoice: 'Professional, concise, authoritative, prompt',
    legalEntity: 'Default Global Enterprise Org',
    sla: '99.99% Enterprise SLA',
    policies: ['Enforce tenant isolation on all database queries', 'Strict audit logging on tool invocations'],
  },
};

const MOCK_USERS: Record<string, UserRecord> = {
  user_456: {
    id: 'user_456',
    name: 'Sarah Jenkins',
    email: 'sarah.jenkins@acmecorp.io',
    role: 'VP Operations & Executive Member',
    loyaltyTier: 'Diamond Premier Club',
    tenureYears: 6,
    pointsBalance: 485000,
    preferences: ['Quiet cliffside villas', 'High-speed fiber internet', 'Morning yoga sessions', 'Ocean-view master suite'],
  },
};

const MOCK_LONG_TERM_MEMORIES = [
  {
    topic: 'cancellation_objections',
    score: 0.94,
    content:
      'Client Sarah Jenkins previously expressed concern about maintenance fee escalations during 2024 economic review; softened immediately when locked into 5-year fixed fee cap.',
  },
  {
    topic: 'family_preferences',
    score: 0.88,
    content: 'Travels with 2 teenage daughters and husband Robert. Always requests adjacent two-bedroom suites with private plunge pool.',
  },
  {
    topic: 'preferred_destinations',
    score: 0.82,
    content: 'Ranked Maui Bay Resort #1 and Cabo San Lucas Esperanza #2. Declined Aspen ski chalet proposal in 2025.',
  },
];

const MOCK_KNOWLEDGE_BASE = [
  {
    title: 'Deeded Fractional Title Security & Asset Preservation',
    score: 0.91,
    snippet:
      'Pacific Sands fractional shares are recorded in county title registry as fee-simple real property, protected from developer encumbrances and transferable to heirs in perpetuity.',
  },
  {
    title: 'VIP Retention & Goodwill Concession Guidelines (2026)',
    score: 0.86,
    snippet:
      'Authorized retention concessions for Diamond members requesting cancellation: (1) 50,000 bonus rollover points, (2) One-time 50% waiver on next maintenance assessment, (3) Free transfer to international exchange partners.',
  },
];

export function compileContext(
  profile: ContextProfile,
  request: ResolveRequest
): ResolveResponse {
  const startTime = Date.now();
  const identity = request.identity || {};
  const input = request.input || {};
  const options = request.options || {};
  const requestedFormat = options.format || profile.budget.outputFormat || 'markdown';

  const providedKeys = [
    ...Object.keys(identity).filter((k) => identity[k] !== undefined && identity[k] !== ''),
    ...Object.keys(input).filter((k) => input[k] !== undefined && input[k] !== ''),
  ];
  const missingRequired = profile.contract.required.filter((reqKey) => {
    const fromIdentity = identity[reqKey];
    const fromInput = input[reqKey];
    return fromIdentity === undefined && fromInput === undefined;
  });

  const contractValidation = {
    valid: missingRequired.length === 0,
    missing_required: missingRequired,
    provided: providedKeys,
  };

  const enabledSteps = [...profile.pipeline]
    .filter((step) => step.enabled)
    .sort((a, b) => b.priority - a.priority);

  const breakdown: SourceResolutionBreakdown[] = [];
  const sourcesUsed: string[] = [];
  const renderedSections: Array<{ title: string; content: string; priority: number; tokens: number; stepType: string }> = [];

  const tenantId = identity.tenant_id || '00000000-0000-0000-0000-000000000001';
  const userId = identity.user_id || 'user_456';
  const conversationId = identity.conversation_id || 'conversation_789';
  const queryText = input.query || '';
  const trigger = input.trigger;

  for (const step of enabledSteps) {
    const stepStart = Date.now();
    let sectionTitle = step.title;
    let sectionContent = '';
    let itemsRetrieved = 1;
    let relevanceScore = 1.0;

    switch (step.type) {
      case 'system_instructions':
        sectionTitle = 'System Instructions';
        sectionContent = step.config.staticContent || 'Adhere strictly to system boundaries and maintain high precision.';
        sourcesUsed.push('instructions');
        break;

      case 'agent_instructions':
        sectionTitle = 'Agent Directives & Strategy';
        sectionContent = step.config.staticContent || 'Guide dialogue toward resolution and apply active listening.';
        sourcesUsed.push('instructions');
        break;

      case 'tenant_context': {
        const tenant = MOCK_TENANTS[tenantId] || {
          id: tenantId,
          name: `Enterprise Organization (${tenantId.slice(0, 8)})`,
          tier: 'Enterprise Tier',
          industry: 'Multitenant Agent Infrastructure',
          brandVoice: 'Concierge-level precision and security',
          legalEntity: 'Enterprise SaaS Holdings',
          sla: '99.99% Availability',
          policies: ['Enforce tenant security boundaries', 'Durable execution logging'],
        };
        sectionTitle = `Tenant Context: ${tenant.name}`;
        sectionContent = `**Tenant ID:** \`${tenant.id}\` | **Tier:** ${tenant.tier} | **SLA:** ${tenant.sla}
**Industry:** ${tenant.industry}
**Brand Voice Directive:** ${tenant.brandVoice}
**Active Governance Policies:**
${tenant.policies.map((p) => `- ${p}`).join('\n')}`;
        sourcesUsed.push('tenant');
        break;
      }

      case 'current_user': {
        const user = MOCK_USERS[userId] || {
          id: userId,
          name: `User ${userId}`,
          email: `${userId}@company.com`,
          role: 'Member',
          loyaltyTier: 'Member',
          tenureYears: 1,
          pointsBalance: 50000,
          preferences: ['Standard options'],
        };
        sectionTitle = `Current User: ${user.name}`;
        sectionContent = `**User ID:** \`${user.id}\` | **Email:** ${user.email}
**Role & Tier:** ${user.role} (${user.loyaltyTier})
**Account Tenure:** ${user.tenureYears} Years | **Current Points Balance:** ${user.pointsBalance.toLocaleString()} pts
**Verified Preferences:**
${user.preferences.map((p) => `- ${p}`).join('\n')}`;
        sourcesUsed.push('user');
        break;
      }

      case 'working_memory':
        sectionTitle = 'Session Working Memory';
        sectionContent = `- **Active Goal:** Process scheduled agent execution graph and evaluate MCP tool status.
- **Pending Concession:** Escalation path active via ElevenLabs voice call if primary tools encounter relay failure.
- **Unresolved Inquiry:** Awaiting target slot verification on Google Calendar.`;
        sourcesUsed.push('memory');
        break;

      case 'long_term_memory': {
        const topK = step.config.topK || 4;
        const minScore = step.config.minimumScore || 0.7;
        const filtered = MOCK_LONG_TERM_MEMORIES.filter((m) => m.score >= minScore).slice(0, topK);
        itemsRetrieved = filtered.length;
        relevanceScore = filtered.length > 0 ? filtered[0].score : 0.85;
        sectionTitle = 'Relevant Long-Term Memories (pgvector)';
        sectionContent = filtered
          .map((m) => `> **[Confidence: ${(m.score * 100).toFixed(0)}% | Topic: ${m.topic}]**\n> ${m.content}`)
          .join('\n\n');
        sourcesUsed.push('memory');
        break;
      }

      case 'conversation': {
        sectionTitle = `Recent Conversation Context (${conversationId})`;
        sectionContent = `[${new Date(Date.now() - 1000 * 60 * 12).toLocaleTimeString()}] **Customer:** "Hi, I received my annual ownership statement and I noticed the rate adjustment."
[${new Date(Date.now() - 1000 * 60 * 10).toLocaleTimeString()}] **Assistant:** "Hello Sarah, I completely understand wanting the best value. Let me verify availability and special privileges."
[${new Date(Date.now() - 1000 * 60 * 2).toLocaleTimeString()}] **Customer:** "${queryText || 'What are our options if we decide to keep the membership but want to upgrade?'}"`;
        sourcesUsed.push('conversation');
        break;
      }

      case 'relevant_knowledge': {
        const topK = step.config.topK || 3;
        const minScore = step.config.minimumScore || 0.7;
        const filtered = MOCK_KNOWLEDGE_BASE.filter((k) => k.score >= minScore).slice(0, topK);
        itemsRetrieved = filtered.length;
        relevanceScore = filtered.length > 0 ? filtered[0].score : 0.88;
        sectionTitle = 'Relevant Knowledge & Policy Base (RAG)';
        sectionContent = filtered
          .map((k, idx) => `### ${idx + 1}. ${k.title} *(Match Score: ${(k.score * 100).toFixed(0)}%)\n${k.snippet}`)
          .join('\n\n');
        sourcesUsed.push('rag');
        break;
      }

      case 'live_data':
        sectionTitle = 'Live Business State (CRM & Billing)';
        sectionContent = `| Attribute | Current Live Value |
|---|---|
| **Active Contract ID** | \`CTR-9281\` (Deeded Oceanview Villa) |
| **Status** | Active (Under Retention Review) |
| **Annual Maintenance Fee** | $2,450.00 (Due Oct 31, 2026) |
| **Current Booking** | Pending Hold: Cabo Esperanza Villa #14 (Nov 24-30, 2026) |
| **Authorized Retention Tier** | Tier 3 Concierge Exception Authorized |`;
        sourcesUsed.push('live_data');
        break;

      case 'runtime_input':
        sectionTitle = 'Runtime Input & Trigger Event';
        sectionContent = `**Primary User Query:**
> "${queryText || 'Analyze current contract status and provide tailored retention resolution.'}"

${
  trigger
    ? `**Incoming Webhook Event:**
\`\`\`json
${JSON.stringify(trigger, null, 2)}
\`\`\``
    : ''
}`;
        sourcesUsed.push('runtime_input');
        break;

      default:
        sectionTitle = step.title;
        sectionContent = step.config.staticContent || '';
        break;
    }

    const stepTokens = estimateTokens(sectionContent);
    const stepLatency = Date.now() - stepStart + 2;

    breakdown.push({
      step_id: step.id,
      step_type: step.type,
      name: sectionTitle,
      source_id: step.sourceId,
      tokens: stepTokens,
      items_retrieved: itemsRetrieved,
      latency_ms: stepLatency,
      truncated: false,
      relevance_score: relevanceScore,
    });

    renderedSections.push({
      title: sectionTitle,
      content: sectionContent,
      priority: step.priority,
      tokens: stepTokens,
      stepType: step.type,
    });
  }

  const maxBudget = options.max_tokens || profile.budget.maxTokens || 12000;
  let totalTokens = renderedSections.reduce((sum, s) => sum + s.tokens, 0);

  if (totalTokens > maxBudget) {
    renderedSections.sort((a, b) => b.priority - a.priority);
    let runningTokens = 0;
    for (let i = 0; i < renderedSections.length; i++) {
      const section = renderedSections[i];
      if (runningTokens + section.tokens > maxBudget) {
        const allowedTokens = Math.max(0, maxBudget - runningTokens);
        if (allowedTokens < 50) {
          section.content = `<omitted_section reason="token_budget_exceeded" budget="${maxBudget}" />`;
          section.tokens = 20;
        } else {
          const charLimit = Math.floor(allowedTokens * 3.8);
          section.content = section.content.slice(0, charLimit) + `...\n\n<truncation_notice>Content truncated to fit ${maxBudget} token budget constraint. Use available agent memory or search tools to retrieve deeper context if necessary.</truncation_notice>`;
          section.tokens = allowedTokens;
        }
        const itemInBreakdown = breakdown.find((b) => b.name === section.title);
        if (itemInBreakdown) itemInBreakdown.truncated = true;
      }
      runningTokens += section.tokens;
    }
    totalTokens = runningTokens;
  }

  let finalContent = '';
  let structuredOutput: Record<string, any> | undefined = undefined;

  if (requestedFormat === 'markdown' || (requestedFormat as string) === 'xml') {

    finalContent = renderedSections.map((s) => {
      const tag = (s.stepType || 'section').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
      const safeTitle = s.title.replace(/"/g, '&quot;');
      return `<${tag} title="${safeTitle}">\n${s.content}\n</${tag}>`;
    }).join('\n\n');
  } else {
    structuredOutput = {
      profile: profile.slug,
      version: profile.version,
      timestamp: new Date().toISOString(),
      identity,
      sections: renderedSections.map((s) => ({
        section: s.title,
        type: s.stepType,
        priority: s.priority,
        tokens: s.tokens,
        content: s.content,
      })),
    };
    finalContent = JSON.stringify(structuredOutput, null, 2);
  }

  const finalTokenCount = estimateTokens(finalContent);
  const totalResolutionTime = Date.now() - startTime + 5;
  const uniqueSources = Array.from(new Set(sourcesUsed));

  return {
    profile: profile.slug,
    version: profile.version,
    context: {
      format: requestedFormat,
      content: finalContent,
      structured: structuredOutput,
    },
    metadata: {
      token_count: finalTokenCount,
      max_tokens_budget: maxBudget,
      sources: uniqueSources,
      resolution_time_ms: totalResolutionTime,
      source_breakdown: breakdown,
      contract_validation: contractValidation,
    },
  };
}
