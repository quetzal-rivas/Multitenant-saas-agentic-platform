export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

async function getTenantId(req: NextRequest, supabase: any) {
  let tenantId: string | undefined = undefined;
  if (req && req.url) {
    const { searchParams } = new URL(req.url);
    tenantId = searchParams.get('tenant_id') || undefined;
  }
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
  return actualTenantId || '00000000-0000-0000-0000-000000000001';
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const tenantId = await getTenantId(req, supabase);
    const { data: tasks, error } = await supabase.from('supervisor_tasks').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // Map them back to legacy shape if needed
    const mappedTasks = tasks?.map(t => ({
      ...t,
      instructions: t.description,
      scheduled_at: t.target_time,
      ...(t.metadata || {})
    }));
    
    return NextResponse.json(mappedTasks || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const tenantId = await getTenantId(req, supabase);
    
    const { data: insertedTask, error: insertError } = await supabase.from('supervisor_tasks').insert({
       title: body.title || 'New Task',
       description: body.instructions || body.description || '',
       status: 'scheduled',
       target_time: body.scheduled_at || body.targetTime || new Date(Date.now() + 1000 * 60 * 15).toISOString(),
       tenant_id: tenantId,
       metadata: {
           allowed_tools: body.allowed_tools,
           fallback_policy: body.fallback_policy,
           category: body.category,
           simulate_failure: body.simulate_failure,
           is_simulation: body.is_simulation
       }
    }).select().single();
    
    if (insertError) {
      return NextResponse.json(
        { error: insertError.message, validationErrors: [] },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, task: insertedTask }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req?.url || 'http://localhost');
    const action = searchParams.get('action');

    if (action === 'reset') {
      const tenantId = await getTenantId(req, supabase);
      await supabase.from('supervisor_tasks').delete().eq('tenant_id', tenantId);
      return NextResponse.json({ success: true, tasks: [] });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
