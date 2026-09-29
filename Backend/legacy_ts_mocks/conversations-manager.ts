/**
 * Backend/conversations-manager.ts
 * 
 * Central Store & Engine for Multi-Tenant Conversations & Threads:
 * - Single Agent Sessions (Vertical Chat Transcripts)
 * - Multi-Agent Teams (LangGraph Orchestration with Worker Tool Execution History)
 * - ElevenLabs Voice Calls (Audio Playback, Speech Turn Offsets, STT/TTS Telemetry & Metadata)
 */

export type ConversationType = 'single_agent' | 'team' | 'voice_call';
export type ConversationStatus = 'ongoing' | 'completed' | 'escalated' | 'failed';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'caller' | 'voice_agent';
  content: string;
  timestamp: string;
  // Timing attributes for voice and audio sync
  audioOffsetSec?: number;
  durationSec?: number;
  // Multi-agent attribution
  workerId?: string;
  workerName?: string;
  workerAvatar?: string;
  workerColor?: string;
  // Telemetry
  tokensUsed?: number;
  latencyMs?: number;
  sentiment?: 'positive' | 'neutral' | 'negative' | 'urgent';
  interruption?: boolean;
}

export interface WorkerToolExecution {
  id: string;
  stepIndex: number;
  timestamp: string;
  workerId: string;
  workerName: string;
  workerRole: string;
  toolName: string;
  mcpProvider: string;
  latencyMs: number;
  status: 'success' | 'failed' | 'running';
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  decisionRationale?: string;
}

export interface VoiceCallMetadata {
  elevenLabsVoiceId: string;
  elevenLabsVoiceName: string;
  elevenLabsModel: string;
  callerPhone: string;
  agentPhone: string;
  callerName?: string;
  callDurationSeconds: number;
  formattedDuration: string;
  turnTakingLatencyMs: number;
  speechToSpeechLatencyMs: number;
  totalCostEstimate: string;
  sentimentScore: string;
  terminationReason: string;
  audioCodec: string;
  sampleRate: string;
  packetLossPercent: number;
  interruptionsCount: number;
  detectedIntent: string;
  fallbackTriggered: boolean;
  notes?: string;
}

export interface ConversationRecord {
  id: string;
  threadId: string;
  title: string;
  type: ConversationType;
  status: ConversationStatus;
  startedAt: string;
  updatedAt: string;
  tenantId: string;
  channel: 'web_chat' | 'elevenlabs_voice' | 'slack_bot' | 'api_gateway';
  
  // Single Agent Profile Details
  agentProfile?: {
    id: string;
    name: string;
    role: string;
    avatar: string;
    model: string;
    systemPromptVersion: string;
  };

  // Team Details
  teamDetails?: {
    teamId: string;
    teamName: string;
    supervisorName: string;
    activeWorkersCount: number;
    workers: {
      id: string;
      name: string;
      role: string;
      color: string;
      mcpToolsCount: number;
    }[];
  };

  // Voice Details
  voiceMetadata?: VoiceCallMetadata;

  // Transcripts & Execution History
  messages: ConversationMessage[];
  teamToolHistory?: WorkerToolExecution[];
}

export class ConversationsManager {
  private conversations: Map<string, ConversationRecord> = new Map();

  constructor() {
    this.seedInitialConversations();
  }

