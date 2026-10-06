-- Migration: 20261016000000_voice.sql
-- Description: Voice for agents. A voice profile picks a speech-to-text provider, a
-- text-to-speech provider and voice, and a spoken reply style; teams and Agent Studio
-- instances can use one. Voice turns are normal agent runs marked channel = 'voice'.
-- No audio is stored, only transcripts. voice_usage counts daily use per provider so an
-- organization can cap a provider (e.g. to stay on its free allowance).

CREATE TABLE IF NOT EXISTS public.voice_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    language TEXT NOT NULL DEFAULT 'en' CHECK (char_length(language) BETWEEN 2 AND 16),
    stt JSONB NOT NULL DEFAULT '{"provider":"gemini"}'::jsonb,   -- { provider, model? }
    tts JSONB NOT NULL DEFAULT '{"provider":"gemini","voice_id":"Kore"}'::jsonb,  -- { provider, voice_id, voice_name?, model?, speed?, style? }
    fallback BOOLEAN NOT NULL DEFAULT true,
    daily_caps JSONB NOT NULL DEFAULT '{}'::jsonb,                -- { <provider>: { stt_seconds?, tts_chars? } }
    reply_style TEXT CHECK (reply_style IS NULL OR char_length(reply_style) <= 1000),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_profiles_tenant_name
    ON public.voice_profiles (tenant_id, lower(name)) WHERE archived_at IS NULL;

ALTER TABLE public.voice_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS voice_profiles_member_access ON public.voice_profiles;
CREATE POLICY voice_profiles_member_access ON public.voice_profiles
    FOR ALL
    USING (public.has_tenant_access(tenant_id))
    WITH CHECK (public.has_tenant_access(tenant_id));

ALTER TABLE public.agent_teams
    ADD COLUMN IF NOT EXISTS voice_profile_id UUID REFERENCES public.voice_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.agent_sessions
    ADD COLUMN IF NOT EXISTS voice_profile_id UUID REFERENCES public.voice_profiles(id) ON DELETE SET NULL;

-- Voice turns are ordinary runs; the channel and the providers used are recorded.
ALTER TABLE public.agent_runs
    ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'text' CHECK (channel IN ('text', 'voice')),
    ADD COLUMN IF NOT EXISTS voice JSONB;

CREATE TABLE IF NOT EXISTS public.voice_usage (
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    provider TEXT NOT NULL,
    stt_seconds NUMERIC NOT NULL DEFAULT 0,
    tts_chars INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, day, provider)
);

ALTER TABLE public.voice_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS voice_usage_member_read ON public.voice_usage;
CREATE POLICY voice_usage_member_read ON public.voice_usage
    FOR SELECT
    USING (public.has_tenant_access(tenant_id));
