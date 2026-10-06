import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import { envelopeDecryptSecret, envelopeEncryptSecret, type EncryptedSecretPayload } from '@/lib/secrets/envelope-encryption';
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  idTokenClaims,
  refreshGoogleTokens,
  revokeGoogleToken,
  type GoogleTokens,
} from '@/lib/auth/oauth-pkce';
import { REMOTE_CONNECTORS, WEB_SEARCH_TOOL, remoteToolName, type ConnectorMode, type ConnectorToolDef } from '@/lib/connectors/registry';
import { callRemoteTool, listRemoteTools } from '@/lib/connectors/remote-mcp';
import { DIRECT_TOOLS, directToolsFor, runDirectTool } from '@/lib/connectors/google-direct';
import { webSearch, webSearchArgs, webSearchProvider } from '@/lib/connectors/web-search';
import { PLATFORM_TOOL_DEFINITIONS } from '@/lib/mcp/tool-catalog';
import { z } from 'zod';
import { ServiceError } from './errors';

/**
 * MCP Hub connections: one Google connection per organization (tokens KMS-encrypted),
 * per-connector mode (Google's official MCP server, or the direct API fallback) and the
 * tools each exposes. Agents and the MCP server get connector tools through profiles.
 */

type Ctx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode' | 'apiKeyId'> & { teamId?: string | null };
type Row = Record<string, any>;
const TOKEN_CONTEXT = 'connection:google';

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

async function loadGoogle(tenantId: string): Promise<Row | null> {
  const { data } = await getSupabaseAdminClient()
    .from('connections')
    .select('id, tenant_id, auth_provider, account_email, account_domain, scopes, encrypted_tokens, status, last_error, connected_by, connected_at, last_used_at')
    .eq('tenant_id', tenantId)
    .eq('auth_provider', 'google')
    .maybeSingle();
  return data ?? null;
}

async function saveTokens(conn: Row, tokens: GoogleTokens) {
  const encrypted = await envelopeEncryptSecret(JSON.stringify(tokens), conn.tenant_id, TOKEN_CONTEXT);
  await getSupabaseAdminClient()
    .from('connections')
    .update({ encrypted_tokens: encrypted, status: 'active', last_error: null, updated_at: new Date().toISOString() })
    .eq('id', conn.id);
}

/** A valid Google access token for the organization, refreshed when needed. */
export async function googleAccessToken(tenantId: string): Promise<{ token: string; conn: Row }> {
  const conn = await loadGoogle(tenantId);
  if (!conn) throw new ServiceError('Google is not connected. Connect it in MCP Hub first.', 'CONFLICT');
  let tokens: GoogleTokens = JSON.parse(await envelopeDecryptSecret(conn.encrypted_tokens as EncryptedSecretPayload, tenantId, TOKEN_CONTEXT));
  if (tokens.expires_at <= Date.now()) {
    try {
      tokens = await refreshGoogleTokens(tokens);
      await saveTokens(conn, tokens);
    } catch (err) {
      await getSupabaseAdminClient().from('connections').update({ status: 'error', last_error: (err as Error).message }).eq('id', conn.id);
      throw err;
    }
  }
  return { token: tokens.access_token, conn };
}

// ---------------------------------------------------------------------------
// Connect / disconnect
// ---------------------------------------------------------------------------

export async function startGoogleConnect(ctx: Ctx, origin: string) {
  return { url: await buildGoogleAuthUrl(ctx.tenantId, ctx.userId, origin) };
}

