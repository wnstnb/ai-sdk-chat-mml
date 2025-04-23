import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Create a Supabase client configured to use cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          // If the cookie is updated, update the cookies for the request and response
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          // If the cookie is removed, update the cookies for the request and response
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // Refresh session if expired - important!
  const { data: { session } } = await supabase.auth.getSession()

  const { pathname } = request.nextUrl

  // Define public paths accessible without authentication
  const publicPaths = ['/', '/login']
  // Define protected paths that require authentication
  const protectedPaths = ['/editor', '/launch']

  // Check if the current path is protected
  const isProtectedRoute = protectedPaths.some(path => pathname.startsWith(path))

  // If user is not logged in and trying to access a protected route
  if (!session && isProtectedRoute) {
    console.log(`Middleware: No session, accessing protected path ${pathname}. Redirecting to /login.`)
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    // Keep search params if any, e.g., for redirection after login
    // redirectUrl.search = `redirectedFrom=${pathname}`
    return NextResponse.redirect(redirectUrl)
  }

  // If user is logged in and trying to access login page, redirect to editor
  if (session && pathname === '/login') {
    console.log(`Middleware: Session found, accessing /login. Redirecting to /editor.`)
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/editor'
    return NextResponse.redirect(redirectUrl)
  }

  console.log(`Middleware: Access allowed for path ${pathname}. Session: ${!!session}`)
  // Return the response object, potentially modified by the Supabase client
  return response
}

// Ensure the middleware is only called for relevant paths.
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api routes (optional, depending on your needs)
     * - Specific file extensions (svg, png, jpg, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
} 