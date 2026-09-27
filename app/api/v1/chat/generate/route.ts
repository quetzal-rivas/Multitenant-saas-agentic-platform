export const dynamic = 'force-static';
import { NextRequest, NextResponse } from 'next/server';
import { checkpointManagerStore, CheckpointRecord } from '@/Backend/checkpoint-manager';
import { vaultManagerStore } from '@/Backend/vault-manager';
import { teamBlueprintManager } from '@/Backend/team-blueprint-manager';
import { McpProfileManager } from '@/Backend/profile-manager';
import { INITIAL_PROFILES } from '@/lib/mock-data';
import { GoogleGenAI } from '@google/genai';

// Pre-defined gateway persona configurations (legacy single personas)
const PERSONAS_CONFIG: Record<string, {
  name: string;
  role: string;
  spokes: string[];
  tools: {
    name: string;
    description: string;
    server: string;
    parameters: Record<string, any>;
  }[];
  directives: string;
}> = {
  sales_persona: {
    name: 'Universal Sales & CRM Agent',
    role: 'Enterprise Sales & Customer Relationship Manager',
    spokes: ['hubspot', 'google_workspace'],
    tools: [
      {
        name: 'hubspot_search_contact',
        description: 'Query HubSpot CRM leads and prospects by name, company, or email domain.',
        server: 'hubspot',
        parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      },
      {
        name: 'hubspot_update_deal_stage',
        description: 'Update deal stage, expected revenue, and close probability in CRM.',
        server: 'hubspot',
        parameters: { type: 'object', properties: { deal_id: { type: 'string' }, stage: { type: 'string' } }, required: ['deal_id', 'stage'] },
      },
      {
        name: 'gmail_send_draft',
        description: 'Prepare an executive follow-up email draft in Gmail.',
        server: 'google_workspace',
        parameters: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'subject', 'body'] },
      },
    ],
    directives: 'You are an elite enterprise Sales Executive. Keep communications crisp, metrics-driven, and value-oriented. Prioritize high-deal pipeline velocity.',
  },
  developer_persona: {
    name: 'Full-Stack Developer MCP Agent',
    role: 'Senior Systems Architect & Database Engineer',
    spokes: ['github', 'postgres'],
    tools: [
      {
        name: 'github_search_repositories',
        description: 'Search internal code repositories, pull requests, and commit logs.',
        server: 'github',
        parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      },
      {
        name: 'postgres_describe_table',
        description: 'Inspect PostgreSQL table schemas, column types, constraints, and indexes via Supavisor.',
        server: 'postgres',
        parameters: { type: 'object', properties: { table_name: { type: 'string' } }, required: ['table_name'] },
      },
      {
        name: 'postgres_execute_read_query',
        description: 'Execute read-only SQL queries against tenant database replica.',
        server: 'postgres',
        parameters: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] },
      },
    ],
    directives: 'You are a Senior Systems Architect. Emphasize strict data safety, zero SQL injection risks, and optimal latency. Never run destructive database mutations.',
  },
  support_persona: {
    name: 'Customer Support Specialist',
    role: 'Tier-3 Technical Support Engineer',
    spokes: ['slack', 'notion'],
    tools: [
      {
        name: 'notion_search_pages',
        description: 'Search product documentation, FAQs, and incident runbooks in Notion.',
        server: 'notion',
        parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      },
      {
        name: 'slack_post_incident_alert',
        description: 'Post an urgent incident summary or customer ticket to the internal Slack operations channel.',
        server: 'slack',
        parameters: { type: 'object', properties: { channel: { type: 'string' }, message: { type: 'string' } }, required: ['channel', 'message'] },
      },
    ],
    directives: 'You are an empathetic, rapid-response Customer Support Specialist. Provide actionable troubleshooting steps quoting verified knowledge documentation.',
  },
};

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    const { thread_id, tenant_id = 'tenant_enterprise_corp', profile_id = 'sales_persona', message } = body;

    if (!thread_id || !message) {
      return NextResponse.json(
        { error: 'Missing required parameters: thread_id and message are required.' },
        { status: 400 }
      );
    }

    // 1. Upstream Auth Vault: Check connected spokes for tenant
    const credentials = vaultManagerStore.getCredentials(tenant_id);
    const activeSpokes = credentials.filter((c) => c.isActive).map((c) => c.provider);

    // 2. Gateway Handshake: Dynamically compile tools based on Team Blueprint OR legacy persona
    const teamBlueprint = teamBlueprintManager.getProfile(profile_id);
    const isTeam = !!teamBlueprint;

    let profileDisplayName = '';
    let supervisorDirectives = '';
    let compiledTools: any[] = [];
    let activeWorker: { name: string; role: string; tools: string[] } | null = null;

    if (teamBlueprint) {
      profileDisplayName = teamBlueprint.name;
      supervisorDirectives = teamBlueprint.supervisorPrompt || '';

      // If supervisor has an assigned Context Profile, incorporate its guidelines
      if (teamBlueprint.supervisorContextProfileSlug) {
        const supCtx = INITIAL_PROFILES.find((p) => p.slug === teamBlueprint.supervisorContextProfileSlug || p.id === teamBlueprint.supervisorContextProfileSlug);
        if (supCtx) {
          const sysStep = supCtx.pipeline.find((s) => s.type === 'system_instructions' || s.type === 'policy');
          if (sysStep?.config.staticContent) {
            supervisorDirectives += `\n[Context Profile Directives: ${supCtx.name}]\n${sysStep.config.staticContent}`;
          }
        }
      }

      // Compile tools across all assigned team workers that are pre-authenticated
      const allTenantTools = teamBlueprintManager.getTenantAuthenticatedTools(tenant_id);
      const workerToolsMap = new Map<string, any>();

      // Also include supervisor skills/tools if assigned
      if (teamBlueprint.supervisorSkills && teamBlueprint.supervisorSkills.length > 0) {
        teamBlueprint.supervisorSkills.forEach((skillId) => {
          const matchedTool = allTenantTools.find((t) => t.id === skillId || t.name === skillId);
          if (matchedTool && activeSpokes.includes(matchedTool.spoke as any)) {
            workerToolsMap.set(matchedTool.id, {
              name: matchedTool.name,
              description: matchedTool.description,
              server: matchedTool.spoke,
              parameters: matchedTool.parameters,
              workerAssigned: 'Supervisor Router',
            });
          }
        });
      }

      teamBlueprint.workers.forEach((w) => {
        // Collect explicit tool ids / skills
        const toolIds = [...(w.skills || []), ...(w.mcpTools || [])];

        // Also resolve tools from assigned MCP Server Profile
        if (w.mcpProfileId) {
          const mcpProf = McpProfileManager.listProfiles().find((p) => p.id === w.mcpProfileId || p.slug === w.mcpProfileId);
          if (mcpProf) {
            mcpProf.selectedToolNames.forEach((tName) => {
              // Map tool names or add directly
              const matched = allTenantTools.find((t) => t.id === tName || t.name === tName);
              if (matched) {
                toolIds.push(matched.id);
              }
            });
          }
        }

        toolIds.forEach((toolId) => {
          const matchedTool = allTenantTools.find((t) => t.id === toolId);
          if (matchedTool && activeSpokes.includes(matchedTool.spoke as any)) {
            workerToolsMap.set(matchedTool.id, {
              name: matchedTool.name,
              description: matchedTool.description,
              server: matchedTool.spoke,
              parameters: matchedTool.parameters,
              workerAssigned: w.name,
            });
          }
        });
      });

      compiledTools = Array.from(workerToolsMap.values());
    } else {
      const persona = PERSONAS_CONFIG[profile_id] || PERSONAS_CONFIG.sales_persona;
      profileDisplayName = persona.name;
      supervisorDirectives = persona.directives;
      compiledTools = persona.tools.filter((t) => activeSpokes.includes(t.server as any));
    }

    const toolNames = compiledTools.map((t) => t.name);

    // 3. Hydrate state from PostgresSaver checkpoints
    const existingCheckpoints = checkpointManagerStore.getThreadCheckpoints(thread_id);
    const stepIndex = existingCheckpoints.length + 1;
    const checkpointId = `chk_${Date.now()}_${stepIndex}`;

    // Record activity in thread instance manager
    teamBlueprintManager.recordInstanceActivity(thread_id);

    // 4. Multi-Agent Supervisor Routing & MCP Tool Execution
    const executedTools: {
      toolName: string;
      serverProvider: string;
      arguments: Record<string, any>;
      output: any;
      latencyMs: number;
      assignedWorker?: string;
    }[] = [];

    const lowerMsg = message.toLowerCase();

    if (isTeam && teamBlueprint) {
      // The Supervisor analyzes the query and dispatches to the most qualified worker
      if (lowerMsg.includes('invoice') || lowerMsg.includes('stripe') || lowerMsg.includes('pay') || lowerMsg.includes('balance') || lowerMsg.includes('refund') || lowerMsg.includes('bill')) {
        const billingWorker = teamBlueprint.workers.find((w) => w.name.toLowerCase().includes('billing')) || teamBlueprint.workers[1] || teamBlueprint.workers[0];
        activeWorker = { name: billingWorker.name, role: billingWorker.role, tools: billingWorker.mcpTools };

        executedTools.push({
          toolName: 'stripe.get_invoice',
          serverProvider: 'stripe',
          assignedWorker: billingWorker.name,
          arguments: { invoice_id: 'inv_corp_8921', tenant_id },
          output: {
            invoice_id: 'inv_corp_8921',
            customer: 'Acme Corp / Marcus Vance',
            total_cents: 4800000,
            formatted_amount: '$48,000.00 USD',
            status: 'open',
            due_date: '2026-10-15',
            line_items: [{ item: 'Enterprise AI Suite License (Annual)', qty: 1, unit_amount: 48000 }],
          },
          latencyMs: 38.2,
        });
      } else if (lowerMsg.includes('database') || lowerMsg.includes('postgres') || lowerMsg.includes('replica') || lowerMsg.includes('table') || lowerMsg.includes('night audit')) {
        const dbWorker = teamBlueprint.workers.find((w) => w.name.toLowerCase().includes('database') || w.name.toLowerCase().includes('auditor')) || teamBlueprint.workers[0];
        activeWorker = { name: dbWorker.name, role: dbWorker.role, tools: dbWorker.mcpTools };

        executedTools.push({
          toolName: 'postgres.describe_table',
          serverProvider: 'postgres',
          assignedWorker: dbWorker.name,
          arguments: { table_name: 'public.profiles' },
          output: {
            table: 'public.profiles',
            columns: ['id (UUID, PK)', 'tenant_id (UUID)', 'name (TEXT)', 'supervisor_prompt (TEXT)', 'routing_strategy (VARCHAR)'],
            indexes: ['profiles_pkey', 'idx_profiles_tenant'],
            rls_enabled: true,
            pool: 'Supavisor :5432 (Transaction Mode)',
          },
          latencyMs: 27.6,
        });
      } else if (lowerMsg.includes('slack') || lowerMsg.includes('alert') || lowerMsg.includes('incident') || lowerMsg.includes('notify') || lowerMsg.includes('escalat')) {
        const alertWorker = teamBlueprint.workers.find((w) => w.name.toLowerCase().includes('alert') || w.name.toLowerCase().includes('incident') || w.name.toLowerCase().includes('dispatcher')) || teamBlueprint.workers[0];
        activeWorker = { name: alertWorker.name, role: alertWorker.role, tools: alertWorker.mcpTools };

        executedTools.push({
          toolName: 'slack.post_incident_alert',
          serverProvider: 'slack',
          assignedWorker: alertWorker.name,
          arguments: { channel: '#ops-executive-triage', message: `Supervisor automated alert: ${message}` },
          output: {
            status: 'dispatched',
            channel: '#ops-executive-triage',
            message_ts: `${Date.now()}.000100`,
            delivered: true,
          },
          latencyMs: 31.4,
        });
      } else {
        // Default to lead / CRM Specialist
        const crmWorker = teamBlueprint.workers.find((w) => w.name.toLowerCase().includes('crm') || w.name.toLowerCase().includes('lead') || w.name.toLowerCase().includes('sales')) || teamBlueprint.workers[0];
        activeWorker = { name: crmWorker.name, role: crmWorker.role, tools: crmWorker.mcpTools };

        executedTools.push({
          toolName: 'crm.search_contact',
          serverProvider: 'hubspot',
          assignedWorker: crmWorker.name,
          arguments: { query: message },
          output: {
            lead_id: 'hs_94821',
            contact: 'Marcus Vance',
            organization: 'Vance Logistics Corp',
            deal_stage: 'Qualified - Hot Lead',
            pipeline_value: '$48,000 ARR',
            last_activity: 'Incoming voice call routed to Front Desk team',
          },
          latencyMs: 39.5,
        });
      }
    } else {
      // Legacy single persona fallback
      if (lowerMsg.includes('lead') || lowerMsg.includes('crm') || lowerMsg.includes('vance') || lowerMsg.includes('deal')) {
        executedTools.push({
          toolName: 'hubspot_search_contact',
          serverProvider: 'hubspot',
          arguments: { query: message },
          output: {
            lead_id: 'hs_94821',
            contact: 'Marcus Vance',
            organization: 'Vance Logistics Corp',
            deal_stage: 'Qualified - Hot Lead',
            pipeline_value: '$48,000 ARR',
          },
          latencyMs: 38.4,
        });
      } else if (lowerMsg.includes('email') || lowerMsg.includes('draft') || lowerMsg.includes('send') || lowerMsg.includes('follow up')) {
        executedTools.push({
          toolName: 'gmail_send_draft',
          serverProvider: 'google_workspace',
          arguments: {
            to: 'm.vance@vancelogistics.com',
            subject: 'Next Steps - Follow Up',
            body: 'Summary from call transcript.',
          },
          output: {
            draft_id: 'draft_gm_9921',
            status: 'draft_created',
          },
          latencyMs: 44.1,
        });
      } else if (lowerMsg.includes('schema') || lowerMsg.includes('table') || lowerMsg.includes('postgres') || lowerMsg.includes('sql')) {
        executedTools.push({
          toolName: 'postgres_describe_table',
          serverProvider: 'postgres',
          arguments: { table_name: 'tenants' },
          output: {
            table: 'public.tenants',
            columns: ['id (UUID, PK)', 'slug (VARCHAR)', 'name (VARCHAR)', 'tier (VARCHAR)'],
            rls_enabled: true,
          },
          latencyMs: 29.8,
        });
      }
    }

    // 5. Generate grounded response (Gemini API or intelligent deterministic fallback)
    let assistantMessage = '';
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (geminiApiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const systemPrompt = isTeam
          ? `
You are the Supervisor for the "${profileDisplayName}" Agent Team running within an enterprise LangGraph worker loop.
Supervisor Directives: ${supervisorDirectives}
Active Dispatched Worker: ${activeWorker ? `${activeWorker.name} (${activeWorker.role})` : 'Supervisor Direct Handling'}
Pre-authenticated MCP Tools for this team:
${JSON.stringify(compiledTools, null, 2)}

Tool executions performed during this turn:
${JSON.stringify(executedTools, null, 2)}

Synthesize the worker's execution findings and provide a professional, authoritative executive response.
Always acknowledge the supervisor's routing decision, state which specialist was deployed, and state the verified result.
Never leak raw API secrets.
`.trim()
          : `
You are an autonomous AI Agent running within an enterprise LangGraph worker loop.
Your active persona: "${profileDisplayName}".
Directives: ${supervisorDirectives}
Your pre-authenticated Gateway tools for tenant "${tenant_id}":
${JSON.stringify(compiledTools, null, 2)}

Tool executions performed during this turn:
${JSON.stringify(executedTools, null, 2)}

Provide a concise, professional, and helpful response addressing the user's message.
Reference tool outputs if present. DO NOT reveal API keys or raw credentials.
`.trim();

        // Build brief history context from checkpoints
        const historySnippets = existingCheckpoints.slice(-4).map((c) => 
          `[Profile: ${c.profileName}]\nUser: ${c.userMessage}\nAssistant: ${c.assistantMessage}`
        ).join('\n\n');

        const fullPrompt = `${systemPrompt}\n\n=== Conversation History ===\n${historySnippets}\n\nCurrent User Query: "${message}"\n\nResponse:`;

        const res = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: fullPrompt,
        });

        assistantMessage = res.text || '';
      } catch (geminiErr) {
        console.warn('Gemini API call failed, falling back to local deterministic generation:', geminiErr);
      }
    }

    // Fallback if Gemini not available or failed
    if (!assistantMessage) {
      if (isTeam && teamBlueprint) {
        const workerName = activeWorker ? activeWorker.name : 'Team Worker';
        if (executedTools.length > 0) {
          const tool = executedTools[0];
          assistantMessage = `**[Supervisor Routing Decision]** Based on team directives, I routed the inquiry to **${workerName}**.\n\n**${workerName} Action Executed:**\n- **Gateway Tool**: \`${tool.toolName}\` on \`${tool.serverProvider}\`\n- **Live Verification**: \n\`\`\`json\n${JSON.stringify(tool.output, null, 2)}\n\`\`\`\n\n**Supervisor Checkpoint**: The state update has been committed to PostgresSaver thread \`${thread_id}\` under blueprint \`${teamBlueprint.name}\`.`;
        } else {
          assistantMessage = `**[Supervisor Active]** Standby for the **${teamBlueprint.name}** team. Assigned staff: ${teamBlueprint.workers.map((w) => `**${w.name}** (${w.role})`).join(', ')}. Directives: "${teamBlueprint.supervisorPrompt}". Regarding: "${message}", how can our automated team assist?`;
        }
      } else {
        if (executedTools.length > 0) {
          const tool = executedTools[0];
          assistantMessage = `Operating as **${profileDisplayName}**, I executed the gateway tool **\`${tool.toolName}\`** on **${tool.serverProvider}** with zero credential exposure. \n\n**Tool Output:**\n\`\`\`json\n${JSON.stringify(tool.output, null, 2)}\n\`\`\`\n\nThis action has been indexed in LangGraph's **PostgresSaver** memory thread \`${thread_id}\` under tenant \`${tenant_id}\`.`;
        } else {
          assistantMessage = `I am active as **${profileDisplayName}** for tenant \`${tenant_id}\`. I have access to ${compiledTools.length} pre-authenticated tools from the MCP Gateway: ${toolNames.map((t) => `\`${t}\``).join(', ')}.\n\nRegarding: "${message}", let me know if you would like me to query live CRM data, search database schemas, inspect repositories, or draft communications!`;
        }
      }
    }

    // 6. Save Checkpoint to PostgresSaver state manager
    const newCheckpoint: CheckpointRecord = {
      checkpointId,
      threadId: thread_id,
      tenantId: tenant_id,
      profileId: profile_id,
      profileName: profileDisplayName,
      stepIndex,
      userMessage: message,
      assistantMessage,
      toolsExecuted: executedTools,
      compiledToolsCount: compiledTools.length,
      compiledToolsNames: toolNames,
      metadata: {
        checkpointNs: '',
        parentCheckpointId: existingCheckpoints[existingCheckpoints.length - 1]?.checkpointId,
        executionTimeMs: Date.now() - startTime,
        slidingWindowCount: existingCheckpoints.length + 1,
        hubVersion: 'mcp-gateway-v2.4',
        isTeamBlueprint: isTeam,
        activeWorker: activeWorker?.name,
      },
      timestamp: new Date().toISOString(),
    };

    checkpointManagerStore.appendCheckpoint(newCheckpoint);

    // 7. Return unified response to frontend
    return NextResponse.json({
      thread_id,
      tenant_id,
      profile_id,
      profile_name: profileDisplayName,
      is_team_blueprint: isTeam,
      active_worker: activeWorker ? activeWorker.name : null,
      checkpoint_id: checkpointId,
      message: assistantMessage,
      role: 'assistant',
      compiled_tools_count: compiledTools.length,
      compiled_tools_names: toolNames,
      tool_executions: executedTools,
      metadata: {
        step: stepIndex,
        total_checkpoints: existingCheckpoints.length + 1,
        execution_time_ms: Date.now() - startTime,
        checkpointer: 'PostgresSaver (Supabase :5432)',
      },
      timestamp: newCheckpoint.timestamp,
    });
  } catch (error: any) {
    console.error('Error generating chat turn:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error in generation pipeline' },
      { status: 500 }
    );
  }
}