/** OAuth callback: store the connection, then detect official vs direct per connector. */
export async function completeGoogleConnect(code: string, state: string) {
  const { tenantId, userId, tokens } = await exchangeGoogleCode(code, state);
  const claims = idTokenClaims(tokens.id_token);
  const db = getSupabaseAdminClient();
  const existing = await loadGoogle(tenantId);
  const encrypted = await envelopeEncryptSecret(JSON.stringify(tokens), tenantId, TOKEN_CONTEXT);
  const fields = {
    account_email: claims.email ?? null,
    account_domain: claims.hd ?? null,
    scopes: tokens.scope.split(' ').filter(Boolean),
    encrypted_tokens: encrypted,
    status: 'active',
    last_error: null,
    connected_by: userId,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (existing) await db.from('connections').update(fields).eq('id', existing.id);
  else await db.from('connections').insert({ tenant_id: tenantId, auth_provider: 'google', ...fields });
  await probeConnectors(tenantId);
  return { tenantId, email: claims.email ?? null };
}

/** Decide, per connector, whether Google's official MCP server or the direct API is used. */
export async function probeConnectors(tenantId: string) {
  const { token, conn } = await googleAccessToken(tenantId);
  const db = getSupabaseAdminClient();
  for (const connector of REMOTE_CONNECTORS) {
    let mode: ConnectorMode;
    let tools: ConnectorToolDef[] = [];
    let detail: string | null = null;
    try {
      const remote = await listRemoteTools(connector.url, token);
      mode = 'official';
      tools = remote.map((t) => ({
        name: remoteToolName(connector.id, t.name),
        remoteName: t.name,
        description: t.description || t.name,
        inputSchema: t.inputSchema || { type: 'object', properties: {} },
        connectorId: connector.id,
        readOnly: (t.annotations as any)?.readOnlyHint === true,
      }));
    } catch (err) {
      const direct = directToolsFor(connector.id, conn.scopes || []);
      mode = direct.length ? 'direct' : 'unavailable';
      tools = direct.map(({ name, description, inputSchema, connectorId, readOnly }) => ({ name, description, inputSchema, connectorId, readOnly }));
      detail = `Official server not available: ${(err as Error).message}`.slice(0, 500);
    }
    await db.from('connector_states').delete().eq('connection_id', conn.id).eq('connector_id', connector.id);
    await db.from('connector_states').insert({
      connection_id: conn.id,
      tenant_id: tenantId,
      connector_id: connector.id,
      mode,
      tools,
      detail,
      refreshed_at: new Date().toISOString(),
    });
  }
}

export async function disconnectGoogle(ctx: Ctx) {
  const conn = await loadGoogle(ctx.tenantId);
  if (!conn) return { disconnected: false };
  try {
    const tokens: GoogleTokens = JSON.parse(await envelopeDecryptSecret(conn.encrypted_tokens, ctx.tenantId, TOKEN_CONTEXT));
    await revokeGoogleToken(tokens.refresh_token || tokens.access_token);
  } catch {
    // Revocation is best effort; the stored tokens are deleted regardless.
  }
  await getSupabaseAdminClient().from('connector_states').delete().eq('connection_id', conn.id);
  await getSupabaseAdminClient().from('connections').delete().eq('id', conn.id);
  return { disconnected: true };
}

// ---------------------------------------------------------------------------
// Overview for MCP Hub
// ---------------------------------------------------------------------------

async function connectorStates(tenantId: string, connectionId: string): Promise<Row[]> {
  const { data } = await getSupabaseAdminClient()
    .from('connector_states')
    .select('connector_id, mode, tools, detail, refreshed_at')
    .eq('tenant_id', tenantId)
    .eq('connection_id', connectionId);
  return data || [];
}

export async function listConnections(ctx: Ctx) {
  const conn = await loadGoogle(ctx.tenantId);
  const states = conn ? await connectorStates(ctx.tenantId, conn.id) : [];
  const searchProvider = await webSearchProvider(ctx.tenantId);
  return {
    platform: { tool_count: PLATFORM_TOOL_DEFINITIONS.length, path: '/api/mcp/platform' },
    google: {
      configured: !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET),
      connected: !!conn,
      account_email: conn?.account_email ?? null,
      account_domain: conn?.account_domain ?? null,
      scopes: conn?.scopes ?? [],
      status: conn?.status ?? null,
      last_error: conn?.last_error ?? null,
      connected_at: conn?.connected_at ?? null,
      connectors: REMOTE_CONNECTORS.map((c) => {
        const s = states.find((x) => x.connector_id === c.id);
        return {
          id: c.id,
          name: c.name,
          description: c.description,
          mode: (s?.mode as ConnectorMode) ?? null,
          detail: s?.detail ?? null,
          refreshed_at: s?.refreshed_at ?? null,
          tools: ((s?.tools as ConnectorToolDef[]) || []).map((t) => ({ name: t.name, description: t.description, read_only: !!t.readOnly })),
        };
      }),
    },
    web_search: { available: !!searchProvider, provider: searchProvider, tool: WEB_SEARCH_TOOL },
  };
}

