import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Define protected routes that require authentication
const protectedRoutes = ['/launch', '/editor']; // Base paths

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

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
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          // If the cookie is removed, update the cookies for the request and response
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { pathname } = request.nextUrl

  // Check if the user is authenticated
  if (!session) {
    // If not authenticated and trying to access a protected route, redirect to login
    const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
    if (isProtectedRoute) {
      console.log(`Middleware: No session, redirecting from protected route ${pathname} to /login`);
      return NextResponse.redirect(new URL('/login', request.url))
    }
  } else {
    // If authenticated and trying to access the login page, redirect to launch
    if (pathname === '/login') {
      console.log('Middleware: Session found, redirecting from /login to /launch');
      return NextResponse.redirect(new URL('/launch', request.url))
    }
  }

  // If authenticated or accessing a public route, allow the request
  // The response object (res) has potentially been modified by createMiddlewareClient
  // to set refreshed session cookies, so we return it.
  return response
}

// Configure the middleware to run on specific paths
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
    // Explicitly include base paths if needed, although the above regex should cover them
    // '/launch',
    // '/editor/:path*',
    // '/login',
  ],
}; 