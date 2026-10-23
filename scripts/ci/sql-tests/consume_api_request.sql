-- consume_api_request(): monthly operations quota and per-minute rate, asserted against real
-- Postgres after all migrations are applied. Rolled back.
BEGIN;
DO $$
DECLARE
  org UUID := gen_random_uuid();
  r JSONB;
BEGIN
  INSERT INTO public.organizations (id, slug, name) VALUES (org, 'sqltest-usage-' || org, 'SQL usage test');
  r := public.consume_api_request(org, '2026-10', '2026-10-23T10:00', 2, 100);
  ASSERT r->>'outcome' = 'ok', 'first request: ' || r::text;
  r := public.consume_api_request(org, '2026-10', '2026-10-23T10:00', 2, 100);
  ASSERT r->>'outcome' = 'ok', 'second request: ' || r::text;
  r := public.consume_api_request(org, '2026-10', '2026-10-23T10:00', 2, 100);
  ASSERT r->>'outcome' = 'monthly_quota', 'third request over the monthly quota: ' || r::text;
  ASSERT (SELECT used FROM public.usage_counters WHERE tenant_id = org AND metric = 'api_ops' AND period = '2026-10') = 2, 'never counted past the limit';
  r := public.consume_api_request(org, '2026-11', '2026-11-01T00:00', 2, 1);
  ASSERT r->>'outcome' = 'ok', 'a new month starts fresh: ' || r::text;
  r := public.consume_api_request(org, '2026-11', '2026-11-01T00:00', 2, 1);
  ASSERT r->>'outcome' = 'rate_limited', 'per-minute rate: ' || r::text;
END $$;
ROLLBACK;
