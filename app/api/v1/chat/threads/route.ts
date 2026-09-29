export const dynamic = 'force-static';
import { NextRequest, NextResponse } from 'next/server';
import { checkpointManagerStore } from '@/Backend/legacy_ts_mocks/checkpoint-manager';
import { vaultManagerStore } from '@/Backend/legacy_ts_mocks/vault-manager';

export async function GET(req: NextRequest) {
  let threadId = 'session_enterprise_001';
  let tenantId = 'tenant_enterprise_corp';
  try {
    if (req && req.url) {
      const { searchParams } = new URL(req.url);
      threadId = searchParams.get('thread_id') || 'session_enterprise_001';
      tenantId = searchParams.get('tenant_id') || 'tenant_enterprise_corp';
    }
  } catch (e) {}

  const checkpoints = checkpointManagerStore.getThreadCheckpoints(threadId);
  const latestCheckpoint = checkpointManagerStore.getLatestCheckpoint(threadId);
  const allThreads = checkpointManagerStore.getAllThreadIds();
  const vaultCredentials = vaultManagerStore.getCredentials(tenantId);

  return NextResponse.json({
    active_thread_id: threadId,
    tenant_id: tenantId,
    checkpoints,
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
    const body = await req.json();
    const { action, thread_id } = body;

    if (action === 'clear' && thread_id) {
      checkpointManagerStore.clearThread(thread_id);
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
