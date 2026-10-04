#!/usr/bin/env bash
# Replay every Supabase migration, in order, against an empty Postgres database.
# Supabase-provided objects (auth schema, roles, realtime publication) are stubbed.
# Usage: DATABASE_URL=postgres://... scripts/ci/verify-migrations.sh
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point at an empty Postgres database}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-supabase/migrations}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $fn$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $fn$ SELECT current_setting('request.jwt.claim.role', true) $fn$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;
SQL

# Supabase applies migrations in version order (the numeric prefix before the first "_").
mapfile -t files < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' -printf '%f\n' \
  | awk -F_ '{ printf "%s\t%s\n", $1, $0 }' | sort -k1,1 | cut -f2)

for file in "${files[@]}"; do
  echo "applying $file"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q --single-transaction -f "$MIGRATIONS_DIR/$file"
done

echo "All ${#files[@]} migrations applied cleanly."
