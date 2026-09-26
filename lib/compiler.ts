import {
  ContextProfile,
  ResolveRequest,
  ResolveResponse,
  SourceResolutionBreakdown,
} from './types';

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
  tenant_789: {
    id: 'tenant_789',
    name: 'CloudScale Technologies Inc.',
    tier: 'Enterprise Gold',
    industry: 'B2B SaaS & Cloud Infrastructure',
    brandVoice: 'Clear, technical, direct, helpful',
    legalEntity: 'CloudScale Inc. (California)',
    sla: '4-hour critical ticket response',
    policies: ['Double billing must be auto-credited within 2 business days', 'SSO mandatory for >10 seats'],
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
  user_882: {
    id: 'user_882',
    name: 'Marcus Sterling',
    email: 'm.sterling@capitalpartners.com',
    role: 'Managing Director',
    loyaltyTier: 'Platinum Owner',
    tenureYears: 3,
    pointsBalance: 210000,
    preferences: ['Penthouse villas only', 'Private yacht excursions', 'Dedicated butler'],
  },
  user_304: {
    id: 'user_304',
    name: 'David Chen',
    email: 'dchen@devops-lead.org',
    role: 'DevOps Lead & Workspace Admin',
    loyaltyTier: 'Standard',
    tenureYears: 2,
    pointsBalance: 0,
    preferences: ['Prefers CLI & API integrations', 'Billing alerts via Slack'],
  },
};

