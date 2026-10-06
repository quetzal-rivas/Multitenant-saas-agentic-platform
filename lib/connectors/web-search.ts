import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { DEFAULT_MODELS, geminiModelChain, type LLMProvider } from '@/lib/agent/providers/llm-adapter';
import { getTenantSecret } from '@/lib/secrets/secrets-service';
import { configuredProviders } from '@/lib/services/agent-sessions';
import { ServiceError } from '@/lib/services/errors';

/**
 * `web_search` runs through the organization's own LLM key, preferring Gemini (Google
 * Search grounding), then Claude (web_search server tool), then OpenAI (web_search tool).
 */

export const WEB_SEARCH_DEADLINE_MS = 25_000;
export const webSearchArgs = z.object({ query: z.string().trim().min(2).max(500).describe('What to search the web for.') });

export interface WebSearchResult {
  answer: string;
  sources: Array<{ title: string; url: string }>;
  provider: LLMProvider;
}

const PREFERENCE: LLMProvider[] = ['gemini', 'anthropic', 'openai'];
const INSTRUCTION = 'Search the web and answer concisely with the key facts. Mention dates when relevant.';

export async function webSearchProvider(tenantId: string): Promise<LLMProvider | null> {
  const available = await configuredProviders(tenantId);
  return PREFERENCE.find((p) => available.includes(p)) ?? null;
}

function dedupe(sources: Array<{ title: string; url: string }>) {
  const seen = new Set<string>();
  return sources.filter((s) => s.url && !seen.has(s.url) && seen.add(s.url)).slice(0, 10);
}

async function viaGemini(apiKey: string, query: string, signal: AbortSignal): Promise<Omit<WebSearchResult, 'provider'>> {
  let last = '';
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

async function viaOpenAI(apiKey: string, query: string, signal: AbortSignal): Promise<Omit<WebSearchResult, 'provider'>> {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: DEFAULT_MODELS.openai, instructions: INSTRUCTION, input: query, tools: [{ type: 'web_search' }], reasoning: { effort: 'low' } }),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ServiceError(`Web search failed: OpenAI (${res.status}) ${data?.error?.message || ''}`.trim(), 'CONFLICT');
  const parts = (data.output || []).filter((o: any) => o.type === 'message').flatMap((o: any) => o.content || []);
  const answer = parts.filter((p: any) => p.type === 'output_text').map((p: any) => p.text).join('').trim();
  const sources = parts
    .flatMap((p: any) => p.annotations || [])
    .filter((a: any) => a.type === 'url_citation')
    .map((a: any) => ({ title: a.title || a.url, url: a.url }));
  return { answer, sources: dedupe(sources) };
}

export async function webSearch(tenantId: string, args: unknown): Promise<WebSearchResult> {
  const { query } = webSearchArgs.parse(args ?? {});
  const provider = await webSearchProvider(tenantId);
  if (!provider) throw new ServiceError('Web search needs an LLM key (Gemini, Claude or OpenAI). Add one in Account & Billing → LLM keys.', 'CONFLICT');
  const apiKey = await getTenantSecret(tenantId, provider);
  if (!apiKey) throw new ServiceError(`No ${provider} key is stored.`, 'CONFLICT');
  const signal = AbortSignal.timeout(WEB_SEARCH_DEADLINE_MS);
  try {
    const run = provider === 'gemini' ? viaGemini : provider === 'anthropic' ? viaClaude : viaOpenAI;
    return { ...(await run(apiKey, query, signal)), provider };
  } catch (err) {
    if ((err as Error)?.name === 'TimeoutError' || (err as Error)?.name === 'AbortError') {
      throw new ServiceError('Web search took too long (over 25 s). Try a narrower query.', 'CONFLICT');
    }
    throw err;
  }
}
