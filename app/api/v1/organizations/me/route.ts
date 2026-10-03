export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

import { requireAuth, AuthError } from '@/lib/auth/require-auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const supabase = await createClient();


    // Fetch orgs where the user is a member
    const { data, error } = await supabase
      .from('organization_members')
      .select('role, organizations (id, name, subscription_status)')
      .eq('user_id', auth.userId);


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
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