// ---------------------------------------------------------------------------
// Tools for agents and the MCP server
// ---------------------------------------------------------------------------

const webSearchDef = (): ConnectorToolDef => {
  const { $schema: _s, ...schema } = z.toJSONSchema(webSearchArgs) as Record<string, unknown>;
  return {
    name: WEB_SEARCH_TOOL,
    connectorId: 'web_search',
    description: 'Search the web and get a short answer with source links.',
    inputSchema: schema,
    readOnly: true,
  };
};

/** Every connector tool currently usable by the organization. */
export async function availableConnectorTools(tenantId: string): Promise<ConnectorToolDef[]> {
  const tools: ConnectorToolDef[] = [];
  const conn = await loadGoogle(tenantId);
  if (conn && conn.status === 'active') {
    for (const s of await connectorStates(tenantId, conn.id)) tools.push(...((s.tools as ConnectorToolDef[]) || []));
  }
  if (await webSearchProvider(tenantId)) tools.push(webSearchDef());
  return tools;
}

/** Connector tool names grouped in the given MCP profiles (settings.connector_tools). */
async function profileConnectorTools(tenantId: string, profileIds: Array<string | null | undefined>): Promise<Set<string>> {
  const ids = profileIds.filter(Boolean) as string[];
  const names = new Set<string>();
  if (!ids.length) return names;
  const { data } = await getSupabaseAdminClient().from('mcp_profiles').select('id, settings').eq('org_id', tenantId);
  for (const p of data || []) {
    if (ids.includes(p.id)) for (const n of ((p.settings as Row)?.connector_tools as string[]) || []) names.add(n);
  }
  return names;
}

/** Tools for a run or key: the profile's selection, or everything when `profileId` is null and `allIfUnbound`. */
export async function connectorToolsFor(tenantId: string, profileId: string | null | undefined, allIfUnbound = false): Promise<ConnectorToolDef[]> {
  const available = await availableConnectorTools(tenantId);
  if (!profileId) return allIfUnbound ? available : [];
  const chosen = await profileConnectorTools(tenantId, [profileId]);
  return available.filter((t) => chosen.has(t.name));
}

export async function runConnectorTool(ctx: Ctx, tool: ConnectorToolDef, args: Record<string, unknown>): Promise<unknown> {
  if (tool.name === WEB_SEARCH_TOOL) return webSearch(ctx.tenantId, args);
  const { token, conn } = await googleAccessToken(ctx.tenantId);
  void getSupabaseAdminClient().from('connections').update({ last_used_at: new Date().toISOString() }).eq('id', conn.id).then(() => undefined, () => undefined);
  if (tool.remoteName) {
    const connector = REMOTE_CONNECTORS.find((c) => c.id === tool.connectorId);
    if (!connector) throw new ServiceError(`Unknown connector ${tool.connectorId}.`, 'NOT_FOUND');
    const res = await callRemoteTool(connector.url, token, tool.remoteName, args);
    if (res.isError) throw new ServiceError(res.text || `${tool.name} failed.`, 'CONFLICT');
    return res.structured ?? { result: res.text };
  }
  if (!DIRECT_TOOLS.some((t) => t.name === tool.name)) throw new ServiceError(`Unknown tool ${tool.name}.`, 'NOT_FOUND');
  return runDirectTool(tool.name, token, args);
}
