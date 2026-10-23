-- Migration: 20261023000000_plans_and_usage.sql
-- Description: Real plans. Each organization has a contracted base plan (free, developer,
-- pro, unlimited, enterprise), at most one running trial of a higher tier, and limits that
-- the server enforces (lib/billing/plans.ts holds the catalog). Trials are granted once
-- per organization and tier (trial_grants). Monthly and per-minute usage is counted
-- atomically (usage_counters + consume_api_request), and start_agent_run() also checks the
-- monthly run quota, a platform-wide concurrency cap and the platform emergency switch.

-- 1. Entitlements: base plan, billing status, trial, custom limits ----------------------------
ALTER TABLE public.entitlements DROP CONSTRAINT IF EXISTS entitlements_plan_tier_check;
ALTER TABLE public.entitlements ALTER COLUMN plan_tier SET DEFAULT 'free';
UPDATE public.entitlements SET plan_tier = 'developer' WHERE plan_tier = 'starter';
ALTER TABLE public.entitlements ADD CONSTRAINT entitlements_plan_tier_check
    CHECK (plan_tier IN ('free', 'developer', 'pro', 'unlimited', 'enterprise'));

ALTER TABLE public.entitlements
    ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'free'
        CHECK (billing_status IN ('free', 'active', 'past_due', 'canceled')),
    ADD COLUMN IF NOT EXISTS grace_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS trial_tier TEXT CHECK (trial_tier IS NULL OR trial_tier IN ('developer', 'pro', 'unlimited')),
    ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
    -- Enterprise / support exceptions: { "<limit key>": number }. Changes are audited in usage_events.
    ADD COLUMN IF NOT EXISTS custom_limits JSONB;

-- 2. Trials are granted once per organization and tier ------------------------------------------
CREATE TABLE IF NOT EXISTS public.trial_grants (
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    tier TEXT NOT NULL CHECK (tier IN ('developer', 'pro', 'unlimited')),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    reason TEXT NOT NULL,
    PRIMARY KEY (tenant_id, tier)
);
ALTER TABLE public.trial_grants ENABLE ROW LEVEL SECURITY;

-- 3. Usage counters (monthly and per-minute metrics) -------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_counters (
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    period TEXT NOT NULL,           -- 'YYYY-MM' (UTC month) or 'YYYY-MM-DDTHH:MI' (UTC minute)
    metric TEXT NOT NULL,
    used BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, metric, period)
);
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS usage_counters_tenant_read ON public.usage_counters;
CREATE POLICY usage_counters_tenant_read ON public.usage_counters FOR SELECT USING (public.has_tenant_access(tenant_id));

-- Audit of plan changes, trial grants and limit rejections.
CREATE TABLE IF NOT EXISTS public.usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_events_tenant ON public.usage_events (tenant_id, created_at DESC);
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- One API or MCP request: counts toward the monthly operations quota and the per-minute
-- rate, atomically. Nothing is counted when either limit is already reached.
CREATE OR REPLACE FUNCTION public.consume_api_request(
    p_tenant UUID, p_month TEXT, p_minute TEXT, p_ops_limit BIGINT, p_rpm_limit BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ops BIGINT;
    v_rpm BIGINT;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('usage:' || p_tenant::text));
    SELECT COALESCE((SELECT used FROM public.usage_counters WHERE tenant_id = p_tenant AND metric = 'api_ops' AND period = p_month), 0) INTO v_ops;
    IF v_ops >= p_ops_limit THEN
        RETURN jsonb_build_object('outcome', 'monthly_quota', 'used', v_ops, 'limit', p_ops_limit);
    END IF;
    SELECT COALESCE((SELECT used FROM public.usage_counters WHERE tenant_id = p_tenant AND metric = 'api_rpm' AND period = p_minute), 0) INTO v_rpm;
    IF v_rpm >= p_rpm_limit THEN
        RETURN jsonb_build_object('outcome', 'rate_limited', 'used', v_rpm, 'limit', p_rpm_limit);
    END IF;
    INSERT INTO public.usage_counters (tenant_id, metric, period, used) VALUES (p_tenant, 'api_ops', p_month, 1)
        ON CONFLICT (tenant_id, metric, period) DO UPDATE SET used = public.usage_counters.used + 1, updated_at = NOW();
    INSERT INTO public.usage_counters (tenant_id, metric, period, used) VALUES (p_tenant, 'api_rpm', p_minute, 1)
        ON CONFLICT (tenant_id, metric, period) DO UPDATE SET used = public.usage_counters.used + 1, updated_at = NOW();
    RETURN jsonb_build_object('outcome', 'ok', 'used', v_ops + 1, 'limit', p_ops_limit);
END;
$$;

