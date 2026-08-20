import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_PREFIXES = ['/board', '/export']

export async function middleware(request: NextRequest) {
  console.log('[MW] enter', request.nextUrl.pathname)

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname, search } = request.nextUrl
  const isProtected = PROTECTED_PREFIXES.some(p => pathname.startsWith(p))
  console.log('[MW]', pathname, 'user?', !!user, 'protected?', isProtected)

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`
    const redirect = NextResponse.redirect(loginUrl)
    supabaseResponse.cookies.getAll().forEach(c => redirect.cookies.set(c.name, c.value))
    return redirect
  }

  // Admin-only routes: authenticated but non-admin → redirect to /board
  if (pathname.startsWith('/export')) {
    const isAdmin = user?.app_metadata?.is_admin === true
    if (!isAdmin) {
      const boardUrl = request.nextUrl.clone()
      boardUrl.pathname = '/board'
      boardUrl.search = ''
      const redirect = NextResponse.redirect(boardUrl)
      supabaseResponse.cookies.getAll().forEach(c => redirect.cookies.set(c.name, c.value))
      return redirect
    }
  }

  if (pathname === '/login' && user) {
    const boardUrl = request.nextUrl.clone()
    boardUrl.pathname = '/board'
    boardUrl.search = ''
    const redirect = NextResponse.redirect(boardUrl)
    supabaseResponse.cookies.getAll().forEach(c => redirect.cookies.set(c.name, c.value))
    return redirect
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
