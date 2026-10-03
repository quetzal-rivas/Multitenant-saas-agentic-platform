import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { compileAgentContext, estimateTokenCount } from '../lib/agent/context-compiler';
import { isSSRFSafeUrl, executeMCPToolCall } from '../lib/mcp/mcp-gateway';
import { generateClientConfigSnippets, getAuthorizedPlatformTools } from '../lib/mcp/platform-mcp-server';

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

  test('Platform MCP Server: generates valid Claude Desktop & Cursor config snippets', () => {
    const rawKey = 'ctx_live_testkey_1234567890_demo';
    const origin = 'https://app.contextcontrol.io';

    const snippets = generateClientConfigSnippets(rawKey, origin);

    assert.ok(snippets.claudeDesktop.mcpServers['context-control'], 'Claude Desktop config must contain context-control server entry');
    assert.equal(
      snippets.claudeDesktop.mcpServers['context-control'].headers.Authorization,
      `Bearer ${rawKey}`,
      'Authorization header must contain Bearer key'
    );
    assert.ok(snippets.cursor.mcpServers['context-control'], 'Cursor config must contain context-control entry');
  });

  test('Platform MCP Server: filters tools by both explicit whitelist and required scope', () => {
    assert.deepEqual(getAuthorizedPlatformTools([], ['*']), []);
    assert.deepEqual(getAuthorizedPlatformTools(['*'], ['mcp:tasks:read']), [
      getAuthorizedPlatformTools(['*'], ['mcp:tasks:read']).find((tool) => tool.name === 'list_scheduled_tasks'),
    ]);
    assert.deepEqual(getAuthorizedPlatformTools(['schedule_deferred_task'], ['*']).map((tool) => tool.name), [
      'schedule_deferred_task',
    ]);
  });
});
