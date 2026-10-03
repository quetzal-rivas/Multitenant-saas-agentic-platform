import { McpTool } from './types';

export const PLATFORM_CONTROL_MCP_TOOLS: McpTool[] = [
  // --- Category A: Agent Team Blueprint Engineering ---
  {
    name: 'create_agent_profile',
    description: 'Creates a new Agent Team Profile Blueprint in PostgreSQL profiles store. Governs supervisor prompt, team name, and routing strategy for LangGraph multi-agent execution.',
    category: 'context-control',
    serverId: 'server-platform-control',
    serverName: 'Platform Control MCP Server',
    inputSchema: {
      type: 'object',
      properties: {
        tenant_id: {
          type: 'string',
          description: 'Tenant UUID or slug for isolation (default: tenant_enterprise_corp)',
          default: 'tenant_enterprise_corp',
        },
        name: {
          type: 'string',
          description: 'Human-readable title for the agent team blueprint (e.g., "Executive Operations Council", "Revenue Recovery Squad")',
        },
        supervisor_prompt: {
          type: 'string',
          description: 'High-level instructions and orchestration rules guiding the LangGraph Supervisor agent when routing turns.',
        },
        routing_strategy: {
          type: 'string',
          enum: ['supervisor_router', 'sequential_pipeline', 'consensus'],
          description: 'Graph routing pattern for inter-agent delegation.',
          default: 'supervisor_router',
        },
      },
      required: ['name', 'supervisor_prompt'],
    },
  },
  {
    name: 'attach_worker_to_profile',
    description: 'Inserts a specialized child worker node into an Agent Team Profile Blueprint, specifying persona role, custom system prompt, and allowed pre-authenticated MCP tools whitelist.',
    category: 'context-control',
    serverId: 'server-platform-control',
    serverName: 'Platform Control MCP Server',
    inputSchema: {
      type: 'object',
      properties: {
        profile_id: {
          type: 'string',
          description: 'Target profile ID or slug where the worker will be attached.',
        },
        worker_name: {
          type: 'string',
          description: 'Title for the worker (e.g. "CRM Specialist", "Billing Auditor", "Voice Escalator")',
        },
        role: {
          type: 'string',
          description: 'Functional domain role (e.g. "Lead Enrichment & CRM Operations")',
        },
        system_prompt: {
          type: 'string',
          description: 'Dedicated system instructions for this specialized agent node.',
        },
        mcp_tools: {
          type: 'array',
          items: { type: 'string' },
          description: 'Whitelisted pre-authenticated MCP tools available to this worker node (e.g. ["crm.add_lead", "slack_post_message", "postgres_read"]).',
        },
        skills: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional capability skills assigned to this node.',
        },
        avatar_icon: {
          type: 'string',
          description: 'Icon identifier (bot, user, zap, database, etc.)',
          default: 'bot',
        },
      },
      required: ['profile_id', 'worker_name', 'role', 'system_prompt', 'mcp_tools'],
    },
  },
  {
    name: 'list_team_blueprints',
    description: 'Lists all available Agent Team Profile Blueprints along with active worker node topologies, tool allocations, and routing rules.',
    category: 'context-control',
    serverId: 'server-platform-control',
    serverName: 'Platform Control MCP Server',
    inputSchema: {
      type: 'object',
      properties: {
        tenant_id: {
          type: 'string',
          description: 'Optional tenant filter.',
        },
      },
    },
  },

  // --- Category B: Durable Task Control (BullMQ Lifecycle) ---
  {
    name: 'schedule_deferred_task',
    description: 'Directly schedules an asynchronous background task into BullMQ and the Redis/Durable journal. Executes via local queue manager in < 5ms without external HTTP overhead. Accepts ISO 8601 targetTime and complete edgeCasePolicies fallback matrix.',
    category: 'context-control',
    serverId: 'server-platform-control',
    serverName: 'Platform Control MCP Server',
    inputSchema: {
      type: 'object',
      properties: {
        tenant_id: {
          type: 'string',
          description: 'Tenant ID for multi-tenant isolation.',
          default: 'tenant_enterprise_corp',
        },
        title: {
          type: 'string',
          description: 'Human-readable title describing the deferred background task.',
        },
        instructions: {
          type: 'string',
          description: 'Specific operational instructions for the autonomous agent when woken up at target time.',
        },
        targetTime: {
          type: 'string',
          description: 'Target execution timestamp in ISO 8601 format (e.g. "2026-09-28T14:00:00Z").',
        },
        toolsWhitelist: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of pre-authorized tools the agent can execute (e.g. ["gmail_send_message", "crm.update_deal"]).',
        },
        edgeCasePolicies: {
          type: 'object',
          properties: {
            on_failure: {
              type: 'string',
              enum: ['escalate', 'retry', 'abort'],
              default: 'escalate',
            },
            fallback_tool: {
              type: 'string',
              default: 'elevenlabs_trigger_call',
            },
            escalation_instructions: {
              type: 'string',
            },
            contact_overrides: {
              type: 'object',
              description: 'Key-value map of emergency contact escalations (e.g. {"boss": "+15554389021"}).',
            },
            max_retries: {
              type: 'number',
              default: 1,
            },
          },
          required: ['on_failure', 'escalation_instructions'],
        },
        profile_id: {
          type: 'string',
          description: 'Optional Team Blueprint ID or Agent Persona profile bound to this execution.',
        },
        simulate_failure: {
          type: 'boolean',
          description: 'Flag to test automated fallback and voice escalation pipelines.',
          default: false,
        },
      },
      required: ['title', 'instructions', 'targetTime', 'toolsWhitelist'],
    },
  },
  {
    name: 'cancel_deferred_task',
    description: 'Cancels an active or delayed background BullMQ job and updates its status in the durable PostgreSQL store.',
    category: 'context-control',
    serverId: 'server-platform-control',
    serverName: 'Platform Control MCP Server',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'Unique Task ID or job ID to cancel.',
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'list_scheduled_tasks',
    description: 'Queries active, queued, running, and completed tasks from the BullMQ queue and durable PostgreSQL state store.',
    category: 'context-control',
    serverId: 'server-platform-control',
    serverName: 'Platform Control MCP Server',
    inputSchema: {
      type: 'object',
      properties: {
        tenant_id: {
          type: 'string',
          description: 'Filter by tenant ID (defaults to all).',
        },
        status: {
          type: 'string',
          enum: ['ALL', 'SCHEDULED', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'ESCALATED', 'CANCELLED'],
          description: 'Filter by status.',
          default: 'ALL',
        },
      },
    },
  },
  {
    name: 'trigger_task_now',
    description: 'Forces immediate execution of a scheduled BullMQ task, bypassing remaining time delays for testing or manual intervention.',
    category: 'context-control',
    serverId: 'server-platform-control',
    serverName: 'Platform Control MCP Server',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'ID of the task to immediately promote and execute.',
        },
      },
      required: ['task_id'],
    },
  },

  // --- Category C: Database & State Store Governance ---
  {
    name: 'inspect_database_schema',
    description: 'Directly inspects the PostgreSQL / Supabase table architecture, schema definitions, row counts, and column types. Adheres to database/schema.sql.',
    category: 'database',
    serverId: 'server-platform-control',
    serverName: 'Platform Control MCP Server',
    inputSchema: {
      type: 'object',
      properties: {
        schema_name: {
          type: 'string',
          description: 'Target PostgreSQL schema (default: public).',
          default: 'public',
        },
      },
    },
  },
  {
    name: 'query_database_table',
    description: 'Reads rows from a platform relational table with automatic tenant_id isolation enforcement.',
    category: 'database',
    serverId: 'server-platform-control',
    serverName: 'Platform Control MCP Server',
    inputSchema: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          enum: ['tenants', 'profiles', 'profile_workers', 'thread_instances', 'tasks', 'tenant_vault', 'checkpoints'],
          description: 'Table name to query.',
        },
        tenant_id: {
          type: 'string',
          description: 'Tenant ID filter.',
          default: 'tenant_enterprise_corp',
        },
        limit: {
          type: 'number',
          description: 'Maximum records to return (max: 50).',
          default: 10,
        },
      },
      required: ['table'],
    },
  },

  // --- Category D: Auth Vault & Security Enforcement ---
  {
    name: 'view_tenant_vault_status',
    description: 'Checks the encrypted security vault credentials for a tenant. Returns connected spokes (HubSpot, Google Workspace, GitHub, Slack, Postgres), token expiration, and granted OAuth scopes without revealing raw decrypted secrets.',
    category: 'context-control',
    serverId: 'server-platform-control',
    serverName: 'Platform Control MCP Server',
    inputSchema: {
      type: 'object',
      properties: {
        tenant_id: {
          type: 'string',
          description: 'Tenant ID to inspect (default: tenant_enterprise_corp).',
          default: 'tenant_enterprise_corp',
        },
      },
    },
  },
  {
    name: 'update_tenant_spoke_auth',
    description: 'Connects or updates a pre-authenticated OAuth2 / API spoke credential inside the encrypted tenant vault.',
    category: 'context-control',
    serverId: 'server-platform-control',
    serverName: 'Platform Control MCP Server',
    inputSchema: {
      type: 'object',
      properties: {
        tenant_id: {
          type: 'string',
          description: 'Tenant UUID or slug.',
        },
        provider: {
          type: 'string',
          enum: ['hubspot', 'google_workspace', 'github', 'slack', 'notion', 'postgres', 'sendgrid'],
          description: 'Spoke service provider.',
        },
        account_label: {
          type: 'string',
          description: 'Account email or username identifier.',
        },
        scopes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Authorized OAuth scopes.',
        },
      },
      required: ['tenant_id', 'provider', 'account_label', 'scopes'],
    },
  },
];
