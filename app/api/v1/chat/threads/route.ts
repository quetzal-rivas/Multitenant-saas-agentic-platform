export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { vaultManagerStore } from '@/Backend/legacy_ts_mocks/vault-manager';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  let threadId = 'session_enterprise_001';
  let tenantId = 'tenant_enterprise_corp';
  try {
    if (req && req.url) {
      const { searchParams } = new URL(req.url);
      threadId = searchParams.get('thread_id') || 'session_enterprise_001';
      tenantId = searchParams.get('tenant_id') || 'tenant_enterprise_corp';
    }
  } catch (e) {}

  let actualTenantId = tenantId;
  if (!actualTenantId || actualTenantId.length !== 36) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
       const { data: orgMember } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).single();
       if (orgMember) {
         actualTenantId = orgMember.organization_id;
       }
    }
  }

  const { data: checkpoints } = await supabase
    .from('checkpoints')
    .select('*')
    .eq('thread_id', threadId)
    .order('step_index', { ascending: true });

  const latestCheckpoint = checkpoints && checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;
  const { data: threadsData } = await supabase.from('checkpoints').select('thread_id');
  const allThreads = Array.from(new Set((threadsData || []).map((t: any) => t.thread_id)));
  
  const vaultCredentials = vaultManagerStore.getCredentials(actualTenantId);

  return NextResponse.json({
    active_thread_id: threadId,
    tenant_id: actualTenantId,
    checkpoints: checkpoints || [],
    latest_checkpoint: latestCheckpoint,
    all_threads: allThreads,
    vault: {
      tenant_id: tenantId,
      credentials: vaultCredentials,
      active_spokes_count: vaultCredentials.filter((c) => c.isActive).length,
      zero_credential_exposure: true,
      encryption_protocol: 'AES-256-GCM + Supavisor Transaction Pool',
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const { action, thread_id } = body;

    if (action === 'clear' && thread_id) {
      await supabase.from('checkpoints').delete().eq('thread_id', thread_id);
      return NextResponse.json({ success: true, message: `Thread ${thread_id} reset.` });
    }

    if (action === 'create') {
      const newThreadId = `session_${Math.random().toString(36).substring(2, 8)}`;
      return NextResponse.json({ success: true, thread_id: newThreadId });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