const MOCK_LONG_TERM_MEMORIES = [
  {
    topic: 'cancellation_objections',
    score: 0.94,
    content: 'Client Sarah Jenkins previously expressed concern about maintenance fee escalations during 2024 economic review; softened immediately when locked into 5-year fixed fee cap.',
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
  {
    topic: 'payment_behavior',
    score: 0.74,
    content: 'Always pays annual club dues via corporate Amex Centurion in single lump-sum transfer.',
  },
];

const MOCK_KNOWLEDGE_BASE = [
  {
    title: 'Deeded Fractional Title Security & Asset Preservation',
    score: 0.91,
    snippet: 'Pacific Sands fractional shares are recorded in county title registry as fee-simple real property, protected from developer encumbrances and transferable to heirs in perpetuity.',
  },
  {
    title: 'VIP Retention & Goodwill Concession Guidelines (2026)',
    score: 0.86,
    snippet: 'Authorized retention concessions for Diamond members requesting cancellation: (1) 50,000 bonus rollover points, (2) One-time 50% waiver on next maintenance assessment, (3) Free transfer to international exchange partners.',
  },
  {
    title: 'Cabo San Lucas Esperanza Villa Specifications',
    score: 0.79,
    snippet: 'Phase 3 villas feature 3,400 sq ft, private infinity hot tubs, direct Sea of Cortez views, Sub-Zero Viking kitchens, and 24/7 dedicated concierge service.',
  },
  {
    title: 'Exchange Network Inter-Resort Points Parity',
    score: 0.72,
    snippet: 'Points convert 1:1 across all 42 international partner retreats with zero black-out dates when booked at least 60 days in advance.',
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

  // 1. Contract Validation
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

  // 2. Resolve Pipeline Steps
  const enabledSteps = [...profile.pipeline]
    .filter((step) => step.enabled)
    .sort((a, b) => b.priority - a.priority);

  const breakdown: SourceResolutionBreakdown[] = [];
  const sourcesUsed: string[] = [];
  const renderedSections: Array<{ title: string; content: string; priority: number; tokens: number; stepType: string }> = [];

  const tenantId = identity.tenant_id || 'tenant_123';
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
          name: `Organization (${tenantId})`,
          tier: 'Standard Tier',
          industry: 'General Enterprise',
          brandVoice: 'Professional and helpful',
          legalEntity: 'Global Enterprise Org',
          sla: 'Standard SLA',
          policies: ['Adhere to standard corporate governance'],
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
        sectionContent = `- **Active Goal:** Prospect is reviewing seasonal ownership options; considering Thanksgiving week in Cabo San Lucas.
- **Pending Concession:** Offered 50,000 bonus welcome points + 15% VIP fee reduction.
- **Unresolved Inquiry:** Awaiting confirmation of 2-bedroom vs 3-bedroom villa floor plan availability.`;
        sourcesUsed.push('memory');
        break;

      case 'long_term_memory': {
        const topK = step.config.topK || 4;
        const minScore = step.config.minimumScore || 0.7;
        const filtered = MOCK_LONG_TERM_MEMORIES.filter((m) => m.score >= minScore).slice(0, topK);
        itemsRetrieved = filtered.length;
        relevanceScore = filtered.length > 0 ? filtered[0].score : 0.85;
        sectionTitle = 'Relevant Long-Term Memories';
        sectionContent = filtered
          .map((m) => `> **[Confidence: ${(m.score * 100).toFixed(0)}% | Topic: ${m.topic}]**\n> ${m.content}`)
          .join('\n\n');
        sourcesUsed.push('memory');
        break;
      }

      case 'conversation': {
        const recentCount = step.config.recentMessages || 8;
        sectionTitle = `Recent Conversation Context (${conversationId})`;
        sectionContent = `[${new Date(Date.now() - 1000 * 60 * 12).toLocaleTimeString()}] **Customer:** "Hi, I received my annual ownership statement and I noticed the rate adjustment. We are considering cancelling our contract CTR-9281 unless we can get better dates for Cabo this Thanksgiving."
[${new Date(Date.now() - 1000 * 60 * 10).toLocaleTimeString()}] **Assistant:** "Hello Sarah, I completely understand wanting the best value and timing for your family vacations. Let me check the Cabo San Lucas availability and see what special member privileges we can apply today."
[${new Date(Date.now() - 1000 * 60 * 2).toLocaleTimeString()}] **Customer:** "${queryText || "What are our options if we decide to keep the membership but want to upgrade our Thanksgiving week?"}"`;
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
          .map(
            (k, idx) =>
              `### ${idx + 1}. ${k.title} *(Match Score: ${(k.score * 100).toFixed(0)}%)*\n${k.snippet}`
          )
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

      case 'policy':
        sectionTitle = step.title;
        sectionContent = step.config.staticContent || 'Follow all standard compliance protocols.';
        sourcesUsed.push('policy');
        break;

      default:
        sectionTitle = step.title;
        sectionContent = step.config.staticContent || '';
        break;
    }

    const stepTokens = estimateTokens(sectionContent);
    const stepLatency = Date.now() - stepStart + Math.floor(Math.random() * 4 + 1);

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

  // 3. Token Budget Management & Prioritization
  const maxBudget = options.max_tokens || profile.budget.maxTokens || 12000;
  let totalTokens = renderedSections.reduce((sum, s) => sum + s.tokens, 0);

  // If budget exceeded, trim lowest priority items first
  if (totalTokens > maxBudget) {
    renderedSections.sort((a, b) => b.priority - a.priority);
    let runningTokens = 0;
    for (let i = 0; i < renderedSections.length; i++) {
      const section = renderedSections[i];
      if (runningTokens + section.tokens > maxBudget) {
        const allowedTokens = Math.max(0, maxBudget - runningTokens);
        if (allowedTokens < 50) {
          section.content = `*[Section omitted to stay within token budget of ${maxBudget} tokens]*`;
          section.tokens = 20;
        } else {
          const charLimit = Math.floor(allowedTokens * 3.8);
          section.content = section.content.slice(0, charLimit) + `\n\n*[Truncated to fit ${maxBudget} token budget]*`;
          section.tokens = allowedTokens;
        }
        // Mark in breakdown
        const itemInBreakdown = breakdown.find((b) => b.name === section.title);
        if (itemInBreakdown) itemInBreakdown.truncated = true;
      }
      runningTokens += section.tokens;
    }
    totalTokens = runningTokens;
  }

  // 4. Format Output
  let finalContent = '';
  let structuredOutput: Record<string, any> | undefined = undefined;

  if (requestedFormat === 'markdown') {
    finalContent = renderedSections
      .map((s) => `# ${s.title}\n\n${s.content}`)
      .join('\n\n---\n\n');
  } else if (requestedFormat === 'json') {
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
  } else {
    // structured
    structuredOutput = {
      profile: profile.slug,
      system_instructions: renderedSections.find((s) => s.stepType === 'system_instructions')?.content,
      agent_instructions: renderedSections.find((s) => s.stepType === 'agent_instructions')?.content,
      tenant_context: renderedSections.find((s) => s.stepType === 'tenant_context')?.content,
      current_user: renderedSections.find((s) => s.stepType === 'current_user')?.content,
      working_memory: renderedSections.find((s) => s.stepType === 'working_memory')?.content,
      long_term_memory: renderedSections.find((s) => s.stepType === 'long_term_memory')?.content,
      conversation_history: renderedSections.find((s) => s.stepType === 'conversation')?.content,
      knowledge: renderedSections.find((s) => s.stepType === 'relevant_knowledge')?.content,
      live_data: renderedSections.find((s) => s.stepType === 'live_data')?.content,
      runtime_input: renderedSections.find((s) => s.stepType === 'runtime_input')?.content,
    };
    finalContent = JSON.stringify(structuredOutput, null, 2);
  }

  const finalTokenCount = estimateTokens(finalContent);
  const totalResolutionTime = Date.now() - startTime + Math.floor(Math.random() * 8 + 4);

  // Unique sources
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
