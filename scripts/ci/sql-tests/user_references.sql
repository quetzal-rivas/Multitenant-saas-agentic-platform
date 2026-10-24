-- No reference to auth.users in the public schema may block deleting a user: each must say
-- what happens (CASCADE for membership-like rows, SET NULL for "created by" links).
DO $$
DECLARE
    blocking TEXT;
BEGIN
    SELECT string_agg(c.conrelid::regclass || '.' || c.conname, ', ') INTO blocking
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND c.confdeltype IN ('a', 'r')                 -- NO ACTION / RESTRICT
      AND c.connamespace = 'public'::regnamespace;
    ASSERT blocking IS NULL, 'these references block deleting a user: ' || blocking;
END $$;
