export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { errorResponse } from '@/lib/http/route-errors';
import { acceptPendingInvite } from '@/lib/services/account';

/** A signed-in account without an organization joins the one that invited it (if any). */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    const u = data.user;
    const joined = await acceptPendingInvite({ id: u.id, email: u.email ?? null, emailConfirmed: !!u.email_confirmed_at });
    return NextResponse.json({ joined });
  } catch (err) {
    return errorResponse(err, 'account:accept-invite');
  }
}
