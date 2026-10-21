/**
 * LLM provider registry: the single source of truth for which providers exist and how to
 * talk to them. Built-in providers are listed here; each organization can add its own
 * OpenAI-compatible providers (stored in llm_providers). Browser-safe: the forms validate
 * against the same definitions the server uses.
 */

/** How the adapter talks to a provider. Most new providers speak the OpenAI Chat Completions API. */
export type ProviderKind = 'anthropic' | 'gemini' | 'xai' | 'openai_compatible';

/** How an agent picks its provider. */
export const PROVIDER_MODES = ['auto', 'preferred', 'locked'] as const;
export type ProviderMode = (typeof PROVIDER_MODES)[number];

export interface ProviderDef {
  id: string;
  label: string;
  kind: ProviderKind;
  /** OpenAI-compatible only: base URL ending before /chat/completions. */
  baseUrl?: string;
  defaultModel: string;
  /** Used when someone is waiting (live calls) and when rotating to this provider during one. */
  fastModel: string;
  /** Accepts OpenAI's reasoning_effort parameter. */
  reasoningParam?: boolean;
  /** Name of the max-tokens parameter (OpenAI uses max_completion_tokens; most others max_tokens). */
  maxTokensParam?: 'max_tokens' | 'max_completion_tokens';
  /** Can run the web_search tool (through its own search). */
  webSearch?: boolean;
  builtIn: boolean;
  supportsTools: boolean;
  keyHint?: string;
  keyWhere?: string;
}

export const BUILT_IN_PROVIDERS: ProviderDef[] = [
  { id: 'anthropic', label: 'Anthropic (Claude)', kind: 'anthropic', defaultModel: 'claude-opus-5-5', fastModel: 'claude-haiku-5-5', webSearch: true, builtIn: true, supportsTools: true, keyHint: 'sk-ant-…', keyWhere: 'console.anthropic.com → API Keys' },
  {
    id: 'openai', label: 'OpenAI', kind: 'openai_compatible', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-5', fastModel: 'gpt-5',
    reasoningParam: true, maxTokensParam: 'max_completion_tokens', webSearch: true, builtIn: true, supportsTools: true, keyHint: 'sk-…', keyWhere: 'platform.openai.com → API keys',
  },
  { id: 'gemini', label: 'Google Gemini', kind: 'gemini', defaultModel: 'gemini-3.8-flash', fastModel: 'gemini-3.8-flash', webSearch: true, builtIn: true, supportsTools: true, keyHint: 'AIza… or AQ.…', keyWhere: 'aistudio.google.com → Get API key' },
  { id: 'xai', label: 'Grok (xAI)', kind: 'xai', defaultModel: 'grok-4.7', fastModel: 'grok-4.20-0309-non-reasoning', webSearch: true, builtIn: true, supportsTools: true, keyHint: 'xai-…', keyWhere: 'console.x.ai → API keys' },
];

export const BUILT_IN_IDS = BUILT_IN_PROVIDERS.map((p) => p.id);

/**
 * Order used until an organization sets its own. Gemini first keeps the behaviour web search
 * and AI drafting had before providers became configurable (it is often the free key).
 */
export const DEFAULT_PROVIDER_ORDER = ['gemini', 'anthropic', 'openai', 'xai'];

/**
 * Starting points for an organization's own provider (checked against each provider's docs
 * on 2026-10-21). The organization still enters its key and can change every field.
 */
export const PROVIDER_PRESETS: Array<{ slug: string; label: string; baseUrl: string; defaultModel: string; fastModel: string; docs: string }> = [
  { slug: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-flash', fastModel: 'deepseek-flash', docs: 'https://api-docs.deepseek.com' },
  { slug: 'mistral', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', defaultModel: 'mistral-large-latest', fastModel: 'mistral-small-latest', docs: 'https://docs.mistral.ai/api/' },
  { slug: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: '', fastModel: '', docs: 'https://console.groq.com/docs/models' },
  { slug: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: '', fastModel: '', docs: 'https://openrouter.ai/models' },
];

export const PROVIDER_ID_PATTERN = /^[a-z0-9_-]{1,40}$/;

/** Where a provider's key is stored (built-ins keep their historical names). */
export function secretNameFor(providerId: string): string {
  return BUILT_IN_IDS.includes(providerId) ? providerId : `llm:${providerId}`;
}

export function builtInProvider(id: string): ProviderDef | undefined {
  return BUILT_IN_PROVIDERS.find((p) => p.id === id);
}

/** An organization's own provider row (llm_providers) as a definition. */
export function customProviderDef(row: { slug: string; label: string; base_url: string; default_model: string; fast_model: string | null; supports_tools: boolean }): ProviderDef {
  return {
    id: row.slug,
    label: row.label,
    kind: 'openai_compatible',
    baseUrl: row.base_url.replace(/\/+$/, ''),
    defaultModel: row.default_model,
    fastModel: row.fast_model || row.default_model,
    maxTokensParam: 'max_tokens',
    builtIn: false,
    supportsTools: row.supports_tools,
  };
}