  private seedInitialConversations() {
    const now = Date.now();
    const min = 60 * 1000;
    const hour = 60 * min;

    // 1. Single Agent - Ongoing: DevOps & Security Code Auditor
    const singleOngoing: ConversationRecord = {
      id: 'conv_single_001',
      threadId: 'th_agent_devops_audit_904',
      title: 'DevOps & Terraform Security Audit',
      type: 'single_agent',
      status: 'ongoing',
      startedAt: new Date(now - 14 * min).toISOString(),
      updatedAt: new Date(now - 2 * min).toISOString(),
      tenantId: 'tenant_enterprise_corp',
      channel: 'web_chat',
      agentProfile: {
        id: 'devops_auditor_persona',
        name: 'SecOps Cloud Auditor',
        role: 'Infrastructure & IAM Security Specialist',
        avatar: '🛡️',
        model: 'Gemini 2.5 Flash (Context Compiler v3.1)',
        systemPromptVersion: 'prompt_secops_v2.4',
      },
      messages: [
        {
          id: 'msg_so_01',
          role: 'user',
          content: 'We need to audit our AWS S3 terraform configuration before deploying to us-east-1. Can you scan for public read policies and unencrypted buckets?',
          timestamp: new Date(now - 14 * min).toISOString(),
        },
        {
          id: 'msg_so_02',
          role: 'assistant',
          content: 'Analyzing your HCL Terraform manifests using our AWS MCP inspection provider. Checking:\n\n1. `aws_s3_bucket_public_access_block` configuration.\n2. Server-side encryption enforcement (`aws:kms` or `AES256`).\n3. Bucket ACLs preventing `public-read` / `authenticated-read`.\n\nEverything looks solid except module `s3_telemetry_logs`: it is missing `restrict_public_buckets = true`. Would you like me to auto-generate the remediated HCL block?',
          timestamp: new Date(now - 13 * min).toISOString(),
          tokensUsed: 420,
          latencyMs: 310,
        },
        {
          id: 'msg_so_03',
          role: 'user',
          content: 'Yes please, generate the snippet and check if KMS customer-managed keys (CMK) are required by our corporate compliance policy.',
          timestamp: new Date(now - 5 * min).toISOString(),
        },
        {
          id: 'msg_so_04',
          role: 'assistant',
          content: 'Here is the remediated Terraform module with strict KMS CMK encryption and public block rules:\n\n```hcl\nresource "aws_s3_bucket_public_access_block" "telemetry_block" {\n  bucket = aws_s3_bucket.telemetry.id\n  block_public_acls       = true\n  block_public_policy     = true\n  ignore_public_acls      = true\n  restrict_public_buckets = true\n}\n\nresource "aws_s3_bucket_server_side_encryption_configuration" "telemetry_crypto" {\n  bucket = aws_s3_bucket.telemetry.id\n  rule {\n    apply_server_side_encryption_by_default {\n      kms_master_key_id = aws_kms_key.compliance_cmk.arn\n      sse_algorithm     = "aws:kms"\n    }\n  }\n}\n```\n\nPer Corporate ISO-27001 standard section 4.2, customer-managed keys are mandatory for all production buckets.',
          timestamp: new Date(now - 2 * min).toISOString(),
          tokensUsed: 615,
          latencyMs: 290,
        },
      ],
    };

    // 2. Single Agent - Completed: Customer Support Agent
    const singleCompleted: ConversationRecord = {
      id: 'conv_single_002',
      threadId: 'th_agent_support_sso_112',
      title: 'Okta SAML SSO Timeout Triage',
      type: 'single_agent',
      status: 'completed',
      startedAt: new Date(now - 3 * hour).toISOString(),
      updatedAt: new Date(now - 2 * hour - 40 * min).toISOString(),
      tenantId: 'tenant_enterprise_corp',
      channel: 'web_chat',
      agentProfile: {
        id: 'support_tier2_persona',
        name: 'Tier-2 Technical Support Agent',
        role: 'Identity & Authentication Specialist',
        avatar: '🎧',
        model: 'Gemini 2.5 Flash',
        systemPromptVersion: 'prompt_support_v3.0',
      },
      messages: [
        {
          id: 'msg_sc_01',
          role: 'user',
          content: 'One of our enterprise users reported an error `Invalid SAML Response Signature - Cert Expired` when logging into the dashboard via Okta.',
          timestamp: new Date(now - 3 * hour).toISOString(),
        },
        {
          id: 'msg_sc_02',
          role: 'assistant',
          content: 'This error occurs when the X.509 signing certificate in your Okta SAML application settings does not match the active public certificate configured in our Supabase auth tenant.\n\nLet me query the Auth Vault for your tenant metadata.\n\n* Found Certificate Fingerprint: `4A:8B:12:...:F9` (Expired yesterday at 23:59 UTC).\n* Secondary Certificate: Available and valid until 2028.',
          timestamp: new Date(now - 2 * hour - 55 * min).toISOString(),
          tokensUsed: 380,
          latencyMs: 240,
        },
        {
          id: 'msg_sc_03',
          role: 'user',
          content: 'Can you rotate it to the secondary certificate immediately?',
          timestamp: new Date(now - 2 * hour - 45 * min).toISOString(),
        },
        {
          id: 'msg_sc_04',
          role: 'assistant',
          content: '✅ Primary certificate successfully rolled over to secondary cert `valid_thru_2028`. Tested SAML assertion loop: response returned HTTP 200 OK with authenticated user context. Issue is fully resolved!',
          timestamp: new Date(now - 2 * hour - 40 * min).toISOString(),
          tokensUsed: 290,
          latencyMs: 180,
        },
      ],
    };

    // 3. Multi-Agent Team - Ongoing: Enterprise Sales & Pipeline Deal Closer
    const teamOngoing: ConversationRecord = {
      id: 'conv_team_001',
      threadId: 'th_team_sales_dealclose_404',
      title: 'Enterprise Q3 Deal Closing & Contract Customization',
      type: 'team',
      status: 'ongoing',
      startedAt: new Date(now - 22 * min).toISOString(),
      updatedAt: new Date(now - 1 * min).toISOString(),
      tenantId: 'tenant_enterprise_corp',
      channel: 'web_chat',
      teamDetails: {
        teamId: 'team_sales_swarm',
        teamName: 'Enterprise Deal Acceleration Swarm',
        supervisorName: 'LangGraph Chief Deal Orchestrator',
        activeWorkersCount: 3,
        workers: [
          { id: 'worker_crm', name: 'CRM Specialist', role: 'HubSpot & Salesforce Lead Sync', color: '#10b981', mcpToolsCount: 4 },
          { id: 'worker_pricing', name: 'Financial Engine', role: 'Stripe Tier & Volume Discount Calculator', color: '#8b5cf6', mcpToolsCount: 3 },
          { id: 'worker_legal', name: 'Legal & Doc Drafter', role: 'Google Docs & NDA Template Generator', color: '#06b6d4', mcpToolsCount: 3 },
        ],
      },
      messages: [
        {
          id: 'msg_to_01',
          role: 'user',
          content: 'Vance Logistics Corp requested an enterprise proposal for 250 seats with custom 99.99% SLA and net-45 billing terms. Let us pull their CRM stage, compute pricing, and generate the contract draft.',
          timestamp: new Date(now - 22 * min).toISOString(),
        },
        {
          id: 'msg_to_02',
          role: 'assistant',
          workerId: 'worker_supervisor',
          workerName: 'LangGraph Supervisor',
          workerAvatar: '🧠',
          workerColor: '#f59e0b',
          content: 'Supervisor routing execution plan:\n\n1. Delegating to **CRM Specialist** to pull Marcus Vance\'s account profile and interaction history.\n2. Delegating to **Financial Engine** to calculate 250-seat tiered ARR with volume discounts.\n3. Delegating to **Legal Drafter** to compose the custom MSA with 99.99% uptime SLA.',
          timestamp: new Date(now - 20 * min).toISOString(),
        },
        {
          id: 'msg_to_03',
          role: 'assistant',
          workerId: 'worker_crm',
          workerName: 'CRM Specialist',
          workerAvatar: '📊',
          workerColor: '#10b981',
          content: 'Contact verified in HubSpot CRM:\n- **Contact**: Marcus Vance (VP Operations, Vance Logistics Corp)\n- **Current Tier**: Pilot POC (Trial ending in 4 days)\n- **Opportunity Value**: $75,000 baseline\n- **Notes**: Requested Net-45 invoices and SOC2 Type II compliance audit packet.',
          timestamp: new Date(now - 17 * min).toISOString(),
        },
        {
          id: 'msg_to_04',
          role: 'assistant',
          workerId: 'worker_pricing',
          workerName: 'Financial Engine',
          workerAvatar: '💳',
          workerColor: '#8b5cf6',
          content: 'Pricing matrix calculated via Stripe Enterprise Engine:\n- Base 250 Seats @ $28/seat/mo = $84,000/yr\n- Volume Tier 200+ Discount (15%): -$12,600/yr\n- Mission-Critical 99.99% SLA Addon: +$8,000/yr\n- **Final Proposed ARR**: **$79,400 / year** ($6,616.67 billed monthly on Net-45 terms).',
          timestamp: new Date(now - 12 * min).toISOString(),
        },
        {
          id: 'msg_to_05',
          role: 'assistant',
          workerId: 'worker_legal',
          workerName: 'Legal & Doc Drafter',
          workerAvatar: '📝',
          workerColor: '#06b6d4',
          content: 'Generated Google Workspace Contract Draft: **"MSA-VanceLogistics-2026-Q3-v1"**.\n- Embedded 99.99% SLA schedule with 10% monthly credit remedy.\n- Inserted Net-45 payment terms.\n- Staged in Google Drive folder `Enterprise Contracts / Pending Signature`.',
          timestamp: new Date(now - 3 * min).toISOString(),
        },
      ],
      teamToolHistory: [
        {
          id: 'tool_exec_01',
          stepIndex: 1,
          timestamp: new Date(now - 19 * min).toISOString(),
          workerId: 'worker_crm',
          workerName: 'CRM Specialist',
          workerRole: 'HubSpot Integration',
          toolName: 'hubspot_get_contact_by_company',
          mcpProvider: 'hubspot_mcp',
          latencyMs: 54,
          status: 'success',
          decisionRationale: 'Supervisor routed customer identifier to CRM Specialist to retrieve account lead stage and deal attributes.',
          inputs: { company_name: 'Vance Logistics Corp', include_timeline: true },
          outputs: {
            id: 'hs_vance_881',
            contact: 'Marcus Vance',
            title: 'VP Operations',
            email: 'm.vance@vancelogistics.com',
            deal_stage: 'Evaluation/Demo Done',
            poc_users: 15,
          },
        },
        {
          id: 'tool_exec_02',
          stepIndex: 2,
          timestamp: new Date(now - 15 * min).toISOString(),
          workerId: 'worker_pricing',
          workerName: 'Financial Engine',
          workerRole: 'Stripe Calculator',
          toolName: 'stripe_calculate_enterprise_quote',
          mcpProvider: 'stripe_mcp',
          latencyMs: 78,
          status: 'success',
          decisionRationale: 'Calculated 250 seats with 15% enterprise volume tier and 99.99% SLA line item.',
          inputs: { seats: 250, term_months: 12, billing_terms: 'net_45', custom_sla: '99.99' },
          outputs: {
            quote_id: 'qt_stripe_9921_arr',
            annual_total: 79400,
            monthly_amortized: 6616.67,
            currency: 'USD',
            discount_code: 'VOL_ENTERPRISE_15',
          },
        },
        {
          id: 'tool_exec_03',
          stepIndex: 3,
          timestamp: new Date(now - 5 * min).toISOString(),
          workerId: 'worker_legal',
          workerName: 'Legal & Doc Drafter',
          workerRole: 'Google Workspace Docs',
          toolName: 'google_docs_create_contract',
          mcpProvider: 'google_workspace_mcp',
          latencyMs: 132,
          status: 'success',
          decisionRationale: 'Spawned custom Master Services Agreement with populated company details, SLA schedule, and payment clauses.',
          inputs: {
            title: 'MSA - Vance Logistics Corp',
            template_id: 'tmpl_enterprise_msa_2026',
            variables: { company: 'Vance Logistics Corp', arr: '$79,400', sla: '99.99%', payment_terms: 'Net-45' },
          },
          outputs: {
            document_id: 'doc_gdrive_449219',
            url: 'https://docs.google.com/document/d/doc_gdrive_449219/edit',
            version: 1,
          },
        },
      ],
    };

    // 4. Multi-Agent Team - Completed: SRE & Incident Response Swarm
    const teamCompleted: ConversationRecord = {
      id: 'conv_team_002',
      threadId: 'th_team_incident_response_102',
      title: 'P1 Database Connection Pool Exhaustion Swarm',
      type: 'team',
      status: 'completed',
      startedAt: new Date(now - 6 * hour).toISOString(),
      updatedAt: new Date(now - 5 * hour - 10 * min).toISOString(),
      tenantId: 'tenant_enterprise_corp',
      channel: 'web_chat',
      teamDetails: {
        teamId: 'team_sre_swarm',
        teamName: 'SRE Emergency Response Swarm',
        supervisorName: 'Incident Commander Agent',
        activeWorkersCount: 2,
        workers: [
          { id: 'worker_telemetry', name: 'Log & Datadog Specialist', role: 'Real-time Metrics & Slow Query Analyzer', color: '#ef4444', mcpToolsCount: 4 },
          { id: 'worker_infra', name: 'RDS & Kubernetes Operator', role: 'Auto-Scaler & Connection Pool Recycler', color: '#3b82f6', mcpToolsCount: 3 },
        ],
      },
      messages: [
        {
          id: 'msg_tc_01',
          role: 'user',
          content: 'Alert received: PostgreSQL pool exhaustion on tenant cluster `db-us-east-1a`. Latency spiked from 12ms to 1,400ms.',
          timestamp: new Date(now - 6 * hour).toISOString(),
        },
        {
          id: 'msg_tc_02',
          role: 'assistant',
          workerId: 'worker_telemetry',
          workerName: 'Log & Datadog Specialist',
          workerAvatar: '📈',
          workerColor: '#ef4444',
          content: 'Identified 3 unindexed analytical queries running on table `tenant_audit_events` holding 85 open connections.',
          timestamp: new Date(now - 5 * hour - 50 * min).toISOString(),
        },
        {
          id: 'msg_tc_03',
          role: 'assistant',
          workerId: 'worker_infra',
          workerName: 'RDS & Kubernetes Operator',
          workerAvatar: '☸️',
          workerColor: '#3b82f6',
          content: 'Terminated offending queries via `pg_terminate_backend`. Scaled PgBouncer connection max pool from 100 to 250. P99 latency recovered to 14ms.',
          timestamp: new Date(now - 5 * hour - 10 * min).toISOString(),
        },
      ],
      teamToolHistory: [
        {
          id: 'tool_sre_01',
          stepIndex: 1,
          timestamp: new Date(now - 5 * hour - 55 * min).toISOString(),
          workerId: 'worker_telemetry',
          workerName: 'Log & Datadog Specialist',
          workerRole: 'Datadog MCP',
          toolName: 'datadog_query_slow_transactions',
          mcpProvider: 'datadog_mcp',
          latencyMs: 92,
          status: 'success',
          decisionRationale: 'Inspected active lock contention and top 5 longest running SQL statements in Postgres cluster.',
          inputs: { cluster_id: 'db-us-east-1a', min_duration_sec: 30 },
          outputs: { slow_queries_count: 3, offending_pid_list: [10482, 10483, 10485] },
        },
        {
          id: 'tool_sre_02',
          stepIndex: 2,
          timestamp: new Date(now - 5 * hour - 20 * min).toISOString(),
          workerId: 'worker_infra',
          workerName: 'RDS & Kubernetes Operator',
          workerRole: 'AWS RDS MCP',
          toolName: 'rds_kill_pid_and_scale_pgbouncer',
          mcpProvider: 'aws_rds_mcp',
          latencyMs: 145,
          status: 'success',
          decisionRationale: 'Released pool locks and bumped PgBouncer connection ceiling with zero service restart.',
          inputs: { pids: [10482, 10483, 10485], pool_size: 250 },
          outputs: { terminated: true, active_connections: 34, status: 'HEALTHY' },
        },
      ],
    };

    // 5. Voice Call - Completed: Rachel (ElevenLabs Multilingual Agent)
    const voiceCompleted: ConversationRecord = {
      id: 'conv_voice_001',
      threadId: 'th_voice_eleven_rachel_712',
      title: 'ElevenLabs Voice Call: Enterprise SLA & Support Inbound',
      type: 'voice_call',
      status: 'completed',
      startedAt: new Date(now - 55 * min).toISOString(),
      updatedAt: new Date(now - 48 * min).toISOString(),
      tenantId: 'tenant_enterprise_corp',
      channel: 'elevenlabs_voice',
      voiceMetadata: {
        elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
        elevenLabsVoiceName: 'Rachel (ElevenLabs Turbo v2.5)',
        elevenLabsModel: 'eleven_multilingual_v2',
        callerPhone: '+1 (415) 890-2419',
        agentPhone: '+1 (800) 555-0199',
        callerName: 'Sarah Jenkins (VP Tech, FinScale Inc)',
        callDurationSeconds: 224,
        formattedDuration: '03:44',
        turnTakingLatencyMs: 185,
        speechToSpeechLatencyMs: 240,
        totalCostEstimate: '$0.074 USD',
        sentimentScore: '+0.88 Positive',
        terminationReason: 'Customer Objective Met (Hangup)',
        audioCodec: 'Opus 48kHz (WebRTC High Definition)',
        sampleRate: '48,000 Hz',
        packetLossPercent: 0.02,
        interruptionsCount: 1,
        detectedIntent: 'Enterprise SLA Verification & Scheduled Maintenance Window',
        fallbackTriggered: false,
        notes: 'Caller requested confirmation that scheduled Sunday maintenance at 02:00 UTC does not affect their Dedicated EU Cluster.',
      },
      messages: [
        {
          id: 'vmsg_01',
          role: 'voice_agent',
          content: 'Hello! Thank you for calling Enterprise Platform Support. My name is Rachel. How can I assist you today?',
          timestamp: new Date(now - 55 * min).toISOString(),
          audioOffsetSec: 0,
          durationSec: 4.8,
          sentiment: 'positive',
        },
        {
          id: 'vmsg_02',
          role: 'caller',
          content: 'Hi Rachel. I received an automated email regarding scheduled platform maintenance this coming Sunday at 2 AM UTC. I want to confirm whether our dedicated European region cluster in Frankfurt is affected.',
          timestamp: new Date(now - 54 * min - 50 * min / 60).toISOString(),
          audioOffsetSec: 5.2,
          durationSec: 8.5,
          sentiment: 'neutral',
        },
        {
          id: 'vmsg_03',
          role: 'voice_agent',
          content: 'I would be happy to check that for you right away. May I verify your account or company name?',
          timestamp: new Date(now - 54 * min - 40 * min / 60).toISOString(),
          audioOffsetSec: 14.1,
          durationSec: 4.2,
          sentiment: 'positive',
        },
        {
          id: 'vmsg_04',
          role: 'caller',
          content: 'Sure, FinScale Inc. My name is Sarah Jenkins.',
          timestamp: new Date(now - 54 * min - 30 * min / 60).toISOString(),
          audioOffsetSec: 18.8,
          durationSec: 3.1,
          sentiment: 'neutral',
        },
        {
          id: 'vmsg_05',
          role: 'voice_agent',
          content: 'Thank you Sarah. I see your account here. Good news: your Frankfurt dedicated deployment runs on isolated hardware with rolling live-migration. You will experience zero downtime or degraded performance during the Sunday maintenance window.',
          timestamp: new Date(now - 54 * min - 20 * min / 60).toISOString(),
          audioOffsetSec: 22.4,
          durationSec: 11.2,
          sentiment: 'positive',
        },
        {
          id: 'vmsg_06',
          role: 'caller',
          content: 'That is wonderful news. Could you also email a brief confirmation summary to my address?',
          timestamp: new Date(now - 54 * min).toISOString(),
          audioOffsetSec: 34.0,
          durationSec: 4.6,
          sentiment: 'positive',
        },
        {
          id: 'vmsg_07',
          role: 'voice_agent',
          content: 'Absolutely! I have just dispatched an email confirmation with ticket reference #EU-9941 to s.jenkins@finscale.io. Is there anything else I can help you with today?',
          timestamp: new Date(now - 53 * min - 45 * min / 60).toISOString(),
          audioOffsetSec: 39.0,
          durationSec: 7.8,
          sentiment: 'positive',
        },
        {
          id: 'vmsg_08',
          role: 'caller',
          content: 'No that is all, thank you so much Rachel, have a great day!',
          timestamp: new Date(now - 53 * min - 30 * min / 60).toISOString(),
          audioOffsetSec: 47.2,
          durationSec: 3.4,
          sentiment: 'positive',
        },
        {
          id: 'vmsg_09',
          role: 'voice_agent',
          content: 'You too, Sarah! Thank you for being a valued Enterprise partner. Goodbye!',
          timestamp: new Date(now - 53 * min - 20 * min / 60).toISOString(),
          audioOffsetSec: 51.0,
          durationSec: 3.9,
          sentiment: 'positive',
        },
      ],
    };

    // 6. Voice Call - Ongoing: Charlie (ElevenLabs Voice Agent - Live Call)
    const voiceOngoing: ConversationRecord = {
      id: 'conv_voice_002',
      threadId: 'th_voice_eleven_charlie_803',
      title: 'ElevenLabs Voice Call: Real-Time API Outage Escalation',
      type: 'voice_call',
      status: 'ongoing',
      startedAt: new Date(now - 3 * min).toISOString(),
      updatedAt: new Date(now - 15 * 1000).toISOString(),
      tenantId: 'tenant_enterprise_corp',
      channel: 'elevenlabs_voice',
      voiceMetadata: {
        elevenLabsVoiceId: 'IKne3meq5aSn9XLyUdCD',
        elevenLabsVoiceName: 'Charlie (ElevenLabs Turbo v2.5)',
        elevenLabsModel: 'eleven_turbo_v2_5',
        callerPhone: '+1 (206) 555-8321',
        agentPhone: '+1 (800) 555-0199',
        callerName: 'David Zhang (Lead Architect, Nexus Health)',
        callDurationSeconds: 165,
        formattedDuration: '02:45',
        turnTakingLatencyMs: 162,
        speechToSpeechLatencyMs: 215,
        totalCostEstimate: '$0.048 USD',
        sentimentScore: '+0.42 Neutral / Focused',
        terminationReason: 'Call In Progress (Active WebRTC Channel)',
        audioCodec: 'Opus 48kHz (Ultra-Low Latency)',
        sampleRate: '48,000 Hz',
        packetLossPercent: 0.00,
        interruptionsCount: 0,
        detectedIntent: 'Emergency Webhook Gateway Latency Check',
        fallbackTriggered: false,
        notes: 'Live phone stream currently engaged with Lead Architect investigating webhook payload receipt.',
      },
      messages: [
        {
          id: 'vlive_01',
          role: 'voice_agent',
          content: 'Hi David! Thank you for calling Nexus Priority Support. I see an active alert for your webhook listener. How can I assist?',
          timestamp: new Date(now - 3 * min).toISOString(),
          audioOffsetSec: 0,
          durationSec: 5.2,
          sentiment: 'positive',
        },
        {
          id: 'vlive_02',
          role: 'caller',
          content: 'Hey Charlie. Our listener at `api.nexushealth.io/v1/events` seems to be timing out with 504 errors on high-throughput bursts.',
          timestamp: new Date(now - 2 * min - 30 * min / 60).toISOString(),
          audioOffsetSec: 5.6,
          durationSec: 6.8,
          sentiment: 'urgent',
        },
        {
          id: 'vlive_03',
          role: 'voice_agent',
          content: 'Understood. Looking into our Redis stream delivery queue right now. I see your endpoint is acknowledging messages after 4.2 seconds, which trips our 3-second safety gateway. Would you like me to temporarily relax the retry timeout to 8 seconds while you adjust your worker concurrency?',
          timestamp: new Date(now - 1 * min - 40 * min / 60).toISOString(),
          audioOffsetSec: 12.8,
          durationSec: 10.4,
          sentiment: 'neutral',
        },
        {
          id: 'vlive_04',
          role: 'caller',
          content: 'Yes, please relax the timeout to 8 seconds and enable automatic retry backoff right now.',
          timestamp: new Date(now - 45 * 1000).toISOString(),
          audioOffsetSec: 23.8,
          durationSec: 4.1,
          sentiment: 'neutral',
        },
        {
          id: 'vlive_05',
          role: 'voice_agent',
          content: 'Applied! Gateway timeout updated to 8,000 milliseconds with exponential jitter backoff. I am observing successful 200 OK acknowledgments flowing through now.',
          timestamp: new Date(now - 15 * 1000).toISOString(),
          audioOffsetSec: 28.2,
          durationSec: 7.2,
          sentiment: 'positive',
        },
      ],
    };

    this.conversations.set(singleOngoing.threadId, singleOngoing);
    this.conversations.set(singleCompleted.threadId, singleCompleted);
    this.conversations.set(teamOngoing.threadId, teamOngoing);
    this.conversations.set(teamCompleted.threadId, teamCompleted);
    this.conversations.set(voiceCompleted.threadId, voiceCompleted);
    this.conversations.set(voiceOngoing.threadId, voiceOngoing);
  }

