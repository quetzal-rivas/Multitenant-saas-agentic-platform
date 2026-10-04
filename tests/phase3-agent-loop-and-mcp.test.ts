import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { compileAgentContext, estimateTokenCount } from '../lib/agent/context-compiler';
import { isSSRFSafeUrl, executeMCPToolCall } from '../lib/mcp/mcp-gateway';
import {
  API_KEY_PLACEHOLDER,
  SUPPORTED_PROTOCOL_VERSIONS,
  executePlatformTool,
  generateClientConfigSnippets,
  getAuthorizedPlatformTools,
  handlePlatformMCPRPC,
  negotiateProtocolVersion,
} from '../lib/mcp/platform-mcp-server';
import { PLATFORM_TOOL_DEFINITIONS, toMcpToolList } from '../lib/mcp/tool-catalog';
import { DEFAULT_API_KEY_SCOPES } from '../lib/auth/api-keys';

describe('Phase 3 Real Agent Loop & MCP Gateway Verification', () => {
  const mockTenantId = '22222222-2222-4222-a222-222222222222';

  test('Context Compiler: builds stable prefix for prompt caching and calculates tokens', () => {
    const compiled = compileAgentContext({
      tenantId: mockTenantId,
      agentName: 'Test Supervisor',
      systemInstructions: 'Always answer accurately in markdown.',
      profileTools: ['gmail_send_message', 'supabase_query'],
      memoryStoreSnippets: [{ text: 'Tenant account plan: Enterprise' }],
      history: [{ role: 'user', content: 'What is our current plan?' }],
      currentUserInput: 'Summarize our plan status.',
    });

    assert.ok(compiled.systemPrompt.includes('# System Identity'), 'Must include System Identity');
    assert.ok(compiled.systemPrompt.includes('gmail_send_message'), 'Must include whitelisted tools');
    assert.ok(compiled.systemPrompt.includes('Enterprise'), 'Must include pgvector RAG memory');
    assert.ok(compiled.estimatedTokenCount > 0, 'Token count must be positive');
  });

  test('MCP Gateway SSRF Protection: permits safe HTTPS URLs and blocks internal/metadata IPs', () => {
    assert.equal(isSSRFSafeUrl('https://api.external-mcp-spoke.com/mcp'), true, 'Safe HTTPS URL must be permitted');
    assert.equal(isSSRFSafeUrl('http://169.254.169.254/latest/meta-data/'), false, 'AWS Metadata IP must be blocked');
    assert.equal(isSSRFSafeUrl('http://localhost:8080'), false, 'Localhost must be blocked');
    assert.equal(isSSRFSafeUrl('https://192.168.1.50/mcp'), false, 'Private RFC 1918 IP must be blocked');
  });

  test('MCP Gateway Profile Whitelist: blocks execution of non-whitelisted tools', async () => {
    const res = await executeMCPToolCall({
      tenantId: mockTenantId,
      toolName: 'unauthorized_admin_tool',
      arguments: {},
      whitelist: ['gmail_send_message', 'slack_post_message'],
    });

    assert.equal(res.success, false, 'Tool not in whitelist must fail execution');
    assert.ok(res.error?.includes('not permitted under the active Context Control profile whitelist'));
  });

  test('MCP Gateway denies empty whitelists and missing endpoints instead of simulating success', async () => {
    const emptyWhitelist = await executeMCPToolCall({
      tenantId: mockTenantId,
      toolName: 'gmail_send_message',
      arguments: {},
      whitelist: [],
    });
    assert.equal(emptyWhitelist.success, false);
    assert.ok(emptyWhitelist.error?.includes('not permitted'));

    const missingEndpoint = await executeMCPToolCall({
      tenantId: mockTenantId,
      toolName: 'gmail_send_message',
      arguments: {},
      whitelist: ['gmail_send_message'],
    });
    assert.equal(missingEndpoint.success, false);
    assert.ok(missingEndpoint.error?.includes('No MCP server endpoint is configured'));
  });

  test('Platform MCP Server: generates Bearer-authenticated client config snippets', () => {
    const rawKey = 'ctx_live_testkey_1234567890_demo';
    const origin = 'https://app.contextcontrol.io/';

    const snippets = generateClientConfigSnippets(rawKey, origin);
    const endpoint = 'https://app.contextcontrol.io/api/mcp/platform';

    const cursor = snippets.cursor.mcpServers['context-control'];
    assert.equal(cursor.url, endpoint);
    assert.equal(cursor.headers.Authorization, `Bearer ${rawKey}`);

    const desktop = snippets.claudeDesktop.mcpServers['context-control'];
    assert.equal(desktop.command, 'npx');
    assert.deepEqual(desktop.args, ['-y', 'mcp-remote', endpoint, '--header', `Authorization:Bearer ${rawKey}`]);

    assert.ok(snippets.claudeCode.includes(`--transport http context-control ${endpoint}`));
    const serialized = JSON.stringify(snippets);
    assert.ok(!serialized.includes('tenant_id') && !serialized.includes('x-tenant-id'), 'No tenant ids in client config');

    const placeholder = generateClientConfigSnippets('', origin);
    assert.ok(JSON.stringify(placeholder).includes(API_KEY_PLACEHOLDER));
  });

  test('Platform MCP Server: scopes gate tools; a non-empty whitelist narrows further', () => {
    const names = (tools: readonly { name: string }[]) => tools.map((t) => t.name).sort();

    // Empty whitelist = no extra restriction, scopes decide.
    assert.deepEqual(names(getAuthorizedPlatformTools([], ['mcp:tasks:read'])), ['get_scheduled_task', 'list_scheduled_tasks']);
    assert.equal(getAuthorizedPlatformTools([], ['*']).length, PLATFORM_TOOL_DEFINITIONS.length);
    assert.deepEqual(getAuthorizedPlatformTools([], []), []);

    // Whitelist narrows within granted scopes, never widens.
    assert.deepEqual(names(getAuthorizedPlatformTools(['schedule_deferred_task'], ['*'])), ['schedule_deferred_task']);
    assert.deepEqual(getAuthorizedPlatformTools(['schedule_deferred_task'], ['mcp:tasks:read']), []);

    // Segment wildcards.
    const readOnly = getAuthorizedPlatformTools([], ['mcp:*:read']);
    assert.ok(readOnly.length > 0 && readOnly.every((t) => t.sideEffect === 'read'));

    // Default key scopes give a usable read-only toolset.
    assert.deepEqual(names(getAuthorizedPlatformTools([], DEFAULT_API_KEY_SCOPES)), [
      'get_mcp_profile', 'get_scheduled_task', 'list_mcp_profiles', 'list_scheduled_tasks',
    ]);
  });

  test('Platform MCP Server: tools/list exposes JSON Schemas generated from the zod contract', () => {
    const tools = toMcpToolList(PLATFORM_TOOL_DEFINITIONS);
    const schedule = tools.find((t) => t.name === 'schedule_deferred_task')!;
    assert.equal((schedule.inputSchema as any).type, 'object');
    assert.deepEqual([...(schedule.inputSchema as any).required].sort(), ['instructions', 'target_time', 'title']);
    assert.equal((schedule.inputSchema as any).additionalProperties, false);
    assert.equal(tools.find((t) => t.name === 'list_api_keys')!.annotations.readOnlyHint, true);
    assert.equal(tools.find((t) => t.name === 'archive_mcp_profile')!.annotations.destructiveHint, true);
  });

  test('Platform MCP Server: rejects invalid tool arguments before any database call', async () => {
    const ctx = { tenantId: '11111111-1111-4111-a111-111111111111', userId: 'key_x', authMode: 'api_key' as const };
    await assert.rejects(executePlatformTool('get_mcp_profile', { profile_id: 'not-a-uuid' }, ctx));
    await assert.rejects(executePlatformTool('list_scheduled_tasks', { tenant_id: 'other' }, ctx), /Unrecognized key/);
    await assert.rejects(executePlatformTool('drop_database', {}, ctx), /not implemented/);
  });

  test('Platform MCP Server: negotiates protocol version and requires a bearer key', async () => {
    assert.equal(negotiateProtocolVersion('2024-11-05'), '2024-11-05');
    assert.equal(negotiateProtocolVersion('2025-06-18'), '2025-06-18');
    assert.equal(negotiateProtocolVersion('1999-01-01'), SUPPORTED_PROTOCOL_VERSIONS[0]);

    const missing = await handlePlatformMCPRPC('', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    assert.equal(missing.statusCode, 401);
    const malformed = await handlePlatformMCPRPC('Bearer sk_live_abc', { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    assert.equal(malformed.statusCode, 401);
    const invalid = await handlePlatformMCPRPC('Bearer x', { method: 'tools/list' });
    assert.equal(invalid.statusCode, 400);
  });
});
