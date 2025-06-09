import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { hasSubscriptionAccess } from './lib/subscription-utils'
import { getRateLimiter, getAuthRateLimiter, getFileBrowserRateLimiter, getUserActionRateLimiter, getIP } from './lib/rate-limit'

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
    const ip = getIP(request);
    let limiterResponse: { success: boolean; limit: number; remaining: number; reset: number; } | null = null;
    let specificLimiterApplied = false;
    let chosenLimiterType = 'default'; // For logging

    if (ip) {
      let limiter;
      // Apply specific limiters first
      if (pathname.startsWith('/api/auth/') && !pathname.includes('signup-user') && !pathname.includes('complete-social-signup') && !pathname.startsWith('/api/auth/callback')) {
        limiter = getAuthRateLimiter();
        chosenLimiterType = 'auth';
      } else if (pathname.startsWith('/api/file-manager/') || pathname.startsWith('/api/folders/')) {
        limiter = getFileBrowserRateLimiter();
        chosenLimiterType = 'fileBrowser';
      } else {
        limiter = getRateLimiter(); // Default for other API routes
        chosenLimiterType = 'default';
      }

      if (limiter) {
        console.log(`RateLimit: Applying ${chosenLimiterType} Rate Limiter to ${pathname} for IP ${ip}`);
        limiterResponse = await limiter.limit(ip);
        specificLimiterApplied = true; // Even if it's the default, a limiter was chosen and applied
      }

      if (limiterResponse) {
        // Always set rate limit headers on the response if a limiter was effectively used
        // Note: response object might be replaced if a 429 is returned, so headers are set on the final response.
        const headersToSet = {
          'X-RateLimit-Limit': limiterResponse.limit.toString(),
          'X-RateLimit-Remaining': limiterResponse.remaining.toString(),
          'X-RateLimit-Reset': new Date(limiterResponse.reset).toISOString(), // Format reset time as ISO string
        };

        if (!limiterResponse.success) {
          console.log(`RateLimit: Denied for IP ${ip} on path ${pathname} using ${chosenLimiterType} limiter. Limit: ${limiterResponse.limit}, Remaining: ${limiterResponse.remaining}`);
          return new NextResponse('Too Many Requests', {
            status: 429,
            headers: {
              ...headersToSet,
              'Retry-After': Math.ceil((limiterResponse.reset - Date.now()) / 1000).toString(), // Seconds until reset
            },
          });
        }
        console.log(`RateLimit: Allowed for IP ${ip} on path ${pathname} using ${chosenLimiterType} limiter. Limit: ${limiterResponse.limit}, Remaining: ${limiterResponse.remaining}`);
        // Apply headers to the ongoing response if request is allowed
        Object.entries(headersToSet).forEach(([key, value]) => response.headers.set(key, value));
      } else if (process.env.NODE_ENV === 'production' && (!getAuthRateLimiter() || !getFileBrowserRateLimiter() || !getRateLimiter())) {
        console.error('CRITICAL: API Rate Limiter (Upstash) not configured properly in production. Requests might not be rate-limited as expected.');
      }
    } else {
      console.warn('RateLimit: Could not determine IP for an API request. This request will not be rate-limited by IP.');
    }

    // If IP-based rate limiting passed, and user is authenticated, apply user-based rate limiting
    if (user && !error) {
      const userLimiter = getUserActionRateLimiter();
      if (userLimiter) {
        console.log(`RateLimit: Applying User Action Rate Limiter to ${pathname} for User ${user.id}`);
        const userLimiterResponse = await userLimiter.limit(user.id);

        // Update overall response headers with the user-specific limit information if it's more restrictive or if IP limit was not hit
        // The X-RateLimit-* headers will reflect the last active limiter that was checked.
        const headersToSetUser = {
          'X-RateLimit-Limit-User': userLimiterResponse.limit.toString(), // Using a distinct header for clarity
          'X-RateLimit-Remaining-User': userLimiterResponse.remaining.toString(),
          'X-RateLimit-Reset-User': new Date(userLimiterResponse.reset).toISOString(),
        };
        Object.entries(headersToSetUser).forEach(([key, value]) => response.headers.set(key, value));

        if (!userLimiterResponse.success) {
          console.log(`RateLimit: Denied for User ${user.id} on path ${pathname}. Limit: ${userLimiterResponse.limit}, Remaining: ${userLimiterResponse.remaining}`);
          return new NextResponse('Too Many Requests (user limit)', {
            status: 429,
            headers: {
              // Include IP limit headers if they were set and available from previous checks
              ...(response.headers.has('X-RateLimit-Limit') && {
                'X-RateLimit-Limit-IP': response.headers.get('X-RateLimit-Limit')!,
                'X-RateLimit-Remaining-IP': response.headers.get('X-RateLimit-Remaining')!,
                'X-RateLimit-Reset-IP': response.headers.get('X-RateLimit-Reset')!,
              }),
              ...headersToSetUser,
              'Retry-After': Math.ceil((userLimiterResponse.reset - Date.now()) / 1000).toString(),
            },
          });
        }
        console.log(`RateLimit: Allowed for User ${user.id} on path ${pathname}. Limit: ${userLimiterResponse.limit}, Remaining: ${userLimiterResponse.remaining}`);
      } else if (process.env.NODE_ENV === 'production') {
        console.error('CRITICAL: User Action Rate Limiter (Upstash) not configured properly in production.');
      }
    } else if (!user || error) { // This handles the case where user is NOT authenticated for an API route
      // For unauthenticated API access (if any routes allow it beyond the initial IP rate limit)
      // we might want to ensure this doesn't bypass the auth check further down.
      // The existing `if (!user || error)` check AFTER this block handles the 401 correctly.
      // No specific user to rate limit here, so we proceed to the auth check.
       console.log(`RateLimit: No authenticated user for ${pathname}, user-based rate limiting skipped.`);
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