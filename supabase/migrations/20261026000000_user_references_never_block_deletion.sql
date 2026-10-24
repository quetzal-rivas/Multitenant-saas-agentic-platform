-- Deleting a user (account deletion, an erasure request, an admin removal) must never be
-- blocked by records that only remember who created them. Some columns referenced auth.users
-- with no ON DELETE rule (e.g. mcp_api_keys.created_by, mcp_profiles.created_by), so a user who
-- had ever created an API key or a profile could not be deleted. Every such reference in the
-- public schema now becomes ON DELETE SET NULL (and nullable): the record stays with its
-- organization; only the link to the deleted person is cleared.
DO $$
DECLARE
    fk RECORD;
BEGIN
    FOR fk IN
        SELECT c.conname, c.conrelid::regclass AS tbl, a.attname AS col
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f'
          AND c.confrelid = 'auth.users'::regclass
          AND c.confdeltype = 'a'                       -- NO ACTION
          AND array_length(c.conkey, 1) = 1
          AND c.connamespace = 'public'::regnamespace
    LOOP
        EXECUTE format('ALTER TABLE %s ALTER COLUMN %I DROP NOT NULL', fk.tbl, fk.col);
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.tbl, fk.conname);
        EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE SET NULL', fk.tbl, fk.conname, fk.col);
        RAISE NOTICE 'user reference % on %.% now ON DELETE SET NULL', fk.conname, fk.tbl, fk.col;
    END LOOP;
END $$;
