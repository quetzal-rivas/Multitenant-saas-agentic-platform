export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `tenant-${Date.now()}`;

    // 1. Insert organization
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .insert({ slug, name, subscription_status: 'active' })
      .select('id, slug, name')
      .single();

    if (orgError) {
      return NextResponse.json({ error: `Failed to create organization: ${orgError.message}` }, { status: 500 });
    }

    const tenantId = organization.id;

    // 2. Insert organization member
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: tenantId,
        user_id: user.id,
        role: 'owner'
      });

    if (memberError) {
      return NextResponse.json({ error: `Failed to assign organization owner: ${memberError.message}` }, { status: 500 });
    }

    return NextResponse.json({
      id: tenantId,
      name,
      role: 'owner',
      subscription_status: 'unpaid'
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Invalid request' }, { status: 500 });
  }
}
