/**
 * Backend/platform-mcp-server.ts
 * 
 * Specialized "Platform Control MCP Server"
 * Conforms strictly to Model Context Protocol (MCP 2024-11-05 JSON-RPC 2.0 & Stdio/SSE patterns).
 * 
 * CORE ARCHITECTURAL RULE: Decouple Transport from Logic.
 * Directly wraps local in-memory controllers and repository services:
 * - teamBlueprintManager (Profiles & Workers)
 * - taskQueue (BullMQ Durable Lifecycle)
 * - db (Scheduled Tasks & Postgres store)
 * - TenantVaultManager (Encrypted Auth Tokens & RLS Tenant Vault)
 * - PostgreSQL Schema & Tables Inspection
 * 
 * Category A: Agent Team Blueprint Engineering
 *   - create_agent_profile: writes blueprint to profiles
 *   - attach_worker_to_profile: attaches worker with system prompt & MCP whitelist
 *   - list_team_blueprints: queries blueprints with worker breakdown
 * 
 * Category B: Durable Task Control (BullMQ Lifecycle)
 *   - schedule_deferred_task: direct taskQueue.scheduleTask() bypasses HTTP
 *   - cancel_deferred_task: drops job from queue and updates db
 *   - list_scheduled_tasks: lists active/delayed/running jobs with telemetry
 *   - trigger_task_now: forces immediate execution
 * 
 * Category C: Database & State Store Governance
 *   - inspect_database_schema: returns relational tables, row estimates, columns
 *   - query_database_table: reads records filtered by tenant_id
 * 
 * Category D: Auth Vault & Security Enforcement
 *   - view_tenant_vault_status: lists connected spoke integrations
 *   - update_tenant_spoke_auth: links spoke credential to tenant vault
 */

import { teamBlueprintManager, ProfileTeamBlueprint, ProfileWorkerBlueprint } from './team-blueprint-manager';
import { taskQueue, QueueJob } from './queue';
import { db, ScheduledTask, TaskStatus, FallbackPolicy } from './db';
import { TenantVaultManager, VaultSpokeCredential } from './vault-manager';
import { McpTool, McpJsonRpcRequest, McpJsonRpcResponse } from './types';
import { PLATFORM_CONTROL_MCP_TOOLS } from './platform-mcp-tools';

// Shared singleton vault manager
export const platformVaultManager = new TenantVaultManager();

export { PLATFORM_CONTROL_MCP_TOOLS };

/**
 * PlatformControlMcpServer
 * Handles standard MCP JSON-RPC 2.0 messages via local native controllers
 */
