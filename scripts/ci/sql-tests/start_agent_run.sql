-- start_agent_run(): concurrency cap, idempotency, pause and the per-instance guard,
-- asserted against real Postgres after all migrations are applied. Rolled back.
BEGIN;
DO $$
DECLARE
  org UUID := gen_random_uuid();
  s1 UUID := gen_random_uuid();
  s2 UUID := gen_random_uuid();
  s3 UUID := gen_random_uuid();
  r JSONB;
  base JSONB;
BEGIN
  INSERT INTO public.organizations (id, slug, name) VALUES (org, 'sqltest-' || org, 'SQL test');
  INSERT INTO public.agent_sessions (id, tenant_id, name, provider, model) VALUES
    (s1, org, 'a', 'gemini', 'm'), (s2, org, 'b', 'gemini', 'm'), (s3, org, 'c', 'gemini', 'm');
  base := jsonb_build_object('tenant_id', org, 'origin', 'chat', 'channel', 'text', 'input_message', 'hi', 'status', 'queued',
    'caller', '{}'::jsonb, 'progress', '{}'::jsonb, 'invocations', 0, 'kind', 'internal', 'labels', '{}'::jsonb, 'tokens_used', 0,
    'usage_by_worker', '{}'::jsonb, 'created_at', now(), 'updated_at', now());

  r := public.start_agent_run(base || jsonb_build_object('id', gen_random_uuid(), 'session_id', s1, 'client_ref', 'job-1'), 2, 1000000);
  ASSERT r->>'outcome' = 'created', 'first run created: ' || r::text;
  r := public.start_agent_run(base || jsonb_build_object('id', gen_random_uuid(), 'session_id', s1, 'client_ref', 'job-1'), 2, 1000000);
  ASSERT r->>'outcome' = 'reused', 'same client_ref is reused: ' || r::text;
  r := public.start_agent_run(base || jsonb_build_object('id', gen_random_uuid(), 'session_id', s1), 2, 1000000);
  ASSERT r->>'outcome' = 'busy', 'one active run per instance: ' || r::text;
  r := public.start_agent_run(base || jsonb_build_object('id', gen_random_uuid(), 'session_id', s2), 2, 1000000);
  ASSERT r->>'outcome' = 'created', 'second run created: ' || r::text;
  r := public.start_agent_run(base || jsonb_build_object('id', gen_random_uuid(), 'session_id', s3), 2, 1000000);
  ASSERT r->>'outcome' = 'concurrency', 'third run refused at the cap: ' || r::text;

  UPDATE public.agent_runs SET status = 'done', tokens_used = 5000 WHERE tenant_id = org;
  r := public.start_agent_run(base || jsonb_build_object('id', gen_random_uuid(), 'session_id', s3), 2, 4000);
  ASSERT r->>'outcome' = 'daily_cap', 'daily token cap: ' || r::text;

  UPDATE public.organizations SET agents_paused_at = now() WHERE id = org;
  r := public.start_agent_run(base || jsonb_build_object('id', gen_random_uuid(), 'session_id', s3), 2, 1000000);
  ASSERT r->>'outcome' = 'paused', 'paused org refuses runs: ' || r::text;
END $$;
ROLLBACK;
