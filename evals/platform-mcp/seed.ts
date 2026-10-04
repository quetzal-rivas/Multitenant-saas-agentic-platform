/**
 * Seed a dedicated, fixed "eval" organization for the Platform MCP evaluation.
 * Answers in questions.xml depend on exactly this data, so the seed rebuilds it
 * from scratch every run. Touches only the org with slug EVAL_ORG_SLUG.
 *
 *   npx tsx --tsconfig tsconfig.json evals/platform-mcp/seed.ts
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Prints a read-only
 * API key for the eval org; export it as CC_MCP_EVAL_KEY for the runner.
 */
import { getSupabaseAdminClient } from '@/lib/supabase';
import { createPlatformApiKey } from '@/lib/auth/api-keys';

export const EVAL_ORG_SLUG = 'eval-platform-mcp';

const PROFILES = [
  { key: 'support', name: 'Support Triage', token_budget: 16000, is_active: true, description: 'Routes inbound support tickets.' },
  { key: 'sales', name: 'Sales Copilot', token_budget: 32000, is_active: true, description: 'Pipeline and deal assistance.' },
  { key: 'billing', name: 'Legacy Billing Bot', token_budget: 48000, is_active: false, description: 'Retired billing assistant.' },
  { key: 'auditor', name: 'Night Auditor', token_budget: 12000, is_active: true, description: 'Overnight infrastructure checks.' },
  { key: 'onboarding', name: 'Onboarding Guide', token_budget: 8000, is_active: false, description: 'Old onboarding flow.' },
  { key: 'docs', name: 'Docs Writer', token_budget: 24000, is_active: true, description: 'Drafts help-center articles.' },
] as const;

const TASKS = [
  { title: 'Weekly pipeline review', status: 'scheduled', target_time: '2027-01-08T16:00:00Z', profile: 'sales' },
  { title: 'Rotate API keys', status: 'scheduled', target_time: '2027-01-15T09:00:00Z', profile: 'auditor' },
  { title: 'Quarterly churn report', status: 'scheduled', target_time: '2027-02-01T14:00:00Z', profile: 'sales' },
  { title: 'Audit replica lag', status: 'active', target_time: '2026-10-01T02:00:00Z', profile: 'auditor' },
  { title: 'Verify backups', status: 'completed', target_time: '2026-05-05T03:00:00Z', profile: 'auditor' },
  { title: 'Escalate VIP outage', status: 'escalated', target_time: '2026-09-02T11:30:00Z', profile: 'support' },
  { title: 'Archive old tickets', status: 'completed', target_time: '2026-06-30T23:00:00Z', profile: 'support' },
  { title: 'Refund backlog sweep', status: 'completed', target_time: '2026-08-10T08:00:00Z', profile: 'billing' },
  { title: 'Migrate invoices', status: 'cancelled', target_time: '2026-07-20T12:00:00Z', profile: 'billing' },
] as const;

const KEYS = [
  { name: 'CI smoke', scopes: ['mcp:profiles:read'], tools: [], expiresAt: '2026-12-31T00:00:00Z' },
  { name: 'Zapier bridge', scopes: ['mcp:tasks:read', 'mcp:tasks:write'], tools: ['contextcontrol_list_tasks', 'contextcontrol_schedule_task'], expiresAt: '2027-06-30T00:00:00Z' },
];

async function must<T>(label: string, p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function main() {
  const db = getSupabaseAdminClient();

  // Rebuild the eval org from scratch (cascades to its profiles, tasks, keys).
  await must('delete old eval org', db.from('organizations').delete().eq('slug', EVAL_ORG_SLUG));
  const org = await must(
    'create eval org',
    db.from('organizations').insert({ slug: EVAL_ORG_SLUG, name: 'Eval Org (Platform MCP)', subscription_status: 'active' }).select('id').single()
  );
  const tenantId = (org as { id: string }).id;

  const profileIds: Record<string, string> = {};
  for (const p of PROFILES) {
    const row = await must(
      `profile ${p.name}`,
      db.from('mcp_profiles').insert({
        org_id: tenantId,
        name: p.name,
        description: p.description,
        token_budget: p.token_budget,
        is_active: p.is_active,
        settings: {},
      }).select('id').single()
    );
    profileIds[p.key] = (row as { id: string }).id;
  }

  await must(
    'tasks',
    db.from('supervisor_tasks').insert(
      TASKS.map((t) => ({
        tenant_id: tenantId,
        title: t.title,
        description: `Eval fixture task for ${t.profile}.`,
        status: t.status,
        target_time: t.target_time,
        metadata: { source: 'eval_seed', profile_id: profileIds[t.profile] },
      }))
    )
  );

  for (const k of KEYS) {
    await createPlatformApiKey(tenantId, { name: k.name, scopes: k.scopes, toolsWhitelist: k.tools, expiresAt: k.expiresAt });
  }
  const evalKey = await createPlatformApiKey(tenantId, {
    name: 'Eval runner (read-only)',
    scopes: ['mcp:profiles:read', 'mcp:tasks:read', 'mcp:keys:read'],
  });

  console.log(`Seeded ${EVAL_ORG_SLUG} (${tenantId}): ${PROFILES.length} profiles, ${TASKS.length} tasks, ${KEYS.length + 1} keys.`);
  console.log('Read-only eval key (shown once):');
  console.log(evalKey.rawKey);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
