import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContextControl, ContextControlError } from '../src/index.js';

test('SDK handshakes, discovers tools, and authenticates MCP requests', async () => {
  const requests: Array<{ url: string; init?: RequestInit; body: any }> = [];
  const client = new ContextControl({
    apiKey: 'sk_test_example',
    baseUrl: 'https://platform.example/',
    fetcher: async (input, init) => {
      const body = JSON.parse(String(init?.body || '{}'));
      requests.push({ url: String(input), init, body });

      if (body.method === 'initialize') {
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'context-control', version: '1.0.0' },
          },
        });
      }
      if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
      if (body.method === 'tools/list') {
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: { tools: [{ name: 'echo', inputSchema: { type: 'object' } }] },
        });
      }
      return Response.json({ jsonrpc: '2.0', id: body.id, result: {} });
    },
  });

  const [server, tools] = await Promise.all([client.mcp.initialize(), client.mcp.listTools()]);

  assert.equal(server.name, 'context-control');
  assert.equal(tools[0].name, 'echo');
  assert.equal(requests[0].url, 'https://platform.example/api/mcp/platform');
  assert.equal(
    (requests[0].init?.headers as Record<string, string>).Authorization,
    'Bearer sk_test_example'
  );
  assert.deepEqual(requests.map((request) => request.body.method), [
    'initialize',
    'notifications/initialized',
    'tools/list',
  ]);
});

test('SDK surfaces MCP tool failures as typed errors', async () => {
  const client = new ContextControl({
    apiKey: 'sk_test_example',
    baseUrl: 'https://platform.example/api/mcp/platform',
    fetcher: async (_input, init) => {
      const body = JSON.parse(String(init?.body || '{}'));
      if (body.method === 'initialize') {
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: { serverInfo: { name: 'context-control', version: '1.0.0' } },
        });
      }
      if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
      return Response.json({
        jsonrpc: '2.0',
        id: body.id,
        result: { isError: true, content: [{ type: 'text', text: 'Tool is not configured.' }] },
      });
    },
  });

  await assert.rejects(client.mcp.callTool('gmail_send_message'), (error: unknown) => {
    assert.ok(error instanceof ContextControlError);
    assert.match(error.message, /Tool is not configured/);
    return true;
  });
});

test('SDK maps profile and task helpers to platform MCP tools', async () => {
  const calls: any[] = [];
  const client = new ContextControl({
    apiKey: 'sk_test_example',
    baseUrl: 'https://platform.example',
    fetcher: async (_input, init) => {
      const body = JSON.parse(String(init?.body || '{}'));
      if (body.method === 'initialize') {
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: { serverInfo: { name: 'context-control', version: '1.0.0' } },
        });
      }
      if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
      calls.push(body.params);
      if (body.params.name === 'list_mcp_profiles') {
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: { content: [], structuredContent: { profiles: [{ id: 'profile-1', name: 'Support' }] } },
        });
      }
      return Response.json({
        jsonrpc: '2.0',
        id: body.id,
        result: { content: [], structuredContent: { task: { id: 'task-1', title: 'Follow up' } } },
      });
    },
  });

  const profiles = await client.profiles.list({ limit: 5 });
  const task = await client.tasks.schedule({
    title: 'Follow up',
    instructions: 'Send the follow-up after review.',
    targetTime: '2030-01-01T10:00:00.000Z',
  });

  assert.equal(profiles[0].name, 'Support');
  assert.equal(task.id, 'task-1');
  assert.equal(calls[0].name, 'list_mcp_profiles');
  assert.equal(calls[0].arguments.limit, 5);
  assert.equal(calls[1].name, 'schedule_deferred_task');
  assert.equal(calls[1].arguments.target_time, '2030-01-01T10:00:00.000Z');
  assert.equal('tenant_id' in calls[1].arguments, false);
});
