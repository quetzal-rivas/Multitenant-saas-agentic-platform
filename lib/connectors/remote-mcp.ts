import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ServiceError } from '@/lib/services/errors';

/**
 * Generic gateway to a hosted MCP server: we are its MCP client, authenticated with the
 * organization's OAuth token, and our platform server re-exposes its tools. Nothing here
 * is Google-specific; the next hosted servers reuse it as-is.
 */

export const REMOTE_TIMEOUT_MS = 25_000;

/** Tests inject a fetch that talks to an in-process MCP server. */
let fetchImpl: typeof fetch | undefined;
export function setRemoteMcpFetchForTests(f: typeof fetch | undefined) {
  fetchImpl = f;
}

export interface RemoteTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

async function withClient<T>(url: string, token: string, work: (client: Client) => Promise<T>): Promise<T> {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    ...(fetchImpl ? { fetch: fetchImpl as any } : {}),
  });
  const client = new Client({ name: 'context-control-gateway', version: '1.0.0' });
  try {
    await client.connect(transport, { timeout: REMOTE_TIMEOUT_MS });
    return await work(client);
  } catch (err) {
    throw toServiceError(err, url);
  } finally {
    await client.close().catch(() => undefined);
  }
}

function toServiceError(err: unknown, url: string): ServiceError {
  if (err instanceof ServiceError) return err;
  const message = (err as Error)?.message || String(err);
  const host = new URL(url).host;
  if (/401|403|unauthori|forbidden|permission/i.test(message)) {
    return new ServiceError(`${host} refused access (${message.slice(0, 200)}).`, 'FORBIDDEN');
  }
  if (/timed? ?out/i.test(message)) return new ServiceError(`${host} did not answer in time.`, 'CONFLICT');
  return new ServiceError(`${host} failed: ${message.slice(0, 300)}`, 'CONFLICT');
}

export async function listRemoteTools(url: string, token: string): Promise<RemoteTool[]> {
  return withClient(url, token, async (client) => {
    const tools: RemoteTool[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined, { timeout: REMOTE_TIMEOUT_MS });
      for (const t of page.tools) {
        tools.push({ name: t.name, description: t.description, inputSchema: t.inputSchema as Record<string, unknown>, annotations: t.annotations as any });
      }
      cursor = page.nextCursor;
    } while (cursor && tools.length < 500);
    return tools;
  });
}

export interface RemoteCallResult {
  isError: boolean;
  text: string;
  structured?: unknown;
}

export async function callRemoteTool(url: string, token: string, name: string, args: Record<string, unknown>): Promise<RemoteCallResult> {
  return withClient(url, token, async (client) => {
    const res: any = await client.callTool({ name, arguments: args }, undefined, { timeout: REMOTE_TIMEOUT_MS });
    const text = (res.content || [])
      .map((c: any) => (c.type === 'text' ? c.text : c.type === 'resource' ? c.resource?.text ?? '' : `[${c.type}]`))
      .filter(Boolean)
      .join('\n');
    return { isError: !!res.isError, text, structured: res.structuredContent };
  });
}
