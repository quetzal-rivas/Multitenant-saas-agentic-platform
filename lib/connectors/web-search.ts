import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { DEFAULT_MODELS, geminiModelChain, type LLMProvider } from '@/lib/agent/providers/llm-adapter';
import { getTenantSecret, listTenantSecrets } from '@/lib/secrets/secrets-service';
import { ServiceError } from '@/lib/services/errors';

/**
 * `web_search` runs through the organization's own keys, trying in order Gemini (Google
 * Search grounding), Claude (web_search server tool), OpenAI and xAI Grok (web_search tool
 * of the Responses API). A provider that fails (quota, billing, outage) hands over to the next.
 */

export const WEB_SEARCH_DEADLINE_MS = 25_000;
export const webSearchArgs = z.object({ query: z.string().trim().min(2).max(500).describe('What to search the web for.') });

export interface WebSearchResult {
  answer: string;
  sources: Array<{ title: string; url: string }>;
  provider: SearchProvider;
}

export type SearchProvider = LLMProvider | 'xai';
const PREFERENCE: SearchProvider[] = ['gemini', 'anthropic', 'openai', 'xai'];
// Non-reasoning: a search answer does not need long thinking, and speed matters inside agent runs.
const XAI_SEARCH_MODEL = 'grok-4.20-0309-non-reasoning';

/** Providers that failed on quota or billing recently are skipped for a while (per warm instance). */
const QUOTA_COOLDOWN_MS = 15 * 60_000;
const cooledDown = new Map<string, number>();
const isQuotaError = (msg: string) => /quota|billing|rate limit|\(429\)|\(402\)|insufficient|credit/i.test(msg);
export function resetWebSearchCooldownForTests() {
  cooledDown.clear();
}
const INSTRUCTION = 'Search the web and answer concisely with the key facts. Mention dates when relevant.';

/** Providers with a stored key, in the order web search tries them. */
export async function webSearchProviders(tenantId: string): Promise<SearchProvider[]> {
  const secrets = await listTenantSecrets(tenantId);
  return PREFERENCE.filter((p) => secrets.some((s) => s.provider === p));
}

export async function webSearchProvider(tenantId: string): Promise<SearchProvider | null> {
  return (await webSearchProviders(tenantId))[0] ?? null;
}

function dedupe(sources: Array<{ title: string; url: string }>) {
  const seen = new Set<string>();
  return sources.filter((s) => s.url && !seen.has(s.url) && seen.add(s.url)).slice(0, 10);
}

async function viaGemini(apiKey: string, query: string, signal: AbortSignal): Promise<Omit<WebSearchResult, 'provider'>> {
  let last = '';
  let quota = false;
  for (const model of geminiModelChain(DEFAULT_MODELS.gemini)) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: query }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 2000, thinkingConfig: { thinkingLevel: 'low' } },
      }),
      signal,
    });
    if (!res.ok) {
      last = `Gemini (${res.status}): ${(await res.text()).slice(0, 200)}`;
      if (res.status === 429) quota = true;
      if ([429, 500, 502, 503, 504].includes(res.status)) continue;
      throw new ServiceError(`Web search failed: ${last}`, 'CONFLICT');
    }
    const data = await res.json();
    const candidate = data.candidates?.[0];
    const answer = (candidate?.content?.parts || []).map((p: any) => p.text || '').join('').trim();
    const sources = (candidate?.groundingMetadata?.groundingChunks || [])
      .map((c: any) => ({ title: c.web?.title || c.web?.uri || '', url: c.web?.uri || '' }));
    return { answer, sources: dedupe(sources) };
  }
  if (quota) {
    throw new ServiceError(
      "Web search is not available on this organization's Gemini key: Google reports the quota is exceeded (Google Search grounding usually needs billing enabled on the key's Google AI project). Enable billing there, or add a Claude, OpenAI or xAI (Grok) key.",
      'CONFLICT'
    );
  }
  throw new ServiceError(`Web search failed: ${last}`, 'CONFLICT');
}

