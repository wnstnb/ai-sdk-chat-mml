import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Ensure environment variables are loaded correctly
if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  if (process.env.NODE_ENV === 'production') {
    console.error("RateLimit: Missing Upstash Redis credentials in production. Rate limiting will not be effective.");
    // In production, you might want to throw an error or handle this more gracefully
    // depending on whether rate limiting is critical for startup.
    // For now, we'll allow the app to start but log an error.
  } else {
    // In development, it's common to not have these set up initially.
    console.warn("RateLimit: Missing Upstash Redis credentials. Rate limiting will be disabled in development unless configured.");
  }
}

// Initialize Redis client, but only if credentials are provided
// This allows the application to run in development without Upstash configured,
// though rate limiting will be a no-op in that case.
const redisClient =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// Default rate limiter: 10 requests per 10 seconds from the same IP
// You can create multiple instances with different configurations for different routes.
export const defaultRateLimiter = redisClient
  ? new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(100, "10 s"), // 10 requests from the same IP in 10 seconds
      analytics: true, // Enable analytics on Upstash
      prefix: "ratelimit_default", // Optional: prefix for Redis keys
    })
  : null; // No-op limiter if Redis is not configured

/**
 * A simple pass-through function for development if rate limiting is not configured.
 * In a real scenario where rate limiting is critical even in dev, you'd throw an error
 * or implement a mock limiter.
 */
const mockLimiter = {
  limit: async (identifier: string) => {
    // console.log(`RateLimit (mock): Allow ${identifier}`);
    return {
      success: true,
      pending: Promise.resolve(),
      limit: 10,
      remaining: 9,
      reset: Date.now() + 10000,
    };
  },
};

// Export the actual limiter or the mock one
export const getRateLimiter = () => {
  if (defaultRateLimiter) {
    return defaultRateLimiter;
  }
  // console.warn("Using mock rate limiter as Upstash Redis is not configured.");
  return mockLimiter;
};

// Example of a stricter rate limiter for sensitive operations (e.g., login, password reset)
export const authRateLimiter = redisClient
  ? new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(5, "1 m"), // 5 requests from the same IP in 1 minute
      analytics: true,
      prefix: "ratelimit_auth",
    })
  : null;

export const getAuthRateLimiter = () => {
  if (authRateLimiter) {
    return authRateLimiter;
  }
  return mockLimiter; // Fallback to mock if not configured
}

// Rate limiter for file browser operations (more permissive)
export const fileBrowserRateLimiter = redisClient
  ? new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(100, "10 s"), // 100 requests from the same IP in 10 seconds
      analytics: true,
      prefix: "ratelimit_filebrowser",
    })
  : null;

export const getFileBrowserRateLimiter = () => {
  if (fileBrowserRateLimiter) {
    return fileBrowserRateLimiter;
  }
  return mockLimiter; // Fallback to mock if not configured
};

/**
 * Helper function to get the IP address from the request.
 * Tries to get the IP from 'x-forwarded-for' header (common with proxies/Vercel),
 * then 'x-real-ip', and falls back to request.ip.
 * @param req NextApiRequest or NextRequest
 * @returns IP address string or null
 */
export function getIP(request: Request): string | null {
  const xff = request.headers.get('x-forwarded-for');
  if (typeof xff === 'string') {
    return xff.split(',')[0]?.trim() || null;
  }

  const xRealIp = request.headers.get('x-real-ip');
  if (typeof xRealIp === 'string') {
    return xRealIp.trim();
  }
  
  // For Edge Functions (NextRequest), request.ip is not available.
  // Vercel provides 'x-vercel-forwarded-for'
  const vercelForwardedFor = request.headers.get('x-vercel-forwarded-for');
  if (typeof vercelForwardedFor === 'string') {
    return vercelForwardedFor.trim();
  }

  // Fallback for environments where these headers might not be set
  // This might be less reliable depending on the deployment environment
  // console.warn("Could not determine IP from x-forwarded-for, x-real-ip, or x-vercel-forwarded-for. Rate limiting might be less effective.");
  return null; 
} 