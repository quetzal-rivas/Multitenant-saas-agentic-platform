export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { demoOnlyGuard } from '@/lib/http/demo-only';
import { createClient } from '@/utils/supabase/server';
import { vaultManagerStore } from '@/lib/demo/legacy_mocks/vault-manager';

export async function GET(req: NextRequest) {
  const blocked = demoOnlyGuard('/api/v1/agent-sessions');
  if (blocked) return blocked;
  const supabase = await createClient();
  const threadId = req.nextUrl.searchParams.get('thread_id') || 'session_enterprise_001';
  // Tenant comes from the session only (demo sandbox otherwise), never from the request.
  const tenantId = 'tenant_enterprise_corp';
  let actualTenantId = tenantId;
  {
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
  const blocked = demoOnlyGuard('/api/v1/agent-sessions');
  if (blocked) return blocked;
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
