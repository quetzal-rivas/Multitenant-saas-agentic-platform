export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch orgs where the user is a member
    const { data, error } = await supabase
      .from('organization_members')
      .select('role, organizations (id, name, subscription_status)')
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const organizations = data.map((item: any) => ({
      id: item.organizations.id,
      name: item.organizations.name,
      subscription_status: item.organizations.subscription_status || 'unpaid',
      role: item.role,
    }));

    return NextResponse.json({ organizations });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
