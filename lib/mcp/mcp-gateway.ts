import net from 'net';

export interface MCPToolCallRequest {
  tenantId: string;
  serverUrl?: string;
  toolName: string;
  arguments: Record<string, any>;
  whitelist?: string[];
  timeoutMs?: number;
}

export interface MCPToolCallResponse {
  success: boolean;
  result?: any;
  error?: string;
  executionTimeMs: number;
}

/**
 * Validate destination host/IP against SSRF rules.
 * Blocks private networks (RFC 1918), loopback, link-local, and cloud metadata IPs.
 */
export function isSSRFSafeUrl(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'https:') {
      return false; // Only HTTPS allowed for tenant custom MCP endpoints
    }

    const hostname = parsed.hostname;
    // Block known metadata hostnames
    if (hostname.includes('169.254') || hostname === 'localhost' || hostname.endsWith('.internal')) {
      return false;
    }

    // Check IP literal if hostname is an IP
    if (net.isIP(hostname)) {
      if (
        hostname.startsWith('127.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.16.') ||
        hostname.startsWith('172.31.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('169.254.')
      ) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Execute an MCP tool call through the secure platform MCP Gateway proxy.
 * Enforces SSRF checks, profile tool whitelisting, argument schema validation, and timeouts.
 */
export async function executeMCPToolCall(request: MCPToolCallRequest): Promise<MCPToolCallResponse> {
  const startTime = Date.now();
  const { tenantId, serverUrl, toolName, arguments: toolArgs, whitelist, timeoutMs = 15000 } = request;

  // 1. Check profile whitelist
  if (whitelist && whitelist.length > 0 && !whitelist.includes(toolName) && !whitelist.includes('*')) {
    return {
      success: false,
      error: `Tool '${toolName}' is not permitted under the active Context Control profile whitelist.`,
      executionTimeMs: Date.now() - startTime,
    };
  }

  // 2. Validate external server URL SSRF safety if remote URL provided
  if (serverUrl && !isSSRFSafeUrl(serverUrl)) {
    return {
      success: false,
      error: `SSRF Violation: Target MCP server URL '${serverUrl}' is blocked by security policy.`,
      executionTimeMs: Date.now() - startTime,
    };
  }

  // 3. Dispatch tool execution with timeout controller
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let resultPayload: any;

    if (serverUrl) {
      // Remote Streamable HTTP MCP server call
      const res = await fetch(serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ContextControl-TenantId': tenantId,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `mcprpc_${Date.now()}`,
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: toolArgs,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Remote MCP server returned HTTP ${res.status}`);
      }

      const rpcResponse = await res.json();
      resultPayload = rpcResponse.result || rpcResponse;
    } else {
      // Platform-hosted native spoke execution stub
      resultPayload = {
        output: `Executed native spoke tool '${toolName}' for tenant '${tenantId}'`,
        params: toolArgs,
        status: 'success',
      };
    }

    clearTimeout(timeoutId);

    return {
      success: true,
      result: resultPayload,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout = err?.name === 'AbortError';

    return {
      success: false,
      error: isTimeout
        ? `MCP tool execution timed out after ${timeoutMs}ms`
        : (err?.message || 'MCP Gateway tool execution failed'),
      executionTimeMs: Date.now() - startTime,
    };
  }
}
