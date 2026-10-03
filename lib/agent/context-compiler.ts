import { LLMMessage } from './providers/llm-adapter';

export interface ContextCompilerOptions {
  tenantId: string;
  agentName?: string;
  systemInstructions?: string;
  profileTools?: string[];
  memoryStoreSnippets?: Array<{ text: string; score?: number }>;
  history: LLMMessage[];
  currentUserInput: string;
  maxContextTokens?: number;
}

export interface CompiledContext {
  systemPrompt: string;
  messages: LLMMessage[];
  estimatedTokenCount: number;
}

/**
 * Estimate token count using word/character heuristic (4 chars ~= 1 token).
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Compile LLM prompt context with stable prefix structure for prompt caching.
 */
export function compileAgentContext(options: ContextCompilerOptions): CompiledContext {
  const {
    tenantId,
    agentName = 'Context Control Agent',
    systemInstructions = 'You are an autonomous AI agent operating within Context Control SaaS.',
    profileTools = [],
    memoryStoreSnippets = [],
    history = [],
    currentUserInput,
    maxContextTokens = 120000,
  } = options;

  // 1. Stable System Prompt Prefix (Maximizes Prompt Caching)
  const systemBlocks: string[] = [
    `# System Identity\nName: ${agentName}\nTenant ID: ${tenantId}`,
    `# Global Directives\n${systemInstructions}`,
  ];

  if (profileTools.length > 0) {
    systemBlocks.push(`# Whitelisted MCP Tools\n${profileTools.map((t) => `- ${t}`).join('\n')}`);
  }

  if (memoryStoreSnippets.length > 0) {
    const memoryText = memoryStoreSnippets.map((s, idx) => `[Snippet ${idx + 1}]: ${s.text}`).join('\n');
    systemBlocks.push(`# Relevant Knowledge Base Context (pgvector RAG)\n${memoryText}`);
  }

  const systemPrompt = systemBlocks.join('\n\n');
  const systemTokens = estimateTokenCount(systemPrompt);

  // 2. Format Conversation History
  const compiledMessages: LLMMessage[] = [];
  let currentTokens = systemTokens;

  // Append history from oldest to newest while fitting within token limits
  for (const msg of history) {
    const msgTokens = estimateTokenCount(msg.content);
    if (currentTokens + msgTokens > maxContextTokens - 2000) {
      // Truncate older history items if context limit is approached
      break;
    }
    compiledMessages.push(msg);
    currentTokens += msgTokens;
  }

  // 3. Append Current User Input
  const userMsgTokens = estimateTokenCount(currentUserInput);
  compiledMessages.push({
    role: 'user',
    content: currentUserInput,
  });
  currentTokens += userMsgTokens;

  return {
    systemPrompt,
    messages: compiledMessages,
    estimatedTokenCount: currentTokens,
  };
}
