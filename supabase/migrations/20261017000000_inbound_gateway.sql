-- Migration: 20261017000000_inbound_gateway.sql
-- Description: Inbound Gateway. An endpoint is a public webhook URL (/api/hooks/<id>)
-- with a source preset (Meta, ElevenLabs, Twilio, Telnyx, generic HMAC) whose signature
-- is verified before anything runs. Each verified event is stored once (idempotent per
-- provider event id), routed by rules or an AI Function Studio router function into a
-- thread (one agent instance per external conversation), and answered by a team run
-- (origin 'inbound'); the reply goes back through the same channel.

CREATE TABLE IF NOT EXISTS public.inbound_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    preset TEXT NOT NULL CHECK (preset IN ('meta', 'elevenlabs', 'twilio', 'telnyx', 'generic')),
    enabled BOOLEAN NOT NULL DEFAULT true,
    default_team_id UUID REFERENCES public.agent_teams(id) ON DELETE SET NULL,
    rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    router_function_id UUID REFERENCES public.custom_functions(id) ON DELETE SET NULL,
    reply JSONB NOT NULL DEFAULT '{}'::jsonb,
    verify_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- { <name>: envelope-encrypted payload }; never returned to clients.
    secrets JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_inbound_endpoints_tenant ON public.inbound_endpoints (tenant_id) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.inbound_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    endpoint_id UUID REFERENCES public.inbound_endpoints(id) ON DELETE SET NULL,
    conversation_key TEXT NOT NULL CHECK (char_length(conversation_key) BETWEEN 1 AND 300),
    channel TEXT NOT NULL,
    contact JSONB NOT NULL DEFAULT '{}'::jsonb,
    team_id UUID REFERENCES public.agent_teams(id) ON DELETE SET NULL,
    session_id UUID REFERENCES public.agent_sessions(id) ON DELETE SET NULL,
    reply_target JSONB,
    pending_count INT NOT NULL DEFAULT 0,
    last_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, conversation_key)
);
CREATE INDEX IF NOT EXISTS idx_inbound_threads_session ON public.inbound_threads (session_id);

CREATE TABLE IF NOT EXISTS public.inbound_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    endpoint_id UUID NOT NULL REFERENCES public.inbound_endpoints(id) ON DELETE CASCADE,
    provider_event_id TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    signature_ok BOOLEAN NOT NULL DEFAULT false,
    headers JSONB NOT NULL DEFAULT '{}'::jsonb,
    body JSONB,
    normalized JSONB,
    status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'queued', 'routed', 'ignored', 'failed')),
    error TEXT,
    thread_id UUID REFERENCES public.inbound_threads(id) ON DELETE SET NULL,
    run_id UUID,
    route_detail JSONB,
    reply_status JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (endpoint_id, provider_event_id)
);
CREATE INDEX IF NOT EXISTS idx_inbound_events_endpoint ON public.inbound_events (endpoint_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_events_pending ON public.inbound_events (received_at) WHERE status IN ('received', 'queued');
CREATE INDEX IF NOT EXISTS idx_inbound_events_thread ON public.inbound_events (thread_id, received_at);

ALTER TABLE public.inbound_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_events ENABLE ROW LEVEL SECURITY;
-- Members may read; all writes go through the service role (secrets must never be readable).
DROP POLICY IF EXISTS inbound_threads_member_read ON public.inbound_threads;
CREATE POLICY inbound_threads_member_read ON public.inbound_threads FOR SELECT USING (public.has_tenant_access(tenant_id));
DROP POLICY IF EXISTS inbound_events_member_read ON public.inbound_events;
CREATE POLICY inbound_events_member_read ON public.inbound_events FOR SELECT USING (public.has_tenant_access(tenant_id));

-- Runs can answer an inbound thread.
ALTER TABLE public.agent_runs ADD COLUMN IF NOT EXISTS inbound_thread_id UUID REFERENCES public.inbound_threads(id) ON DELETE SET NULL;
ALTER TABLE public.agent_runs DROP CONSTRAINT IF EXISTS agent_runs_origin_check;
ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_origin_check CHECK (origin IN ('chat', 'heartbeat', 'task', 'inbound'));

-- Router functions are invoked with source 'inbound'.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'function_invocations_source_check') THEN
    ALTER TABLE public.function_invocations DROP CONSTRAINT function_invocations_source_check;
    ALTER TABLE public.function_invocations ADD CONSTRAINT function_invocations_source_check CHECK (source IN ('test', 'agent', 'mcp', 'inbound'));
  END IF;
END $$;
