/**
 * Connector registry for MCP Hub. Browser-safe (no server imports).
 *
 * Kinds:
 * - builtin:    Context Control's own platform tools (always available).
 * - remote_mcp: someone else's hosted MCP server; we act as its MCP client with the
 *               organization's OAuth token and re-expose its tools as `<id>__<tool>`.
 *               Each one may have a `direct` fallback implemented against the plain API.
 * - llm_tool:   tools that run through the organization's own LLM key (web search).
 *
 * Adding another hosted MCP server later = one entry here (+ its OAuth provider).
 */

export type AuthProvider = 'google';
export type ConnectorMode = 'official' | 'direct' | 'unavailable';

export interface RemoteConnector {
  id: 'gmail' | 'calendar';
  kind: 'remote_mcp';
  name: string;
  description: string;
  authProvider: AuthProvider;
  /** Official hosted MCP endpoint. */
  url: string;
  /** Scopes the official server and the direct fallback need. */
  scopes: string[];
}

export const GOOGLE_BASE_SCOPES = ['openid', 'email'];

export const REMOTE_CONNECTORS: RemoteConnector[] = [
  {
    id: 'gmail',
    kind: 'remote_mcp',
    name: 'Gmail',
    description: 'Search and read mail, create drafts and labels.',
    authProvider: 'google',
    url: 'https://gmailmcp.googleapis.com/mcp/v1',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
  },
  {
    id: 'calendar',
    kind: 'remote_mcp',
    name: 'Google Calendar',
    description: 'Read events and availability, create events.',
    authProvider: 'google',
    url: 'https://calendarmcp.googleapis.com/mcp/v1',
    scopes: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly'],
  },
];

export function googleScopes(): string[] {
  return [...new Set([...GOOGLE_BASE_SCOPES, ...REMOTE_CONNECTORS.flatMap((c) => c.scopes)])];
}

/** `gmail` + `search_threads` -> `gmail__search_threads` (official tools). */
export const remoteToolName = (connectorId: string, tool: string) => `${connectorId}__${tool}`;

export const WEB_SEARCH_TOOL = 'web_search';

/** A connector tool as profiles, agents and the MCP server see it. */
export interface ConnectorToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  connectorId: string;
  /** For official tools: the name on the remote server. */
  remoteName?: string;
  readOnly?: boolean;
}
