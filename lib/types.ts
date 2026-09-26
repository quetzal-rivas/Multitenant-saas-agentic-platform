export interface ContextContract {
  required: string[];
  optional: string[];
  runtime?: Record<string, string>;
}

export type ContextSourceType =
  | 'system_instructions'
  | 'agent_instructions'
  | 'tenant_context'
  | 'current_user'
  | 'working_memory'
  | 'long_term_memory'
  | 'conversation'
  | 'relevant_knowledge'
  | 'live_data'
  | 'runtime_input'
  | 'policy';

export interface ContextPipelineStep {
  id: string;
  type: ContextSourceType;
  title: string;
  description: string;
  sourceId: string;
  priority: number; // 1 to 10
  enabled: boolean;
  config: {
    retrievalStrategy?: 'all' | 'semantic' | 'keyword' | 'recent_plus_relevant' | 'exact' | 'webhook';
    topK?: number;
    minimumScore?: number;
    tokenBudget?: number;
    recentMessages?: number;
    maxTokens?: number;
    template?: string;
    staticContent?: string;
    endpointUrl?: string;
    cacheTtl?: number;
  };
}

export interface ContextProfile {
  id: string;
  name: string;
  slug: string;
  description: string;
  environment: 'production' | 'staging' | 'development';
  version: number;
  avgTokens: number;
  lastRequestAt: string;
  contract: ContextContract;
  pipeline: ContextPipelineStep[];
  budget: {
    maxTokens: number;
    strategy: 'truncate_lowest_priority' | 'summarize' | 'hard_limit';
    outputFormat: 'markdown' | 'json' | 'structured';
  };
  tags: string[];
  publishedAt: string;
  createdAt: string;
}

export type IngestionEngineType = 'batch_sync' | 'live_runtime';

export interface BatchSyncConfig {
  schedule: '15m' | '1h' | '6h' | '24h';
  cronExpression: string;
  nextSyncAt: string;
  embeddingModel: string;
  chunkSize: number;
  targetTable: string;
  bullmqQueue: string;
  status: 'idle' | 'syncing' | 'scheduled';
}

export interface LiveRuntimeConfig {
  mcpToolMapping: string;
  mcpGatewayEndpoint: string;
  cacheTtlSeconds: number;
  timeoutMs: number;
}

export interface SourceCredentials {
  connectionString?: string;
  baseUrl?: string;
  apiKeyOrSecret?: string;
  vaultKeyId?: string;
  encryptedInVault?: boolean;
  sslMode?: 'require' | 'prefer' | 'disable';
  collectionName?: string;
  dimension?: number;
  headers?: Record<string, string>;
}

export interface ContextSource {
  id: string;
  name: string;
  category: 'database' | 'memory' | 'conversation' | 'knowledge' | 'live_data' | 'static';
  provider:
    | 'postgres'
    | 'supabase'
    | 'dynamodb'
    | 'working_memory'
    | 'long_term_memory'
    | 'message_store'
    | 'vector_rag'
    | 'rest_api'
    | 'graphql'
    | 'webhook'
    | 'static_rules';
  status: 'connected' | 'mocked' | 'syncing';
  recordsCount: number;
  latencyMs: number;
  description: string;
  icon?: string;
  sampleData?: any;
  ingestionEngine: IngestionEngineType;
  vaultAuthStatus: 'vault_encrypted' | 'oauth2_validated' | 'rls_sandboxed' | 'static_bound';
  batchSyncConfig?: BatchSyncConfig;
  liveRuntimeConfig?: LiveRuntimeConfig;
  credentials?: SourceCredentials;
  testPingRecords?: any[];
  lastPingAt?: string;
  mcpMappingKey?: string;
}

export interface ResolveIdentity {
  tenant_id?: string;
  user_id?: string;
  conversation_id?: string;
  session_id?: string;
  [key: string]: any;
}

export interface ResolveInput {
  query?: string;
  trigger?: {
    type?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface ResolveRequest {
  profile: string; // slug or ID
  identity?: ResolveIdentity;
  input?: ResolveInput;
  options?: {
    format?: 'markdown' | 'json' | 'structured';
    dry_run?: boolean;
    max_tokens?: number;
  };
}

export interface SourceResolutionBreakdown {
  step_id: string;
  step_type: ContextSourceType;
  name: string;
  source_id: string;
  tokens: number;
  items_retrieved: number;
  latency_ms: number;
  truncated: boolean;
  relevance_score?: number;
}

export interface ResolveResponse {
  profile: string;
  version: number;
  context: {
    format: 'markdown' | 'json' | 'structured';
    content: string;
    structured?: Record<string, any>;
  };
  metadata: {
    token_count: number;
    max_tokens_budget: number;
    sources: string[];
    resolution_time_ms: number;
    source_breakdown: SourceResolutionBreakdown[];
    contract_validation: {
      valid: boolean;
      missing_required: string[];
      provided: string[];
    };
  };
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  prefix: string;
  environment: 'live' | 'test';
  createdAt: string;
  lastUsedAt: string;
  scopes: string[];
  toolsWhitelist?: string[]; // Allowed MCP tools e.g. ['crm.search_contact', 'gmail.send_draft', 'elevenlabs.trigger_call']
  rateLimitUsed?: number; // Current consumed requests this minute
  rateLimitMax?: number; // Max requests per minute ceiling (e.g. 60)
}

export interface ExecutionStep {
  stepId: string;
  name: string;
  type: 'ingestion' | 'queue' | 'supervisor' | 'worker_agent' | 'mcp_tool' | 'escalation' | 'checkpoint';
  node: string;
  detail: string;
  durationMs: number;
  status: 'completed' | 'delayed' | 'retrying' | 'escalated' | 'bypassed' | 'failed';
  timestamp?: string;
  toolName?: string;
  payload?: any;
}

export interface EdgeCasePolicyTrace {
  policyConfigured: {
    onFailure: 'escalate' | 'retry' | 'abort';
    fallbackTool: string;
    escalationInstructions: string;
    contactOverrides?: Record<string, string>;
    maxRetries: number;
  };
  evaluationStatus: 'bypassed_success' | 'escalated_triggered' | 'retrying_queued';
  reason?: string;
}

export interface RequestLog {
  id: string;
  eventType?: 'HTTP_RESOLVE' | 'BULLMQ_DELAYED' | 'BULLMQ_RETRY' | 'LANGGRAPH_EXECUTION' | 'ESCALATION_ALERT';
  profileSlug: string;
  profileName?: string;
  teamBlueprintId?: string;
  timestamp: string;
  latencyMs: number;
  tokenCount: number;
  statusCode: number;
  statusLabel?: 'SUCCESS' | 'DELAYED' | 'RETRYING' | 'ESCALATED' | 'FAILED';
  targetTime?: string;
  retryAttempt?: { current: number; max: number };
  identity: ResolveIdentity;
  input: ResolveInput;
  sourcesUsed: string[];
  outputFormat: string;
  checkpointId?: string;
  threadId?: string;
  nodeCascade?: ExecutionStep[];
  edgeCaseTrace?: EdgeCasePolicyTrace;
}
