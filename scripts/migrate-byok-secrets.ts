/**
 * One-off: move plaintext BYOK rows from tenant_api_keys into envelope-encrypted
 * encrypted_secrets, deleting each plaintext row after it is stored.
 *
 *   npx tsx scripts/migrate-byok-secrets.ts            # dry run
 *   npx tsx scripts/migrate-byok-secrets.ts --apply
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and the KMS settings
 * used by lib/secrets/envelope-encryption.ts.
 */
import { getSupabaseAdminClient } from '../lib/supabase';
import { storeOnboardingSecrets } from '../lib/services/organizations';

async function main() {
  const apply = process.argv.includes('--apply');
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from('tenant_api_keys').select('id, organization_id, key_name, key_value');
  if (error) throw new Error(`Could not read tenant_api_keys: ${error.message}`);

  console.log(`${data?.length || 0} plaintext BYOK rows found${apply ? '' : ' (dry run)'}`);
  for (const row of data || []) {
    if (!apply) {
      console.log(`would migrate ${row.key_name} for org ${row.organization_id}`);
      continue;
    }
    const { stored, failed } = await storeOnboardingSecrets(
      row.organization_id,
      [{ name: row.key_name, value: row.key_value }],
      { verify: false }
    );
    if (stored.length === 1) {
      await supabase.from('tenant_api_keys').delete().eq('id', row.id);
      console.log(`migrated ${row.key_name} for org ${row.organization_id}`);
    } else {
      console.warn(`skipped ${row.key_name} for org ${row.organization_id}${failed.length ? ' (encryption failed)' : ' (unknown provider)'}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
