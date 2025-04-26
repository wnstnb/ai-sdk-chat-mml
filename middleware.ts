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
  let session = null; // Default to null
  let sessionError = null;

  console.log(`Middleware: Checking session for path: ${request.nextUrl.pathname}`);

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      sessionError = error;
      console.error(`Middleware: Error getting session for path ${request.nextUrl.pathname}:`, error.message);
    } else if (data?.session) {
      session = data.session;
      console.log(`Middleware: Session found for path ${request.nextUrl.pathname}. User ID: ${session.user.id.substring(0, 8)}...`);
    } else {
      console.log(`Middleware: No session data found for path ${request.nextUrl.pathname}.`);
    }
  } catch (error: any) {
    sessionError = error;
    console.error(`Middleware: Exception during getSession for path ${request.nextUrl.pathname}:`, error?.message || error);
  }

  const { pathname } = request.nextUrl

  // Define public paths accessible without authentication
  // const publicPaths = ['/', '/login'] // Not strictly needed for this logic
  // Define protected paths that require authentication
  const protectedPaths = ['/editor', '/launch']

  // Check if the current path is protected
  const isProtectedRoute = protectedPaths.some(path => pathname.startsWith(path))

  // If user is not logged in and trying to access a protected route
  if (!session && isProtectedRoute) {
    console.log(`Middleware: No session, accessing protected path ${pathname}. Redirecting to /login.`)
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    // Optional: Keep original path for redirect after login
    // redirectUrl.searchParams.set('redirectedFrom', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // If user is logged in and trying to access login page, redirect to launch
  if (session && pathname === '/login') {
    console.log(`Middleware: Session found, accessing /login. Redirecting to /launch.`)
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/launch'
    return NextResponse.redirect(redirectUrl)
  }

  // Log access only if no redirect happened
  if (!(sessionError)) { // Avoid logging access allowed if there was a session error
    console.log(`Middleware: Access allowed for path ${pathname}. Session: ${!!session}`);
  }

  // Return the response object, potentially modified by the Supabase client
  return response
}

// Ensure the middleware is only called for relevant paths.
export const config = {
  matcher: [
     '/login', // Match the login page itself to handle redirects when already logged in
     '/launch/:path*', // Match the launch page and any sub-paths
     '/editor/:path*', // Match the editor page and any sub-paths (like document IDs)
  ],
} 