export class PlatformControlMcpServer {
  /**
   * Process MCP JSON-RPC 2.0 requests
   */
  public static async handleRequest(
    request: McpJsonRpcRequest,
    context: { tenantId?: string; caller?: string } = {}
  ): Promise<McpJsonRpcResponse> {
    const { id, method, params } = request;
    const activeTenant = context.tenantId || (params?.tenant_id as string) || 'tenant_enterprise_corp';

    try {
      switch (method) {
        case 'initialize': {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              serverInfo: {
                name: 'platform-control-mcp-server',
                version: '3.0.0',
                title: 'Specialized Platform Control MCP Server (Direct In-Memory Controllers)',
              },
              capabilities: {
                tools: { listChanged: true },
                prompts: { listChanged: false },
                resources: { subscribe: false, listChanged: false },
                logging: {},
              },
              meta: {
                activeTenant,
                caller: context.caller || 'ide-agent',
                transport: 'in-memory-stdio/rpc',
                controllers: ['TeamBlueprintManager', 'DurableTaskQueue', 'TaskDatabase', 'TenantVaultManager'],
              },
            },
          };
        }

        case 'tools/list': {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools: PLATFORM_CONTROL_MCP_TOOLS,
            },
          };
        }

        case 'tools/call': {
          const toolName = params?.name as string;
          const args = params?.arguments || {};

          if (!toolName) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32602, message: 'Missing "name" in params for tools/call' },
            };
          }

          const callResult = await this.executeTool(toolName, args, activeTenant);
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
              raw: callResult,
            },
          };
        }

        case 'ping': {
          return {
            jsonrpc: '2.0',
            id,
            result: { status: 'pong', timestamp: new Date().toISOString() },
          };
        }

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method "${method}" not found on PlatformControlMcpServer`,
            },
          };
      }
    } catch (err: any) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: err?.message || 'Internal Platform Control MCP Server execution error',
          data: { stack: err?.stack },
        },
      };
    }
  }

  /**
   * Internal tool router executing local controllers directly
   */
  private static async executeTool(
    toolName: string,
    args: Record<string, any>,
    defaultTenantId: string
  ): Promise<any> {
    const tenantId = args.tenant_id || defaultTenantId;

    switch (toolName) {
      // ======================================================================
      // Category A: Agent Team Blueprint Engineering
      // ======================================================================
      case 'create_agent_profile': {
        const { name, supervisor_prompt, routing_strategy } = args;
        if (!name || !supervisor_prompt) {
          throw new Error('create_agent_profile requires "name" and "supervisor_prompt"');
        }

        const newProfile = teamBlueprintManager.createProfile({
          tenantId,
          name,
          supervisorPrompt: supervisor_prompt,
          routingStrategy: routing_strategy || 'supervisor_router',
          workers: [],
        });

        return {
          status: 'success',
          message: `Created Agent Team Profile Blueprint "${name}"`,
          profile: newProfile,
        };
      }

      case 'attach_worker_to_profile': {
        const { profile_id, worker_name, role, system_prompt, mcp_tools, skills, avatar_icon } = args;
        if (!profile_id || !worker_name || !role || !system_prompt) {
          throw new Error('attach_worker_to_profile requires profile_id, worker_name, role, system_prompt, and mcp_tools');
        }

        const updated = teamBlueprintManager.attachWorker(profile_id, {
          name: worker_name,
          role,
          systemPrompt: system_prompt,
          mcpTools: mcp_tools || [],
          skills: skills || [],
          avatarIcon: avatar_icon || 'bot',
        });

        if (!updated) {
          throw new Error(`Profile with ID "${profile_id}" not found.`);
        }

        return {
          status: 'success',
          message: `Worker "${worker_name}" successfully attached to team "${updated.name}"`,
          profile: updated,
          workerCount: updated.workers.length,
        };
      }

      case 'list_team_blueprints': {
        const targetTenant = args.tenant_id || tenantId;
        const profiles = teamBlueprintManager.listProfiles(targetTenant);
        return {
          status: 'success',
          tenant_id: targetTenant,
          count: profiles.length,
          blueprints: profiles.map((p) => ({
            id: p.id,
            name: p.name,
            routingStrategy: p.routingStrategy,
            supervisorPrompt: p.supervisorPrompt,
            workerCount: p.workers.length,
            workers: p.workers.map((w) => ({
              id: w.id,
              name: w.name,
              role: w.role,
              mcpToolsCount: w.mcpTools.length,
              mcpTools: w.mcpTools,
              skills: w.skills,
            })),
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          })),
        };
      }

      // ======================================================================
      // Category B: Durable Task Control (BullMQ Lifecycle)
      // ======================================================================
      case 'schedule_deferred_task': {
        const {
          title,
          instructions,
          targetTime,
          toolsWhitelist,
          edgeCasePolicies,
          profile_id,
          simulate_failure,
        } = args;

        if (!title || !instructions || !targetTime || !toolsWhitelist) {
          throw new Error('Missing required arguments: title, instructions, targetTime, toolsWhitelist are mandatory');
        }

        const fallbackPolicy: FallbackPolicy = edgeCasePolicies || {
          on_failure: 'escalate',
          fallback_tool: 'elevenlabs_trigger_call',
          escalation_instructions: 'Trigger emergency telephony voice escalation if primary tool calls fail.',
          max_retries: 1,
        };

        const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const task: ScheduledTask = {
          id: taskId,
          title,
          instructions,
          scheduled_at: targetTime,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          status: 'SCHEDULED',
          allowed_tools: toolsWhitelist,
          fallback_policy: fallbackPolicy,
          tenant_id: tenantId,
          simulate_failure: Boolean(simulate_failure),
          category: 'email',
        };

        // 1. Save directly into DB store
        db.saveTask(task);

        // 2. Schedule directly into BullMQ QueueManager without HTTP hop (< 5ms)
        const job = await taskQueue.scheduleTask(task);

        return {
          status: 'SCHEDULED',
          message: `Successfully scheduled task "${title}" into BullMQ queue.`,
          jobId: job.id,
          taskId: task.id,
          scheduled_at: task.scheduled_at,
          delayMs: job.delayMs,
          delayReadable: `${Math.round(job.delayMs / 1000)} seconds from now`,
          allowed_tools: task.allowed_tools,
          fallback_policy: task.fallback_policy,
          queueStats: taskQueue.getStats(),
        };
      }

      case 'cancel_deferred_task': {
        const { task_id } = args;
        if (!task_id) throw new Error('cancel_deferred_task requires "task_id"');

        const cancelled = taskQueue.cancelTask(task_id);
        const task = db.getTask(task_id);

        return {
          status: cancelled ? 'CANCELLED' : 'NOT_FOUND_OR_ALREADY_EXECUTED',
          taskId: task_id,
          cancelled,
          task,
        };
      }

      case 'list_scheduled_tasks': {
        const allTasks = db.getAllTasks(tenantId);
        const filterStatus = (args.status || 'ALL').toUpperCase();

        const filtered = filterStatus === 'ALL'
          ? allTasks
          : allTasks.filter((t) => t.status === filterStatus);

        return {
          status: 'success',
          tenant_id: tenantId,
          total: filtered.length,
          queueStats: taskQueue.getStats(),
          tasks: filtered.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            scheduled_at: t.scheduled_at,
            category: t.category,
            tools: t.allowed_tools,
            fallbackOnFailure: t.fallback_policy?.on_failure,
            fallbackTool: t.fallback_policy?.fallback_tool,
            hasExecutionResult: Boolean(t.execution_result),
          })),
        };
      }

      case 'trigger_task_now': {
        const { task_id } = args;
        if (!task_id) throw new Error('trigger_task_now requires "task_id"');

        const result = await taskQueue.triggerNow(task_id);
        if (!result) {
          throw new Error(`Task with ID "${task_id}" not found or failed to execute.`);
        }

        return {
          status: 'EXECUTED',
          message: `Task "${result.title}" was forcibly promoted and executed immediately.`,
          task: result,
          execution_result: result.execution_result,
        };
      }

      // ======================================================================
      // Category C: Database & State Store Governance
      // ======================================================================
      case 'inspect_database_schema': {
        return {
          status: 'success',
          cluster: 'Supabase PostgreSQL (Supavisor Port 5432)',
          schema: args.schema_name || 'public',
          isolation: 'Row-Level Security (app.current_tenant_id)',
          extensions: ['uuid-ossp', 'pgcrypto', 'vector (pgvector 1536d)'],
          tables: [
            {
              tableName: 'public.tenants',
              description: 'Multi-tenant organization partitions and enterprise tiers',
              columns: ['id (uuid)', 'slug (varchar)', 'name (varchar)', 'tier (varchar)', 'created_at', 'updated_at'],
              estimatedRows: 3,
            },
            {
              tableName: 'public.profiles',
              description: 'Agent Team Profile Blueprints holding supervisor instructions and graph routing strategies',
              columns: ['id (uuid)', 'tenant_id (uuid)', 'name (text)', 'supervisor_prompt (text)', 'routing_strategy (varchar)', 'created_at', 'updated_at'],
              estimatedRows: teamBlueprintManager.listProfiles().length,
            },
            {
              tableName: 'public.profile_workers',
              description: 'Specialized child worker nodes bound to Team Blueprints with whitelisted MCP tools',
              columns: ['id (uuid)', 'profile_id (uuid)', 'name (text)', 'role (varchar)', 'system_prompt (text)', 'mcp_tools (text[])', 'avatar_icon (varchar)', 'created_at'],
              estimatedRows: teamBlueprintManager.listProfiles().reduce((sum, p) => sum + p.workers.length, 0),
            },
            {
              tableName: 'public.thread_instances',
              description: 'Active agent conversation sessions spawned from profile blueprints with LangGraph checkpoints',
              columns: ['id (uuid)', 'thread_id (varchar)', 'tenant_id (uuid)', 'profile_id (uuid)', 'title (text)', 'created_at', 'last_active_at'],
              estimatedRows: 12,
            },
            {
              tableName: 'public.tenant_vault',
              description: 'Encrypted OAuth2 tokens and spoke credentials decrypted only by proprietary MCP gateway',
              columns: ['id (uuid)', 'tenant_id (uuid)', 'provider (varchar)', 'encrypted_access_token (text)', 'scopes (text[])', 'key_fingerprint (varchar)', 'is_active (boolean)'],
              estimatedRows: platformVaultManager.getCredentials(tenantId).length,
            },
            {
              tableName: 'public.tasks',
              description: 'Durable background tasks managed by the BullMQ deferred execution engine',
              columns: ['id (text)', 'title (text)', 'instructions (text)', 'scheduled_at (timestamptz)', 'status (varchar)', 'allowed_tools (text[])', 'fallback_policy (jsonb)'],
              estimatedRows: db.getAllTasks().length,
            },
            {
              tableName: 'public.checkpoints',
              description: 'Immutable PostgresSaver LangGraph checkpoints and execution state graphs',
              columns: ['thread_id (text)', 'checkpoint_ns (text)', 'checkpoint_id (text)', 'parent_checkpoint_id (text)', 'checkpoint (bytea)', 'metadata (jsonb)'],
              estimatedRows: 48,
            },
          ],
        };
      }

      case 'query_database_table': {
        const { table, limit = 10 } = args;
        const boundedLimit = Math.min(Math.max(1, Number(limit) || 10), 50);

        if (table === 'profiles') {
          const profiles = teamBlueprintManager.listProfiles(tenantId).slice(0, boundedLimit);
          return { table, tenant_id: tenantId, rowCount: profiles.length, rows: profiles };
        }

        if (table === 'profile_workers') {
          const profiles = teamBlueprintManager.listProfiles(tenantId);
          const allWorkers = profiles.flatMap((p) => p.workers.map((w) => ({ ...w, profileName: p.name })));
          return { table, tenant_id: tenantId, rowCount: allWorkers.length, rows: allWorkers.slice(0, boundedLimit) };
        }

        if (table === 'tasks') {
          const tasks = db.getAllTasks(tenantId).slice(0, boundedLimit);
          return { table, tenant_id: tenantId, rowCount: tasks.length, rows: tasks };
        }

        if (table === 'tenant_vault') {
          const creds = platformVaultManager.getCredentials(tenantId).slice(0, boundedLimit);
          return { table, tenant_id: tenantId, rowCount: creds.length, rows: creds };
        }

        if (table === 'tenants') {
          return {
            table,
            tenant_id: tenantId,
            rowCount: 2,
            rows: [
              { id: 'tenant_enterprise_corp', slug: 'enterprise-corp', name: 'Enterprise Global Corp', tier: 'enterprise' },
              { id: 'tenant_growth_saas', slug: 'growth-saas', name: 'Rapid Growth Labs', tier: 'growth' },
            ],
          };
        }

        if (table === 'thread_instances') {
          return {
            table,
            tenant_id: tenantId,
            rowCount: 3,
            rows: [
              { id: 'th_inst_1', thread_id: 'fresh_chat_session_889', tenant_id: tenantId, title: 'CRM Lead Enrichment Turn', lastActive: new Date().toISOString() },
              { id: 'th_inst_2', thread_id: 'session_devops_audit_202', tenant_id: tenantId, title: 'Nightly DevOps Cluster Audit', lastActive: new Date().toISOString() },
              { id: 'th_inst_3', thread_id: 'thread_voice_call_vip_441', tenant_id: tenantId, title: 'Executive Voice Escalation Follow-Up', lastActive: new Date().toISOString() },
            ],
          };
        }

        return {
          table,
          tenant_id: tenantId,
          rowCount: 0,
          rows: [],
          message: `Table "${table}" returned empty or is sandboxed.`,
        };
      }

      // ======================================================================
      // Category D: Auth Vault & Security Enforcement
      // ======================================================================
      case 'view_tenant_vault_status': {
        const credentials = platformVaultManager.getCredentials(tenantId);
        return {
          status: 'success',
          tenant_id: tenantId,
          isolationMode: 'Row-Level Security (RLS)',
          encryptionStandard: 'AES-256-GCM Vault Store',
          credentialsCount: credentials.length,
          connectedSpokes: credentials.map((c) => ({
            id: c.id,
            provider: c.provider,
            providerName: c.providerName,
            accountLabel: c.accountLabel,
            scopes: c.scopes,
            keyFingerprint: c.keyFingerprint,
            isActive: c.isActive,
            connectedAt: c.connectedAt,
            lastUsedAt: c.lastUsedAt,
          })),
        };
      }

      case 'update_tenant_spoke_auth': {
        const { provider, account_label, scopes } = args;
        if (!provider || !account_label || !scopes) {
          throw new Error('update_tenant_spoke_auth requires provider, account_label, and scopes');
        }

        const cred = platformVaultManager.connectSpoke(
          tenantId,
          provider,
          `${provider.charAt(0).toUpperCase() + provider.slice(1)} Spoke Connection`,
          account_label,
          scopes
        );

        return {
          status: 'success',
          message: `Successfully updated spoke credential for provider "${provider}" in tenant auth vault.`,
          credential: cred,
        };
      }

      default:
        throw new Error(`Tool "${toolName}" is not recognized by PlatformControlMcpServer.`);
    }
  }

  /**
   * Helper to generate MCP configuration snippets for IDEs (Claude Desktop, Cursor, Windsurf)
   */
  public static getIDEConfigurations(baseUrl: string, tenantId: string = 'tenant_enterprise_corp') {
    const cleanUrl = baseUrl.replace(/\/$/, '');
    const mcpEndpoint = `${cleanUrl}/api/mcp/platform?tenant_id=${tenantId}`;

    return {
      claudeDesktop: {
        mcpServers: {
          'platform-control': {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-sse', mcpEndpoint],
            env: {
              PLATFORM_TENANT_ID: tenantId,
            },
          },
        },
      },
      cursor: {
        mcp: {
          servers: {
            'platform-control': {
              url: mcpEndpoint,
              headers: {
                'x-tenant-id': tenantId,
              },
            },
          },
        },
      },
      windsurf: {
        mcpServers: {
          'platform-control': {
            url: mcpEndpoint,
            headers: {
              'x-tenant-id': tenantId,
            },
          },
        },
      },
    };
  }
}
