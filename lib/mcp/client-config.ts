/**
 * Client configuration snippets for the platform MCP endpoint. No server-only
 * imports, so the dashboard can render these directly.
 */

export const API_KEY_PLACEHOLDER = '<YOUR_CONTEXT_CONTROL_API_KEY>';

export interface ClientConfigSnippets {
  claudeDesktop: Record<string, any>;
  cursor: Record<string, any>;
  windsurf: Record<string, any>;
  claudeCode: string;
  stdioBridge: Record<string, any>;
}

export function platformMcpEndpoint(origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/mcp/platform`;
}

/** Generate client configuration snippets for an API key (or a placeholder). */
export function generateClientConfigSnippets(rawApiKey: string, origin: string): ClientConfigSnippets {
  const mcpEndpointUrl = platformMcpEndpoint(origin);
  const authorization = `Bearer ${rawApiKey || API_KEY_PLACEHOLDER}`;
  // Clients whose config file only launches stdio servers (e.g. Claude Desktop) bridge through mcp-remote.
  const stdioBridge = {
    mcpServers: {
      'context-control': {
        command: 'npx',
        args: ['-y', 'mcp-remote', mcpEndpointUrl, '--header', `Authorization:${authorization}`],
      },
    },
  };

  return {
    claudeDesktop: stdioBridge,
    cursor: { mcpServers: { 'context-control': { url: mcpEndpointUrl, headers: { Authorization: authorization } } } },
    windsurf: { mcpServers: { 'context-control': { serverUrl: mcpEndpointUrl, headers: { Authorization: authorization } } } },
    claudeCode: `claude mcp add --transport http context-control ${mcpEndpointUrl} --header "Authorization: ${authorization}"`,
    stdioBridge,
  };
}
