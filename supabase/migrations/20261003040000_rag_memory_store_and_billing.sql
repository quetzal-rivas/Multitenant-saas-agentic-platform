-- Migration: 20261003040000_rag_memory_store_and_billing.sql
-- Description: Create pgvector memory_store RAG table, entitlements tracking, and Stripe event deduping.

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 2. RAG Memory Store Table under RLS
CREATE TABLE IF NOT EXISTS public.memory_store (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    document_name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    embedding extensions.vector(1536),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_store_tenant_id ON public.memory_store(tenant_id);

ALTER TABLE public.memory_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memory_store_tenant_isolation ON public.memory_store;
CREATE POLICY memory_store_tenant_isolation ON public.memory_store
    FOR ALL
    USING (public.has_tenant_access(tenant_id))
    WITH CHECK (public.has_tenant_access(tenant_id));

-- 3. Billing Entitlements Table under RLS
CREATE TABLE IF NOT EXISTS public.entitlements (
    tenant_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    plan_tier VARCHAR(64) DEFAULT 'starter' CHECK (plan_tier IN ('free', 'starter', 'pro', 'enterprise')),
    status VARCHAR(64) DEFAULT 'active',
    max_agents INTEGER DEFAULT 3,
    max_runs_per_month INTEGER DEFAULT 1000,
    max_scheduled_tasks INTEGER DEFAULT 50,
    current_period_ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entitlements_tenant_isolation ON public.entitlements;
CREATE POLICY entitlements_tenant_isolation ON public.entitlements
    FOR SELECT
    USING (public.has_tenant_access(tenant_id));

-- 4. Stripe Webhook Deduping Table
CREATE TABLE IF NOT EXISTS public.processed_stripe_events (
    event_id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(128) NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW()
);
