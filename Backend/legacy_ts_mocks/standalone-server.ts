import http from 'http';
import { ProprietaryMcpServer } from './mcp-server';
import { PlatformControlMcpServer } from './platform-mcp-server';
import { McpProfileManager } from './profile-manager';
import { HOSTED_MCP_SERVERS } from './hosted-servers';
import { OAuthManager } from './oauth-manager';

const PORT = 4000;

export function startStandaloneMcpServer() {
  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-mcp-profile');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // Health check
    if (pathname === '/health' || pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'Context Control Proprietary MCP Backend',
          version: '2.4.0',
          activeProfiles: McpProfileManager.listProfiles().length,
          hostedServers: HOSTED_MCP_SERVERS.length,
        })
      );
      return;
    }

    // MCP JSON-RPC Endpoint (POST /mcp or /api/mcp)
    if ((pathname === '/mcp' || pathname === '/api/mcp') && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', async () => {
        try {
          const jsonRpc = JSON.parse(body);
          const profileSlug = url.searchParams.get('profile') || (req.headers['x-mcp-profile'] as string);
          const authHeader = req.headers.authorization || '';
          const apiKey = authHeader.replace(/^Bearer\s+/i, '');

          const mcpResponse = await ProprietaryMcpServer.handleRequest(jsonRpc, {
            profileSlug: profileSlug || undefined,
            apiKey: apiKey || undefined,
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(mcpResponse));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: { code: -32700, message: 'Parse error', data: err?.message },
            })
          );
        }
      });
      return;
    }

    // Platform Control MCP JSON-RPC Endpoint (POST /api/mcp/platform or /platform-mcp)
    if ((pathname === '/platform-mcp' || pathname === '/api/mcp/platform') && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', async () => {
        try {
          const jsonRpc = JSON.parse(body);
          const tenantId = url.searchParams.get('tenant_id') || (req.headers['x-tenant-id'] as string) || 'tenant_enterprise_corp';
          const caller = (req.headers['x-caller-agent'] as string) || 'standalone-http';

          const mcpResponse = await PlatformControlMcpServer.handleRequest(jsonRpc, {
            tenantId,
            caller,
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(mcpResponse));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: { code: -32700, message: 'Parse error', data: err?.message },
            })
          );
        }
      });
      return;
    }

    // Fallback 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  });

  return server;
}

// Allow CLI execution
if (typeof require !== 'undefined' && require.main === module) {
  const server = startStandaloneMcpServer();
  server.listen(PORT, () => {
    console.log(`Proprietary Context Control MCP Server running on http://localhost:${PORT}`);
  });
}
