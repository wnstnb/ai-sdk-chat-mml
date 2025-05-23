import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { hasSubscriptionAccess } from './lib/subscription-utils'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Create a response object to modify headers if needed
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
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Get the current user
  const { data: { user }, error } = await supabase.auth.getUser()

  // Handle login page - redirect if already authenticated
  if (pathname === '/login') {
    if (user && !error) {
      return NextResponse.redirect(new URL('/launch', request.url))
    }
    return response
  }

  // For protected routes (/launch and /editor), require authentication AND subscription
  if (pathname.startsWith('/launch') || pathname.startsWith('/editor')) {
    // First check authentication
    if (!user || error) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Then check subscription status
    try {
      const hasAccess = await hasSubscriptionAccess(user.id)
      
      if (!hasAccess) {
        console.log(`Access denied for user ${user.id} - no active subscription`)
        // Redirect to a subscription/billing page or show an access denied page
        // You can create a /subscription-required page for this
        const subscriptionUrl = new URL('/subscription-required', request.url)
        subscriptionUrl.searchParams.set('reason', 'subscription_required')
        return NextResponse.redirect(subscriptionUrl)
      }
      
      // User has both authentication and active subscription - allow access
      console.log(`Access granted for user ${user.id} - active subscription verified`)
      return response
      
    } catch (subscriptionError) {
      console.error(`Subscription check failed for user ${user.id}:`, subscriptionError)
      // On system error, you might want to allow access or redirect to error page
      // For security, let's deny access on system errors
      const errorUrl = new URL('/subscription-required', request.url)
      errorUrl.searchParams.set('reason', 'system_error')
      return NextResponse.redirect(errorUrl)
    }
  }

  // For API routes, check authentication (subscription checking can be done per endpoint as needed)
  if (pathname.startsWith('/api/')) {
    if (!user || error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return response
  }

  return response
}

// Ensure the middleware is only called for relevant paths.
export const config = {
  matcher: [
     '/login', // Match the login page itself to handle redirects when already logged in
     '/launch/:path*', // Match the launch page and any sub-paths
     '/editor/:path*', // Match the editor page and any sub-paths (like document IDs)
     '/api/((?!stripe/webhook).*)', // Match API routes but exclude /api/stripe/webhook
  ],
} 