-- 4. start_agent_run(): adds the monthly run quota, a platform-wide concurrency cap and the
-- platform emergency switch (platform_settings 'runs_paused' = 'true'). The old 3-argument
-- calls keep working through the defaults.
DROP FUNCTION IF EXISTS public.start_agent_run(JSONB, INT, BIGINT);
CREATE OR REPLACE FUNCTION public.start_agent_run(
    p_run JSONB, p_max_concurrent INT, p_max_tokens_day BIGINT,
    p_max_runs_month INT DEFAULT NULL, p_global_max_concurrent INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant UUID := (p_run->>'tenant_id')::uuid;
    v_ref TEXT := NULLIF(p_run->>'client_ref', '');
    v_existing UUID;
    v_paused TIMESTAMPTZ;
    v_active INT;
    v_used BIGINT;
    v_month INT;
    v_new public.agent_runs;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(v_tenant::text));

    IF v_ref IS NOT NULL THEN
        SELECT id INTO v_existing FROM public.agent_runs WHERE tenant_id = v_tenant AND client_ref = v_ref;
        IF FOUND THEN
            RETURN jsonb_build_object('outcome', 'reused', 'run_id', v_existing);
        END IF;
    END IF;

    IF to_regclass('public.platform_settings') IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'runs_paused' AND value = 'true') THEN
        RETURN jsonb_build_object('outcome', 'platform_paused');
    END IF;

    SELECT agents_paused_at INTO v_paused FROM public.organizations WHERE id = v_tenant;
    IF v_paused IS NOT NULL THEN
        RETURN jsonb_build_object('outcome', 'paused', 'paused_at', v_paused);
    END IF;

    SELECT count(*) INTO v_active FROM public.agent_runs WHERE tenant_id = v_tenant AND status IN ('queued', 'running');
    IF v_active >= p_max_concurrent THEN
        RETURN jsonb_build_object('outcome', 'concurrency', 'active', v_active, 'limit', p_max_concurrent);
    END IF;

    -- Approximate across tenants (per-tenant lock); Lambda reserved concurrency is the hard ceiling.
    IF p_global_max_concurrent IS NOT NULL THEN
        SELECT count(*) INTO v_active FROM public.agent_runs WHERE status IN ('queued', 'running');
        IF v_active >= p_global_max_concurrent THEN
            RETURN jsonb_build_object('outcome', 'platform_capacity', 'active', v_active, 'limit', p_global_max_concurrent);
        END IF;
    END IF;

    IF p_max_runs_month IS NOT NULL THEN
        SELECT count(*) INTO v_month FROM public.agent_runs
        WHERE tenant_id = v_tenant AND created_at >= (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
        IF v_month >= p_max_runs_month THEN
            RETURN jsonb_build_object('outcome', 'monthly_quota', 'used', v_month, 'limit', p_max_runs_month);
        END IF;
    END IF;

    SELECT COALESCE(SUM(tokens_used), 0) INTO v_used FROM public.agent_runs
    WHERE tenant_id = v_tenant AND created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
    IF v_used >= p_max_tokens_day THEN
        RETURN jsonb_build_object('outcome', 'daily_cap', 'used', v_used, 'limit', p_max_tokens_day);
    END IF;

    BEGIN
        INSERT INTO public.agent_runs SELECT * FROM jsonb_populate_record(NULL::public.agent_runs, p_run) RETURNING * INTO v_new;
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('outcome', 'busy');
    END;
    RETURN jsonb_build_object('outcome', 'created', 'run_id', v_new.id);
END;
$$;

CREATE INDEX IF NOT EXISTS idx_agent_runs_active_status ON public.agent_runs (status) WHERE status IN ('queued', 'running');

-- 5. Server-only functions ---------------------------------------------------------------------------
DO $$
DECLARE f TEXT;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.start_agent_run(JSONB, INT, BIGINT, INT, INT)',
        'public.consume_api_request(UUID, TEXT, TEXT, BIGINT, BIGINT)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f); END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f); END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f); END IF;
    END LOOP;
END $$;

-- 6. Existing organizations: Free with a 7-day Developer trial from now ----------------------------
INSERT INTO public.entitlements (tenant_id, plan_tier, billing_status, status)
SELECT o.id, 'free', 'free', 'active' FROM public.organizations o
WHERE NOT EXISTS (SELECT 1 FROM public.entitlements e WHERE e.tenant_id = o.id);

INSERT INTO public.trial_grants (tenant_id, tier, granted_at, expires_at, reason)
SELECT e.tenant_id, 'developer', NOW(), NOW() + INTERVAL '7 days', 'migration'
FROM public.entitlements e
WHERE e.plan_tier = 'free'
ON CONFLICT (tenant_id, tier) DO NOTHING;

UPDATE public.entitlements e
SET trial_tier = 'developer', trial_started_at = g.granted_at, trial_ends_at = g.expires_at, updated_at = NOW()
FROM public.trial_grants g
WHERE g.tenant_id = e.tenant_id AND g.tier = 'developer' AND g.reason = 'migration' AND e.trial_tier IS NULL;
