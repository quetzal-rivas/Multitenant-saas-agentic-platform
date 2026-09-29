-- ==============================================================================
-- Decoupled Hub-and-Spoke Tooling & LangGraph PostgresSaver Enterprise Schema
-- Compatible with Supabase PostgreSQL (Supavisor Port 5432) + AWS Lambda Workers
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. Tenants Table
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    tier VARCHAR(32) DEFAULT 'enterprise' CHECK (tier IN ('starter', 'growth', 'enterprise')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tenant Auth Vault (Encrypted Spokes Credentials)
-- Never exposed to the LLM or client; decrypted exclusively by the proprietary MCP Gateway
CREATE TABLE IF NOT EXISTS public.tenant_vault (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    provider VARCHAR(64) NOT NULL, -- 'hubspot', 'github', 'google_workspace', 'sendgrid', 'slack', 'postgres'
    encrypted_access_token TEXT NOT NULL,
    encrypted_refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    scopes TEXT[] DEFAULT '{}',
    key_fingerprint VARCHAR(128),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tenant_provider UNIQUE (tenant_id, provider)
);

-- 4. Agent Team Profiles (The Team Blueprints)
-- Standard relational layout for dynamic supervisor and worker compilation
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., 'Front Desk Automation Team', 'Night Audit Team'
    supervisor_prompt TEXT NOT NULL, -- Custom rules for the router / corporate instructions
    routing_strategy VARCHAR(32) DEFAULT 'supervisor_router',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4b. Profile Workers (The Team Members)
-- Child workers bound to a team blueprint with specific system prompts and pre-authenticated MCP tools
CREATE TABLE IF NOT EXISTS public.profile_workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., 'CRM Specialist', 'Billing Clerk'
    role VARCHAR(128) NOT NULL, -- e.g., 'Lead Enrichment & CRM Operations'
    system_prompt TEXT NOT NULL, -- Instructions for this specific worker
    mcp_tools TEXT[] NOT NULL DEFAULT '{}', -- Allowed pre-authenticated tools e.g., ['crm.add_lead', 'crm.tag_contact']
    avatar_icon VARCHAR(64) DEFAULT 'bot',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4c. Thread Instances (Dynamic execution sessions spawned from a profile blueprint)
-- Profiles = Blueprints, Threads = Instances managed by LangGraph PostgresSaver
CREATE TABLE IF NOT EXISTS public.thread_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id VARCHAR(128) UNIQUE NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'New Chat Session',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW()
);

-- Legacy single-agent personas (backwards compatibility)
CREATE TABLE IF NOT EXISTS public.agent_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    profile_id VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    bound_tool_names TEXT[] NOT NULL DEFAULT '{}',
    bound_skill_ids TEXT[] NOT NULL DEFAULT '{}',
    token_budget INTEGER DEFAULT 8192,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tenant_profile UNIQUE (tenant_id, profile_id)
);

-- 5. Decoupled Semantic Memory Store (Long-term Agent Memory via pgvector)
CREATE TABLE IF NOT EXISTS public.memory_store (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    thread_id VARCHAR(128) NOT NULL,
    profile_id VARCHAR(64),
    content TEXT NOT NULL,
    embedding vector(1536), -- Compatible with standard text-embedding-3 or Gemini embeddings
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_store_tenant_thread ON public.memory_store(tenant_id, thread_id);

-- 6. LangGraph Checkpointing Infrastructure (PostgresSaver Core Tables)
-- Compliant with langgraph.checkpoint.postgres.PostgresSaver binary serialization

CREATE TABLE IF NOT EXISTS public.checkpoints (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    parent_checkpoint_id TEXT,
    type TEXT,
    checkpoint BYTEA NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE TABLE IF NOT EXISTS public.checkpoint_blobs (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL,
    version TEXT NOT NULL,
    type TEXT NOT NULL,
    blob BYTEA,
    PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);

CREATE TABLE IF NOT EXISTS public.checkpoint_writes (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    channel TEXT NOT NULL,
    type TEXT,
    blob BYTEA NOT NULL,
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

CREATE TABLE IF NOT EXISTS public.checkpoint_reads (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    channel TEXT NOT NULL,
    value BYTEA,
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

-- High-performance index for latest state hydration: ORDER BY checkpoint_id DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_checkpoints_lookup 
ON public.checkpoints (thread_id, checkpoint_ns, checkpoint_id DESC);

-- 7. Row Level Security (RLS) Policies
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thread_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;

-- Tenants Policy
CREATE POLICY tenant_isolation_policy ON public.tenants
    FOR ALL
    USING (id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- Profiles Policy (Team Blueprints scoped by Tenant)
CREATE POLICY profiles_tenant_isolation ON public.profiles
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- Profile Workers Policy (Cascade security from profiles)
CREATE POLICY profile_workers_isolation ON public.profile_workers
    FOR ALL
    USING (profile_id IN (
        SELECT id FROM public.profiles 
        WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    ));

-- Thread Instances Policy
CREATE POLICY thread_instances_tenant_isolation ON public.thread_instances
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- Vault Policy (Zero-leakage)
CREATE POLICY vault_isolation_policy ON public.tenant_vault
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- Checkpoint Metadata Index for Granular Auditing
CREATE INDEX IF NOT EXISTS idx_checkpoints_metadata_gin 
ON public.checkpoints USING GIN (metadata);

-- ==============================================================================
-- 8. Durable Deferred Task Engine Persistence (Supabase PostgreSQL)
-- Stores scheduled tasks, execution lifecycle, edge escalations, and ephemeral context
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.ephemeral_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id VARCHAR(128) UNIQUE NOT NULL,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_agent VARCHAR(128) NOT NULL DEFAULT 'Lead Agent',
    target_time TIMESTAMPTZ NOT NULL,
    primary_instructions TEXT NOT NULL,
    tools_whitelist TEXT[] NOT NULL DEFAULT '{}',
    edge_case_policies JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'executing', 'completed', 'failed', 'escalated', 'cancelled')),
    execution_result JSONB,
    edge_escalation_details JSONB,
    node_traversal_history JSONB DEFAULT '[]'::jsonb,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    executed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ephemeral_context_target_time ON public.ephemeral_context(target_time);
CREATE INDEX IF NOT EXISTS idx_ephemeral_context_status ON public.ephemeral_context(status);
CREATE INDEX IF NOT EXISTS idx_ephemeral_context_agent ON public.ephemeral_context(assigned_agent);
CREATE INDEX IF NOT EXISTS idx_ephemeral_context_policies ON public.ephemeral_context USING GIN (edge_case_policies);

ALTER TABLE public.ephemeral_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY ephemeral_context_tenant_isolation ON public.ephemeral_context
    FOR ALL
    USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ==============================================================================
-- 9. SaaS Platform Documentation Store
-- Stores tenant UI documentation topics, section markdown, and media S3 URLs
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.documentation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id VARCHAR(64) UNIQUE NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    content_markdown TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documentation_section ON public.documentation(section_id);

ALTER TABLE public.documentation ENABLE ROW LEVEL SECURITY;

-- Public read policy for tenant documentation (TO authenticated, anon)
CREATE POLICY documentation_public_read ON public.documentation
    FOR SELECT
    TO authenticated, anon
    USING (true);

-- ==============================================================================
-- 10. Organizations & Heartbeats
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;


-- ==============================================================================
-- 11. Supervisor Org Board
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.board_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_by_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(32) DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'in_progress', 'done', 'failed', 'cancelled')),
    claimed_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    lease_expires_at TIMESTAMPTZ,
    result TEXT,
    idempotency_key VARCHAR(128) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.board_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.board_tasks(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);