  public getAllConversations(filters?: {
    type?: string;
    status?: string;
    search?: string;
    threadId?: string;
  }): ConversationRecord[] {
    let list = Array.from(this.conversations.values());

    if (filters?.type && filters.type !== 'all') {
      list = list.filter((c) => c.type === filters.type);
    }

    if (filters?.status && filters.status !== 'all') {
      list = list.filter((c) => c.status === filters.status);
    }

    if (filters?.threadId) {
      const q = filters.threadId.toLowerCase().trim();
      list = list.filter((c) => c.threadId.toLowerCase().includes(q));
    }

    if (filters?.search) {
      const q = filters.search.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.threadId.toLowerCase().includes(q) ||
          c.messages.some((m) => m.content.toLowerCase().includes(q)) ||
          c.agentProfile?.name.toLowerCase().includes(q) ||
          c.teamDetails?.teamName.toLowerCase().includes(q) ||
          c.voiceMetadata?.elevenLabsVoiceName.toLowerCase().includes(q) ||
          c.voiceMetadata?.callerName?.toLowerCase().includes(q)
      );
    }

    // Sort newest first
    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public getConversationByThreadId(threadId: string): ConversationRecord | null {
    return this.conversations.get(threadId) || null;
  }

  public addMessage(
    threadId: string,
    message: Omit<ConversationMessage, 'id' | 'timestamp'> & { id?: string; timestamp?: string }
  ): ConversationRecord | null {
    const conv = this.conversations.get(threadId);
    if (!conv) return null;

    const fullMessage: ConversationMessage = {
      id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: message.timestamp || new Date().toISOString(),
      role: message.role,
      content: message.content,
      workerId: message.workerId,
      workerName: message.workerName,
      workerAvatar: message.workerAvatar,
      workerColor: message.workerColor,
      tokensUsed: message.tokensUsed,
      latencyMs: message.latencyMs,
      audioOffsetSec: message.audioOffsetSec,
      durationSec: message.durationSec,
      sentiment: message.sentiment,
    };

    conv.messages.push(fullMessage);
    conv.updatedAt = new Date().toISOString();
    this.conversations.set(threadId, conv);
    return conv;
  }