async function viaClaude(apiKey: string, query: string, signal: AbortSignal): Promise<Omit<WebSearchResult, 'provider'>> {
  const client = new Anthropic({ apiKey });
  const response = await client.beta.messages.create(
    {
      model: DEFAULT_MODELS.anthropic,
      max_tokens: 4000,
      system: INSTRUCTION,
      messages: [{ role: 'user', content: query }],
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
      output_config: { effort: 'low' },
      // On a safety decline, the API re-runs the request on an appropriate fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    } as any,
    { signal }
  );
  if (response.stop_reason === 'refusal') throw new ServiceError('The model declined this search.', 'CONFLICT');
  const answer = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
  const sources: Array<{ title: string; url: string }> = [];
  for (const block of response.content as any[]) {
    // Success content is a list of results; an error is a single object.
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) if (r.type === 'web_search_result') sources.push({ title: r.title, url: r.url });
    }
  }
  return { answer, sources: dedupe(sources) };
}

/** OpenAI and xAI share the Responses API shape (web_search tool, url_citation annotations). */
async function viaResponsesApi(
  vendor: 'OpenAI' | 'xAI',
  url: string,
  body: Record<string, unknown>,
  apiKey: string,
  signal: AbortSignal
): Promise<Omit<WebSearchResult, 'provider'>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.error === 'string' ? data.error : data?.error?.message || data?.message || '';
    throw new ServiceError(`Web search failed: ${vendor} (${res.status}) ${msg}`.trim().slice(0, 300), 'CONFLICT');
  }
  const parts = (data.output || []).filter((o: any) => o.type === 'message').flatMap((o: any) => o.content || []);
  const answer = parts.filter((p: any) => p.type === 'output_text').map((p: any) => p.text).join('').trim();
  const sources = parts
    .flatMap((p: any) => p.annotations || [])
    .filter((a: any) => a.type === 'url_citation')
    .map((a: any) => ({ title: a.title || a.url, url: a.url }));
  // xAI also lists cited URLs at the top level.
  for (const c of Array.isArray(data.citations) ? data.citations : []) {
    const url = typeof c === 'string' ? c : c?.url;
    if (url) sources.push({ title: c?.title || url, url });
  }
  return { answer, sources: dedupe(sources) };
}

const viaOpenAI = (apiKey: string, query: string, signal: AbortSignal) =>
  viaResponsesApi('OpenAI', 'https://api.openai.com/v1/responses', { model: DEFAULT_MODELS.openai, instructions: INSTRUCTION, input: query, tools: [{ type: 'web_search' }], reasoning: { effort: 'low' } }, apiKey, signal);

const viaXai = (apiKey: string, query: string, signal: AbortSignal) =>
  viaResponsesApi(
    'xAI',
    'https://api.x.ai/v1/responses',
    { model: XAI_SEARCH_MODEL, input: [{ role: 'system', content: INSTRUCTION }, { role: 'user', content: query }], tools: [{ type: 'web_search' }] },
    apiKey,
    signal
  );

const RUNNERS: Record<SearchProvider, (apiKey: string, query: string, signal: AbortSignal) => Promise<Omit<WebSearchResult, 'provider'>>> = {
  gemini: viaGemini,
  anthropic: viaClaude,
  openai: viaOpenAI,
  xai: viaXai,
};

export async function webSearch(tenantId: string, args: unknown): Promise<WebSearchResult> {
  const { query } = webSearchArgs.parse(args ?? {});
  const providers = await webSearchProviders(tenantId);
  if (!providers.length) throw new ServiceError('Web search needs a Gemini, Claude, OpenAI or xAI (Grok) key. Add one in Account & Billing → LLM keys.', 'CONFLICT');
  const signal = AbortSignal.timeout(WEB_SEARCH_DEADLINE_MS);
  const failures: string[] = [];
  const now = Date.now();
  // Skip providers in cooldown, unless every provider is (then try them all again).
  const ready = providers.filter((p) => (cooledDown.get(`${tenantId}:${p}`) ?? 0) <= now);
  for (const provider of ready.length ? ready : providers) {
    const apiKey = await getTenantSecret(tenantId, provider);
    if (!apiKey) continue;
    try {
      return { ...(await RUNNERS[provider](apiKey, query, signal)), provider };
    } catch (err) {
      if ((err as Error)?.name === 'TimeoutError' || (err as Error)?.name === 'AbortError') {
        throw new ServiceError('Web search took too long (over 25 s). Try a narrower query.', 'CONFLICT');
      }
      // Quota, billing or outage on this provider: try the next one.
      const message = (err as Error)?.message || String(err);
      if (isQuotaError(message)) cooledDown.set(`${tenantId}:${provider}`, Date.now() + QUOTA_COOLDOWN_MS);
      failures.push(message);
    }
  }
  throw new ServiceError(failures.join(' | ').slice(0, 1200) || 'Web search failed.', 'CONFLICT');
}
