export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Only allow same-origin relative paths as the post-login destination.
  const requestedNext = searchParams.get('next') ?? '/onboarding';
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') && !requestedNext.includes('\\')
    ? requestedNext
    : '/onboarding';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return user to an error page or login with error message
  return NextResponse.redirect(`${origin}/login?error=Could%20not%20authenticate%20user`);
}

