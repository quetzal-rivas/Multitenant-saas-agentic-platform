import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getMembership } from '@/lib/auth/membership'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your_supabase')) {
    return supabaseResponse
  }

  try {
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({
              request,
            })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    // Refresh session if expired
    const { data: { user } } = await supabase.auth.getUser()

    const path = request.nextUrl.pathname
    const isDashboard = path.startsWith('/dashboard')
    const isOnboarding = path.startsWith('/onboarding')

    const redirectTo = (pathname: string) => {
      const url = request.nextUrl.clone()
      url.pathname = pathname
      url.search = ''
      const response = NextResponse.redirect(url)
      // Keep any refreshed auth cookies on the redirect.
      supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
      return response
    }

    if (!user && (isDashboard || isOnboarding)) {
      return redirectTo('/login')
    }

    // Every account must belong to an organization before it can use the dashboard.
    if (user && (isDashboard || isOnboarding)) {
      const membership = await getMembership(supabase, user.id)
      if (!membership && isDashboard) return redirectTo('/onboarding')
      if (membership && isOnboarding) return redirectTo('/dashboard')
    }

    return supabaseResponse
  } catch (error) {
    return supabaseResponse
  }
}