  public addToolExecution(threadId: string, tool: Omit<WorkerToolExecution, 'id' | 'timestamp'>): ConversationRecord | null {
    const conv = this.conversations.get(threadId);
    if (!conv) return null;

    if (!conv.teamToolHistory) {
      conv.teamToolHistory = [];
    }

    const fullTool: WorkerToolExecution = {
      ...tool,
      id: `tool_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
    };

    conv.teamToolHistory.push(fullTool);
    conv.updatedAt = new Date().toISOString();
    this.conversations.set(threadId, conv);
    return conv;
  }

  public updateStatus(threadId: string, status: ConversationStatus): ConversationRecord | null {
    const conv = this.conversations.get(threadId);
    if (!conv) return null;
    conv.status = status;
    conv.updatedAt = new Date().toISOString();
    this.conversations.set(threadId, conv);
    return conv;
  }

  public createConversation(data: Partial<ConversationRecord> & { threadId: string; type: ConversationType; title: string }): ConversationRecord {
    const conv: ConversationRecord = {
      id: data.id || `conv_${Date.now()}`,
      threadId: data.threadId,
      title: data.title,
      type: data.type,
      status: data.status || 'ongoing',
      startedAt: data.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tenantId: data.tenantId || 'tenant_enterprise_corp',
      channel: data.channel || (data.type === 'voice_call' ? 'elevenlabs_voice' : 'web_chat'),
      agentProfile: data.agentProfile,
      teamDetails: data.teamDetails,
      voiceMetadata: data.voiceMetadata,
      messages: data.messages || [],
      teamToolHistory: data.teamToolHistory || [],
    };

    this.conversations.set(conv.threadId, conv);
    return conv;
  }
}

// Global Singleton Instance
export const conversationsManager = new ConversationsManager();
