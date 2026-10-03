import {
  McpJsonRpcRequest,
  McpJsonRpcResponse,
  McpTool,
  McpPrompt,
  McpResource,
  McpServerProfile,
} from './types';
import { HOSTED_MCP_SERVERS, MCP_SKILLS } from './hosted-servers';
import { McpProfileManager } from './profile-manager';
import { OAuthManager } from './oauth-manager';
import { compileContext } from '../../compiler';
import { INITIAL_PROFILES } from '../demo-data';
import { PlatformControlMcpServer } from './platform-mcp-server';


export class ProprietaryMcpServer {
  private static agentMemoryStore: Record<string, string> = {};
  /**
   * Main entrypoint for processing incoming MCP JSON-RPC 2.0 requests
   */
  static async handleRequest(
    request: McpJsonRpcRequest,
    context: { profileSlug?: string; apiKey?: string; baseUrl?: string } = {}
  ): Promise<McpJsonRpcResponse> {
    const { id, method, params } = request;

    // Resolve targeted MCP Profile
    let activeProfile: McpServerProfile | undefined;
    if (context.profileSlug) {
      activeProfile = McpProfileManager.getProfileBySlug(context.profileSlug);
    } else if (context.apiKey) {
      activeProfile = McpProfileManager.getProfileByApiKey(context.apiKey);
    }

    // Default to the first profile if none specified
    if (!activeProfile) {
      activeProfile = McpProfileManager.listProfiles()[0];
    }

    try {
      switch (method) {
        case 'initialize': {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              serverInfo: {
                name: 'context-control-mcp-server',
                version: '2.4.0',
                title: 'Proprietary Universal Context & MCP Hub Server',
              },
              capabilities: {
                tools: { listChanged: true },
                prompts: { listChanged: true },
                resources: { subscribe: true, listChanged: true },
                logging: {},
              },
              meta: {
                activeProfile: activeProfile?.slug,
                activeProfileName: activeProfile?.name,
                assignedToolsCount: activeProfile?.selectedToolNames.length,
                boundContextProfiles: activeProfile?.boundContextProfileSlugs,
              },
            },
          };
        }

        case 'tools/list': {
          const tools = this.getToolsForProfile(activeProfile);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools,
            },
          };
        }

        case 'tools/call': {
          const toolName = params?.name as string;
          const toolArgs = params?.arguments || {};

          if (!toolName) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32602, message: 'Missing tool name parameter' },
            };
          }

          // Check if tool is authorized in this profile
          if (activeProfile && !activeProfile.selectedToolNames.includes(toolName)) {
            return {
              jsonrpc: '2.0',
              id,
              error: {
                code: -32001,
                message: `Tool "${toolName}" is not enabled in MCP profile "${activeProfile.name}". Enable it in the MCP Hub to grant access.`,
              },
            };
          }

          const callResult = await this.executeToolCall(toolName, toolArgs, activeProfile);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: typeof callResult === 'string' ? callResult : JSON.stringify(callResult, null, 2),
                },
              ],
            },
          };
        }

        case 'prompts/list': {
          const prompts = this.getPromptsForProfile(activeProfile);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              prompts,
            },
          };
        }

        case 'prompts/get': {
          const promptName = params?.name as string;
          const promptArgs = params?.arguments || {};
          const promptData = this.getPromptContent(promptName, promptArgs, activeProfile);

          if (!promptData) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32602, message: `Prompt "${promptName}" not found` },
            };
          }

          return {
            jsonrpc: '2.0',
            id,
            result: promptData,
          };
        }

        case 'resources/list': {
          const resources = this.getResourcesForProfile(activeProfile);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              resources,
            },
          };
        }

        case 'resources/read': {
          const uri = params?.uri as string;
          const resourceContent = this.readResource(uri, activeProfile);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [resourceContent],
            },
          };
        }

        case 'ping': {
          return { jsonrpc: '2.0', id, result: {} };
        }

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method "${method}" not found` },
          };
      }
    } catch (err: any) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: err?.message || 'Internal MCP server error during resolution',
        },
      };
    }
  }

  /**
   * Filters tools assigned to the profile
   */
  private static getToolsForProfile(profile?: McpServerProfile): McpTool[] {
    const allTools: McpTool[] = [];
    for (const server of HOSTED_MCP_SERVERS) {
      // Check if server is subscribed
      if (server.isSubscribed) {
        allTools.push(...server.tools);
      }
    }

    if (!profile) {
      return allTools;
    }

    // Filter to selected tool names
    return allTools.filter((t) => profile.selectedToolNames.includes(t.name));
  }

  /**
   * Surfaces bound Context Profiles as native MCP Prompts
   */
  private static getPromptsForProfile(profile?: McpServerProfile): McpPrompt[] {
    const boundSlugs = profile?.boundContextProfileSlugs || [];
    const profiles = INITIAL_PROFILES.filter(
      (p: any) => boundSlugs.length === 0 || boundSlugs.includes(p.slug)
    );

    return profiles.map((p: any) => ({
      name: `context-prompt-${p.slug}`,
      description: `Resolves dynamic context, instructions, memory, and CRM data for ${p.name}`,
      arguments: [
        { name: 'tenant_id', description: 'Tenant identifier (e.g. acme-corp)', required: true },
        { name: 'user_id', description: 'User identity (e.g. usr_vip_9482)', required: true },
        { name: 'query', description: 'User prompt or current intent', required: true },
      ],
    }));
  }

  private static getPromptContent(name: string, args: Record<string, any>, profile?: McpServerProfile) {
    const slug = name.replace('context-prompt-', '');
    const contextProfile = INITIAL_PROFILES.find((p: any) => p.slug === slug);

    if (!contextProfile) return null;

    const tenantId = args.tenant_id || 'acme-corp';
    const userId = args.user_id || 'usr_vip_9482';
    const query = args.query || 'Hello assistant';

    const compiled = compileContext(contextProfile, {
      profile: contextProfile.slug,
      identity: {
        tenant_id: tenantId,
        user_id: userId,
      },
      input: {
        query: query,
      },
    });

    return {
      description: `Compiled prompt for ${contextProfile.name}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: compiled.context.content,
          },
        },
      ],
    };
  }

  /**
   * Surfaces available resources
   */
  private static getResourcesForProfile(profile?: McpServerProfile): McpResource[] {
    const boundSlugs = profile?.boundContextProfileSlugs || [];
    const profiles = INITIAL_PROFILES.filter(
      (p: any) => boundSlugs.length === 0 || boundSlugs.includes(p.slug)
    );

    const resources: McpResource[] = profiles.map((p: any) => ({
      uri: `context://profiles/${p.slug}`,
      name: `${p.name} Blueprint`,
      description: `Contract schema and active pipeline step configuration for ${p.name}`,
      mimeType: 'application/json',
    }));

    resources.push({
      uri: 'context://account/skills',
      name: 'Assigned Skills Directives',
      description: 'Active reasoning, token guard, and safety skills assigned to this MCP profile',
      mimeType: 'text/markdown',
    });

    return resources;
  }

  private static readResource(uri: string, profile?: McpServerProfile) {
    if (uri.startsWith('context://profiles/')) {
      const slug = uri.replace('context://profiles/', '');
      const p = INITIAL_PROFILES.find((item: any) => item.slug === slug);
      if (p) {
        return {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(p, null, 2),
        };
      }
    }

    if (uri === 'context://account/skills') {
      const activeSkills = MCP_SKILLS.filter((s: any) => profile?.selectedSkillNames.includes(s.id));
      const markdown = activeSkills
        .map((s: any) => `### Skill: ${s.name}\n- Category: ${s.category}\n- Directive: ${s.systemPromptAddendum}`)
        .join('\n\n');
      return {
        uri,
        mimeType: 'text/markdown',
        text: markdown || 'No custom skills assigned.',
      };
    }

    return {
      uri,
      mimeType: 'text/plain',
      text: `Resource at ${uri} is not found.`,
    };
  }

  /**
   * Tool execution dispatcher
   */
  private static async executeToolCall(
    toolName: string,
    args: Record<string, any>,
    activeProfile?: McpServerProfile
  ): Promise<any> {
    // 1. Context Control proprietary tools
    if (toolName === 'context_resolve_profile') {
      const profileSlug = args.profile_slug || activeProfile?.boundContextProfileSlugs[0] || 'sales-agent';
      const targetProfile = INITIAL_PROFILES.find((p: any) => p.slug === profileSlug) || INITIAL_PROFILES[0];

      const result = compileContext(targetProfile, {
        profile: targetProfile.slug,
        identity: {
          tenant_id: args.tenant_id,
          user_id: args.user_id,
        },
        input: {
          query: args.query,
        },
        options: {
          format: args.output_format || 'markdown',
        },
      });

      return {
        profile: targetProfile.name,
        slug: targetProfile.slug,
        outputFormat: args.output_format || 'markdown',
        tokenUsage: {
          totalTokens: result.metadata.token_count,
          budgetLimit: targetProfile.budget.maxTokens,
          budgetPercent: Math.round((result.metadata.token_count / targetProfile.budget.maxTokens) * 100),
        },
        compiledContext: result.context.content,
        sourcesResolved: result.metadata.source_breakdown.map((s: any) => ({
          title: s.name,
          type: s.step_type,
          tokens: s.tokens,
          latencyMs: s.latency_ms,
        })),
        contractSatisfied: result.metadata.contract_validation.valid,
      };
    }

    if (toolName === 'context_get_contract') {
      const slug = args.profile_slug;
      const targetProfile = INITIAL_PROFILES.find((p: any) => p.slug === slug);
      if (!targetProfile) {
        throw new Error(`Context profile "${slug}" not found`);
      }
      return {
        name: targetProfile.name,
        slug: targetProfile.slug,
        contract: targetProfile.contract,
        tokenBudget: targetProfile.budget.maxTokens,
        pipelineSteps: targetProfile.pipeline.map((s: any) => ({
          title: s.title,
          type: s.type,
          priority: s.priority,
          enabled: s.enabled,
        })),
      };
    }

    if (toolName === 'context_list_profiles') {
      return INITIAL_PROFILES.map((p: any) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        tags: p.tags,
        environment: p.environment,
        tokenBudget: p.budget.maxTokens,
        stepsCount: p.pipeline.length,

      }));
    }

    if (toolName === 'agent_memory_write') {
      const { topic, content } = args;
      ProprietaryMcpServer.agentMemoryStore[topic] = content;
      return {
        status: 'success',
        topic,
        message: `Successfully wrote to memory under topic '${topic}'.`,
      };
    }

    if (toolName === 'agent_memory_read') {
      const { topic } = args;
      const content = ProprietaryMcpServer.agentMemoryStore[topic];
      if (!content) {
        return {
          status: 'not_found',
          topic,
          message: `No memory found for topic '${topic}'.`,
        };
      }
      return {
        status: 'success',
        topic,
        content,
      };
    }

    // 2. Google Workspace tools (OAuth-connected)
    if (toolName.startsWith('google_')) {
      const googleConn = OAuthManager.getConnection('google');
      if (!googleConn?.isConnected) {
        throw new Error('Google Workspace is not connected. Please connect your Google account in the MCP Hub.');
      }

      if (toolName === 'google_drive_search') {
        const query = (args.query || '').toLowerCase();
        return {
          status: 'success',
          provider: 'google',
          account: googleConn.accountEmail,
          query: args.query,
          files: [
            {
              id: 'file_doc_991',
              title: `Q4 Product Architecture Brief (${args.query || 'Design'})`,
              type: 'application/vnd.google-apps.document',
              lastModified: '2026-09-18T16:20:00Z',
              snippet: `...details for integrating Context Control MCP server with enterprise LLM pipelines...`,
              webLink: 'https://docs.google.com/document/d/1abc991/edit',
            },
            {
              id: 'file_sheet_322',
              title: 'Enterprise Tenant Pricing & SLA Matrix',
              type: 'application/vnd.google-apps.spreadsheet',
              lastModified: '2026-09-20T11:00:00Z',
              snippet: 'Gold Tier: 99.95% SLA, 15ms target context latency, 50k token budget.',
              webLink: 'https://docs.google.com/spreadsheets/d/2xyz322/edit',
            },
          ],
        };
      }

      if (toolName === 'google_gmail_send_draft') {
        return {
          status: 'success',
          action: 'draft_created',
          account: googleConn.accountEmail,
          draftId: `draft_${Date.now()}`,
          recipient: args.to,
          subject: args.subject,
          bodySnippet: args.body?.slice(0, 100) + '...',
          createdTimestamp: new Date().toISOString(),
          message: `Draft successfully created in ${googleConn.accountEmail} mailbox.`,
        };
      }

      if (toolName === 'google_calendar_list_events') {
        return {
          status: 'success',
          account: googleConn.accountEmail,
          events: [
            {
              id: 'event_cal_1',
              summary: 'MCP Agent Graph Architecture Review',
              start: '2026-09-22T10:00:00Z',
              end: '2026-09-22T11:00:00Z',
              attendees: ['alex.rivera@enterprise.io', 'lead-architect@client.com'],
              hangoutLink: 'https://meet.google.com/xyz-abcd-efg',
            },
            {
              id: 'event_cal_2',
              summary: 'Weekly Context Control Sprint Sync',
              start: '2026-09-23T15:00:00Z',
              end: '2026-09-23T15:45:00Z',
              attendees: ['engineering-team@enterprise.io'],
            },
          ],
        };
      }
    }

    // 3. GitHub tools (OAuth-connected)
    if (toolName.startsWith('github_')) {
      const githubConn = OAuthManager.getConnection('github');
      if (!githubConn?.isConnected) {
        throw new Error('GitHub account is not connected. Please connect via OAuth in the MCP Hub.');
      }

      if (toolName === 'github_search_repositories') {
        return {
          status: 'success',
          authenticatedUser: githubConn.accountName,
          query: args.query,
          total_count: 2,
          repositories: [
            {
              name: 'enterprise-mcp-agent',
              full_name: `${githubConn.accountName}/enterprise-mcp-agent`,
              description: 'Universal MCP agent host with dynamic context compilation and tool dispatching.',
              stars: 1420,
              language: 'TypeScript',
              url: `https://github.com/${githubConn.accountName}/enterprise-mcp-agent`,
            },
            {
              name: 'context-control-client-ts',
              full_name: `${githubConn.accountName}/context-control-client-ts`,
              description: 'Official client SDK for Context Control and Model Context Protocol.',
              stars: 685,
              language: 'TypeScript',
              url: `https://github.com/${githubConn.accountName}/context-control-client-ts`,
            },
          ],
        };
      }

      if (toolName === 'github_create_issue') {
        return {
          status: 'success',
          issueNumber: 104,
          repo: args.repo,
          title: args.title,
          url: `https://github.com/${args.repo}/issues/104`,
          author: githubConn.accountName,
          state: 'open',
          created_at: new Date().toISOString(),
        };
      }

      if (toolName === 'github_get_pull_request') {
        return {
          status: 'success',
          repo: args.repo,
          pullNumber: args.pullNumber,
          title: 'feat: Add OAuth MCP server subscription manager',
          author: githubConn.accountName,
          state: 'open',
          mergeable: true,
          commits: 4,
          changed_files: 7,
          diff_summary: '+342 lines, -18 lines',
        };
      }

      if (toolName === 'github_search_code') {
        return {
          status: 'success',
          repo: args.repo,
          query: args.query,
          matches: [
            {
              path: 'src/mcp-engine.ts',
              line: 42,
              snippet: `export function resolveToolsForProfile(profileId: string) { ... }`,
            },
          ],
        };
      }
    }

    // 4. PostgreSQL tools
    if (toolName.startsWith('postgres_')) {
      if (toolName === 'postgres_list_tables') {
        return {
          status: 'success',
          database: 'prod_enterprise_cluster',
          schema: args.schema || 'public',
          tables: [
            { tableName: 'users', rowCountEstimate: 145000 },
            { tableName: 'tenants', rowCountEstimate: 320 },
            { tableName: 'context_profiles', rowCountEstimate: 48 },
            { tableName: 'mcp_server_subscriptions', rowCountEstimate: 1200 },
            { tableName: 'audit_logs', rowCountEstimate: 4890000 },
          ],
        };
      }

      if (toolName === 'postgres_describe_table') {
        return {
          status: 'success',
          table: args.tableName,
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, nullable: false },
            { name: 'name', type: 'varchar(255)', nullable: false },
            { name: 'tier', type: 'varchar(50)', nullable: false },
            { name: 'token_budget', type: 'integer', nullable: false },
            { name: 'created_at', type: 'timestamp with time zone', nullable: false },
          ],
        };
      }

      if (toolName === 'postgres_execute_read_query') {
        return {
          status: 'success',
          query: args.sql,
          rowsCount: 2,
          rows: [
            { id: 't_acme_corp', name: 'Acme Corp', tier: 'Enterprise Tier', token_budget: 16000 },
            { id: 't_stripe_demo', name: 'Stripe Integration', tier: 'Partner Tier', token_budget: 24000 },
          ],
        };
      }
    }

    // 5. Slack tools
    if (toolName.startsWith('slack_')) {
      return {
        status: 'success',
        provider: 'slack',
        action: toolName,
        message: `Slack operation "${toolName}" executed with parameters: ${JSON.stringify(args)}`,
      };
    }

    // 6. Platform Control MCP Server Native Tools (Direct Controller Delegation)
    const platformToolNames = [
      'create_agent_profile',
      'attach_worker_to_profile',
      'list_team_blueprints',
      'schedule_deferred_task',
      'cancel_deferred_task',
      'list_scheduled_tasks',
      'trigger_task_now',
      'inspect_database_schema',
      'query_database_table',
      'view_tenant_vault_status',
      'update_tenant_spoke_auth',
    ];

    if (platformToolNames.includes(toolName)) {
      const response = await PlatformControlMcpServer.handleRequest({
        jsonrpc: '2.0',
        id: `mcp_sub_${Date.now()}`,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
          tenant_id: args.tenant_id || 'tenant_enterprise_corp',
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }
      return response.result?.raw || response.result;
    }

    // Fallback
    return {
      status: 'executed',
      tool: toolName,
      arguments: args,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Helper to generate client configuration snippets
   */
  static getClientConfigs(profileSlug: string, appUrl: string, apiKey: string) {
    const cleanUrl = appUrl.replace(/\/$/, '');
    const mcpEndpoint = `${cleanUrl}/api/mcp?profile=${profileSlug}`;

    return {
      claudeDesktop: {
        mcpServers: {
          'context-control': {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-sse', mcpEndpoint],
            env: {
              CONTEXT_CONTROL_API_KEY: apiKey,
            },
          },
        },
      },
      cursor: {
        mcp: {
          servers: {
            'context-control': {
              url: mcpEndpoint,
              headers: {
                Authorization: `Bearer ${apiKey}`,
              },
            },
          },
        },
      },
      windsurf: {
        mcpServers: {
          'context-control': {
            url: mcpEndpoint,
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          },
        },
      },
    };
  }
}
