import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { compileAgentContext, estimateTokenCount } from '../lib/agent/context-compiler';
import { isSSRFSafeUrl, executeMCPToolCall } from '../lib/mcp/mcp-gateway';
import {
  API_KEY_PLACEHOLDER,
  CHARACTER_LIMIT,
  executePlatformTool,
  generateClientConfigSnippets,
  getAuthorizedPlatformTools,
  renderMarkdown,
} from '../lib/mcp/platform-mcp-server';
import {
  LEGACY_TOOL_NAMES,
  PLATFORM_TOOL_DEFINITIONS,
  canonicalToolName,
  toolInputJsonSchema,
  toolOutputJsonSchema,
} from '../lib/mcp/tool-catalog';
import { pageInfo } from '../lib/services/errors';
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
    assert.deepEqual(names(getAuthorizedPlatformTools([], ['mcp:tasks:read'])), ['contextcontrol_get_task', 'contextcontrol_list_tasks']);
    assert.equal(getAuthorizedPlatformTools([], ['*']).length, PLATFORM_TOOL_DEFINITIONS.length);
    assert.deepEqual(getAuthorizedPlatformTools([], []), []);

    // Whitelist narrows within granted scopes, never widens; legacy names still match.
    assert.deepEqual(names(getAuthorizedPlatformTools(['contextcontrol_schedule_task'], ['*'])), ['contextcontrol_schedule_task']);
    assert.deepEqual(names(getAuthorizedPlatformTools(['schedule_deferred_task'], ['*'])), ['contextcontrol_schedule_task']);
    assert.deepEqual(getAuthorizedPlatformTools(['contextcontrol_schedule_task'], ['mcp:tasks:read']), []);

    // Segment wildcards.
    const readOnly = getAuthorizedPlatformTools([], ['mcp:*:read']);
    assert.ok(readOnly.length > 0 && readOnly.every((t) => t.sideEffect === 'read'));

    // Default key scopes give a usable read-only toolset.
    assert.deepEqual(names(getAuthorizedPlatformTools([], DEFAULT_API_KEY_SCOPES)), [
      'contextcontrol_get_profile', 'contextcontrol_get_task', 'contextcontrol_list_profiles', 'contextcontrol_list_tasks',
    ]);
  });

  test('Platform MCP Server: every tool follows the mcp-builder conventions', () => {
    for (const tool of PLATFORM_TOOL_DEFINITIONS) {
      assert.match(tool.name, /^contextcontrol_[a-z]+(_[a-z]+)+$/, `${tool.name} is prefixed snake_case`);
      assert.ok(tool.title && tool.description.length > 30, `${tool.name} is described`);
      const input = toolInputJsonSchema(tool) as any;
      assert.equal(input.type, 'object');
      assert.equal(input.additionalProperties, false, `${tool.name} rejects unknown arguments`);
      assert.equal((toolOutputJsonSchema(tool) as any).type, 'object');
      const a = tool.annotations;
      assert.equal(a.readOnlyHint, tool.sideEffect === 'read');
      assert.equal(a.openWorldHint, false);
      if (a.readOnlyHint) assert.equal(a.destructiveHint, false);
    }
    const byName = Object.fromEntries(PLATFORM_TOOL_DEFINITIONS.map((t) => [t.name, t.annotations]));
    assert.equal(byName.contextcontrol_archive_profile.destructiveHint, true);
    assert.equal(byName.contextcontrol_create_profile.destructiveHint, false);
    assert.equal(byName.contextcontrol_update_profile.idempotentHint, true);

    // Every legacy name maps to a real tool.
    for (const next of Object.values(LEGACY_TOOL_NAMES)) assert.ok(PLATFORM_TOOL_DEFINITIONS.some((t) => t.name === next));
    assert.equal(canonicalToolName('list_mcp_profiles'), 'contextcontrol_list_profiles');
    assert.equal(canonicalToolName('contextcontrol_list_tasks'), 'contextcontrol_list_tasks');
  });

  test('Platform MCP Server: paging metadata and markdown rendering', () => {
    assert.deepEqual(pageInfo(45, 0, 20), { total_count: 45, has_more: true, next_offset: 20 });
    assert.deepEqual(pageInfo(45, 40, 5), { total_count: 45, has_more: false, next_offset: null });
    assert.deepEqual(pageInfo(0, 0, 0), { total_count: 0, has_more: false, next_offset: null });

    const md = renderMarkdown('contextcontrol_list_tasks', {
      tasks: [{ id: 't1', title: 'Rotate keys', status: 'scheduled', target_time: '2026-12-01T00:00:00.000Z', description: null }],
      ...pageInfo(3, 0, 1),
    });
    assert.match(md, /\*\*Rotate keys\*\* \(`t1`\) · scheduled · runs 2026-12-01T00:00:00Z/);
    assert.match(md, /Pass offset=1 for more/);
    assert.equal(renderMarkdown('contextcontrol_list_profiles', { profiles: [], ...pageInfo(0, 0, 0) }), 'No profiles found.');
    assert.equal(CHARACTER_LIMIT, 25_000);
  });

  test('Platform MCP Server: rejects invalid tool arguments before any database call', async () => {
    const ctx = { tenantId: '11111111-1111-4111-a111-111111111111', userId: 'key_x', authMode: 'api_key' as const };
    await assert.rejects(executePlatformTool('contextcontrol_get_profile', { profile_id: 'not-a-uuid' }, ctx));
    await assert.rejects(executePlatformTool('contextcontrol_list_tasks', { tenant_id: 'other' }, ctx), /Unrecognized key/);
    await assert.rejects(executePlatformTool('list_scheduled_tasks', { limit: 0 }, ctx), 'legacy name resolves, then validates');
    await assert.rejects(executePlatformTool('drop_database', {}, ctx), /not implemented/);
  });
});
