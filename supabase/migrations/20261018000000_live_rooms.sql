-- Migration: 20261018000000_live_rooms.sql
-- Description: Live Rooms. Every live conversation (phone call in or out, browser) is a
-- room on the organization's own telephony account (Twilio first). "Ear" turns each
-- leg's audio into per-speaker utterances any agent can read; voice agents (an ElevenLabs
-- Voice Front, or the platform's turn-based mode) answer or place calls; listener teams
-- watch rooms and post live notes. No audio passes through our servers.

-- Organization-level consent attestation for recorded / AI calls (owner only).
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS voice_compliance_attested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS voice_compliance_attested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.telephony_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('twilio')),
    account_sid TEXT NOT NULL,
    -- { auth_token, api_key_sid, api_key_secret, twiml_app_sid }: envelope-encrypted, never returned.
    secrets JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Public origin the provider calls back (webhooks for calls placed from background runs).
    public_origin TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'error')),
    last_error TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, provider)
);

CREATE TABLE IF NOT EXISTS public.voice_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    mode TEXT NOT NULL CHECK (mode IN ('elevenlabs', 'turn_based')),
    team_id UUID REFERENCES public.agent_teams(id) ON DELETE SET NULL,
    context_profile_id UUID REFERENCES public.context_profiles(id) ON DELETE SET NULL,
    mcp_profile_id UUID REFERENCES public.mcp_profiles(id) ON DELETE SET NULL,
    voice_profile_id UUID REFERENCES public.voice_profiles(id) ON DELETE SET NULL,
    language TEXT NOT NULL DEFAULT 'es',
    instructions TEXT,
    greeting TEXT,
    consent_message TEXT,
    listener_team_id UUID REFERENCES public.agent_teams(id) ON DELETE SET NULL,
    triggers JSONB NOT NULL DEFAULT '[]'::jsonb,
    calling_hours JSONB,
    max_minutes INT NOT NULL DEFAULT 15 CHECK (max_minutes BETWEEN 1 AND 120),
    -- Managed by the platform (ElevenLabs agent, its SIP number, the scoped MCP key).
    provider_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    secrets JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_voice_agents_tenant ON public.voice_agents (tenant_id) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.phone_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES public.telephony_connections(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_sid TEXT NOT NULL,
    e164 TEXT NOT NULL,
    friendly_name TEXT,
    capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
    voice_agent_id UUID REFERENCES public.voice_agents(id) ON DELETE SET NULL,
    sms_endpoint_id UUID REFERENCES public.inbound_endpoints(id) ON DELETE SET NULL,
    configured BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, e164)
);

CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_room_sid TEXT,
    conference_name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('phone_in', 'phone_out', 'browser')),
    status TEXT NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'live', 'ended', 'failed')),
    voice_agent_id UUID REFERENCES public.voice_agents(id) ON DELETE SET NULL,
    mode TEXT NOT NULL DEFAULT 'elevenlabs',
    session_id UUID REFERENCES public.agent_sessions(id) ON DELETE SET NULL,
    listener_session_id UUID REFERENCES public.agent_sessions(id) ON DELETE SET NULL,
    customer_number TEXT,
    agent_number TEXT,
    purpose TEXT,
    capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
    trigger_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    summary TEXT,
    recording_key TEXT,
    end_reason TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rooms_tenant_live ON public.rooms (tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_conference ON public.rooms (conference_name);

CREATE TABLE IF NOT EXISTS public.room_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('customer', 'agent', 'staff', 'listener', 'coach')),
    call_sid TEXT,
    label TEXT,
    address TEXT,
    muted BOOLEAN NOT NULL DEFAULT false,
    coaching_call_sid TEXT,
    status TEXT NOT NULL DEFAULT 'dialing',
    joined_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_room_participants_room ON public.room_participants (room_id);
CREATE INDEX IF NOT EXISTS idx_room_participants_call ON public.room_participants (call_sid);

CREATE TABLE IF NOT EXISTS public.utterances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    seq INT NOT NULL,
    speaker_role TEXT NOT NULL,
    participant_id UUID REFERENCES public.room_participants(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    start_ms INT,
    confidence REAL,
    source TEXT NOT NULL CHECK (source IN ('twilio_rt', 'gather', 'agent', 'post_call')),
    provider_ref TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (room_id, seq)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_utterances_provider_ref ON public.utterances (room_id, provider_ref) WHERE provider_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.room_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'alert')),
    text TEXT NOT NULL CHECK (char_length(text) <= 2000),
    data JSONB,
    author TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_room_notes_room ON public.room_notes (room_id, created_at);

CREATE TABLE IF NOT EXISTS public.call_blocklist (
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    e164 TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, e164)
);

ALTER TABLE public.telephony_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utterances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_blocklist ENABLE ROW LEVEL SECURITY;
-- Members may read rooms and their transcript; everything else goes through the service role.
DROP POLICY IF EXISTS rooms_member_read ON public.rooms;
CREATE POLICY rooms_member_read ON public.rooms FOR SELECT USING (public.has_tenant_access(tenant_id));
DROP POLICY IF EXISTS utterances_member_read ON public.utterances;
CREATE POLICY utterances_member_read ON public.utterances FOR SELECT USING (public.has_tenant_access(tenant_id));
DROP POLICY IF EXISTS room_notes_member_read ON public.room_notes;
CREATE POLICY room_notes_member_read ON public.room_notes FOR SELECT USING (public.has_tenant_access(tenant_id));

-- Runs started for a room (listener checks, summaries, delegated questions from the voice).
ALTER TABLE public.agent_runs ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL;
ALTER TABLE public.agent_runs DROP CONSTRAINT IF EXISTS agent_runs_origin_check;
ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_origin_check CHECK (origin IN ('chat', 'heartbeat', 'task', 'inbound', 'room'));
