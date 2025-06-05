import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { hasSubscriptionAccess } from './lib/subscription-utils'
import { getRateLimiter, getIP } from './lib/rate-limit'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // IMPORTANT: Skip middleware entirely for Stripe webhook
  if (pathname === '/api/stripe/webhook') {
    return NextResponse.next()
  }
  
  // IMPORTANT: Skip middleware for signup endpoint (users can't be authenticated to sign up)
  if (pathname === '/api/auth/signup-user') {
    return NextResponse.next()
  }
  
  // IMPORTANT: Skip middleware for Stripe checkout session creation (part of signup flow)
  if (pathname === '/api/stripe/create-checkout-session') {
    return NextResponse.next()
  }
  
  // Enforce HTTPS and add HSTS header in production
  if (process.env.NODE_ENV === 'production') {
    const requestHeaders = new Headers(request.headers)
    const xForwardedProto = requestHeaders.get('x-forwarded-proto')

    // Redirect HTTP to HTTPS
    if (xForwardedProto === 'http') {
      const httpsUrl = new URL(request.url)
      httpsUrl.protocol = 'https:'
      return NextResponse.redirect(httpsUrl.toString(), 301) // 301 Permanent Redirect
    }
  }

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
    // Apply rate limiting first for API routes
    const ip = getIP(request)
    if (ip) {
      const limiter = getRateLimiter()
      if (limiter) {
        const { success, limit, remaining, reset } = await limiter.limit(ip)
        if (!success) {
          return new NextResponse('Too Many Requests', {
            status: 429,
            headers: {
              'X-RateLimit-Limit': limit.toString(),
              'X-RateLimit-Remaining': remaining.toString(),
              'X-RateLimit-Reset': reset.toString(),
            },
          })
        }
      } else if (process.env.NODE_ENV === 'production') {
        // If limiter is null in production, it means Upstash is not configured.
        // Log an error, as rate limiting is critical.
        console.error('CRITICAL: API Rate Limiter not configured in production. Requests are not being rate-limited.');
      }
    } else {
      // If IP cannot be determined, log a warning. 
      // You might want to block these requests in production if IP is essential for rate limiting.
      console.warn('RateLimit: Could not determine IP for an API request. This request will not be rate-limited.');
    }

    if (!user || error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Add HSTS header in production for API responses as well if not already set
    if (process.env.NODE_ENV === 'production' && !response.headers.has('Strict-Transport-Security')) {
      response.headers.set(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      )
    }
    return response
  }

  // Add HSTS header for non-API responses in production
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    )
  }

  return response
}

// Ensure the middleware is only called for relevant paths.
export const config = {
  matcher: [
     '/login', // Match the login page itself to handle redirects when already logged in
     '/launch/:path*', // Match the launch page and any sub-paths
     '/editor/:path*', // Match the editor page and any sub-paths (like document IDs)
     '/api/:path*', // Match all API routes (webhook exclusion handled in function)
  ],
} 