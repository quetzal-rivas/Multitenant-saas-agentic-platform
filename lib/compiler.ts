import { ContextProfile, ContextSourceType, ResolveRequest, ResolveResponse, SourceResolutionBreakdown } from './types';

// Rough token estimation helper (1 token ~= 3.8 characters of formatted English text/markdown)
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

/** Data the server has for this request. Steps whose source is missing are reported, never invented. */
export interface CompileSources {
  /** The calling organization, loaded from the database. */
  organization?: { id: string; name: string };
}

/**
 * Step types that need a connected data source (memory store, knowledge base, conversation
 * history, a live system). None is connected to context profiles yet, so these steps are
 * listed as "not connected" instead of being filled.
 */
const UNCONNECTED_TYPES: ContextSourceType[] = ['working_memory', 'long_term_memory', 'conversation', 'relevant_knowledge', 'live_data'];

const SOURCE_LABEL: Partial<Record<ContextSourceType, string>> = {
  system_instructions: 'instructions',
  agent_instructions: 'instructions',
  policy: 'instructions',
  tenant_context: 'tenant',
  current_user: 'user',
  runtime_input: 'runtime_input',
};

/** Caller-provided key/values as a markdown list (the caller vouches for them). */
function fieldList(values: Record<string, unknown>): string {
  return Object.entries(values)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `- **${k}:** ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n');
}

/**
 * Compile a context profile into one prompt payload. Every section comes from the profile's
 * own text, the organization record, or what the caller sent; nothing is sample data.
 */
export function compileContext(profile: ContextProfile, request: ResolveRequest, sources: CompileSources = {}): ResolveResponse {
  const startTime = Date.now();
  const identity = request.identity || {};
  const input = request.input || {};
  const options = request.options || {};
  const requestedFormat = options.format || profile.budget.outputFormat || 'markdown';

  const providedKeys = [
    ...Object.keys(identity).filter((k) => identity[k] !== undefined && identity[k] !== ''),
    ...Object.keys(input).filter((k) => input[k] !== undefined && input[k] !== ''),
  ];
  const missingRequired = profile.contract.required.filter((reqKey) => identity[reqKey] === undefined && input[reqKey] === undefined);
  const contractValidation = { valid: missingRequired.length === 0, missing_required: missingRequired, provided: providedKeys };

  const enabledSteps = [...profile.pipeline].filter((step) => step.enabled).sort((a, b) => b.priority - a.priority);

  const breakdown: SourceResolutionBreakdown[] = [];
  const sourcesUsed: string[] = [];
  const renderedSections: Array<{ title: string; content: string; priority: number; tokens: number; stepType: string }> = [];

  for (const step of enabledSteps) {
    const stepStart = Date.now();
    let sectionTitle = step.title;
    let sectionContent = '';
    let status: SourceResolutionBreakdown['status'] = 'resolved';

    if (UNCONNECTED_TYPES.includes(step.type)) {
      status = 'not_connected';
    } else {
      switch (step.type) {
        case 'tenant_context': {
          const org = sources.organization;
          if (org) {
            sectionTitle = `Organization: ${org.name}`;
            sectionContent = [`**Organization ID:** \`${org.id}\``, step.config.staticContent?.trim()].filter(Boolean).join('\n');
          } else {
            sectionContent = step.config.staticContent?.trim() || '';
          }
          break;
        }
        case 'current_user': {
          const { tenant_id: _tenant, ...user } = identity;
          sectionContent = fieldList(user);
          if (sectionContent) sectionContent = `As provided by the caller:\n${sectionContent}`;
          break;
        }
        case 'runtime_input': {
          const query = typeof input.query === 'string' ? input.query.trim() : '';
          const parts: string[] = [];
          if (query) parts.push(`**Query:**\n> ${query.replace(/\n/g, '\n> ')}`);
          if (input.trigger) parts.push(`**Trigger event:**\n\`\`\`json\n${JSON.stringify(input.trigger, null, 2)}\n\`\`\``);
          sectionContent = parts.join('\n\n');
          break;
        }
        default:
          // Instructions, policies and any authored step: the profile's own text.
          sectionContent = step.config.staticContent?.trim() || '';
      }
      if (!sectionContent) status = 'empty';
    }

    const stepTokens = estimateTokens(sectionContent);
    breakdown.push({
      step_id: step.id,
      step_type: step.type,
      name: sectionTitle,
      source_id: step.sourceId,
      tokens: stepTokens,
      items_retrieved: status === 'resolved' ? 1 : 0,
      latency_ms: Date.now() - stepStart,
      truncated: false,
      status,
    });
    if (status !== 'resolved') continue;
    sourcesUsed.push(SOURCE_LABEL[step.type] ?? 'instructions');
    renderedSections.push({ title: sectionTitle, content: sectionContent, priority: step.priority, tokens: stepTokens, stepType: step.type });
  }

  const maxBudget = options.max_tokens || profile.budget.maxTokens || 12000;
  const totalTokens = renderedSections.reduce((sum, s) => sum + s.tokens, 0);

  if (totalTokens > maxBudget) {
    // Highest priority keeps its full text; lower priorities are cut or omitted first.
    const byPriority = [...renderedSections].sort((a, b) => b.priority - a.priority);
    let runningTokens = 0;
    for (const section of byPriority) {
      if (runningTokens + section.tokens > maxBudget) {
        const allowedTokens = Math.max(0, maxBudget - runningTokens);
        if (allowedTokens < 50) {
          section.content = `<omitted_section reason="token_budget_exceeded" budget="${maxBudget}" />`;
          section.tokens = 20;
        } else {
          section.content = section.content.slice(0, Math.floor(allowedTokens * 3.8)) + `...\n\n<truncation_notice>Content truncated to fit the ${maxBudget} token budget.</truncation_notice>`;
          section.tokens = allowedTokens;
        }
        const item = breakdown.find((b) => b.name === section.title);
        if (item) item.truncated = true;
      }
      runningTokens += section.tokens;
    }
  }

  let finalContent = '';
  let structuredOutput: Record<string, any> | undefined = undefined;

  if (requestedFormat === 'markdown' || (requestedFormat as string) === 'xml') {
    finalContent = renderedSections
      .map((s) => {
        const tag = (s.stepType || 'section').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
        const safeTitle = s.title.replace(/"/g, '&quot;');
        return `<${tag} title="${safeTitle}">\n${s.content}\n</${tag}>`;
      })
      .join('\n\n');
  } else {
    structuredOutput = {
      profile: profile.slug,
      version: profile.version,
      timestamp: new Date().toISOString(),
      identity,
      sections: renderedSections.map((s) => ({ section: s.title, type: s.stepType, priority: s.priority, tokens: s.tokens, content: s.content })),
    };
    finalContent = JSON.stringify(structuredOutput, null, 2);
  }

  return {
    profile: profile.slug,
    version: profile.version,
    context: { format: requestedFormat, content: finalContent, structured: structuredOutput },
    metadata: {
      token_count: estimateTokens(finalContent),
      max_tokens_budget: maxBudget,
      sources: Array.from(new Set(sourcesUsed)),
      resolution_time_ms: Date.now() - startTime,
      source_breakdown: breakdown,
      contract_validation: contractValidation,
    },
  };
}
