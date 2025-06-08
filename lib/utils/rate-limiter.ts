import { LRUCache } from 'lru-cache';

interface RateLimiterOptions {
  uniqueTokenPerInterval: number;
  intervalMs: number;
}

// Default: 10 requests per minute
const defaultOptions: RateLimiterOptions = {
  uniqueTokenPerInterval: 10,
  intervalMs: 60 * 1000, 
};

// Cache to store IP addresses and their request timestamps
const ipRequestCounts = new LRUCache<string, number[]>({
  max: 500, // Max number of unique IPs to track
  ttl: defaultOptions.intervalMs, // Entries automatically clear after the interval
});

export function checkRateLimit(ip: string | undefined, options?: Partial<RateLimiterOptions>): boolean {
  if (!ip) {
    // If IP is not available, we might choose to allow or deny. For now, let's allow.
    // In a real scenario, you might want to block requests without identifiable IPs or use a global limit.
    return true; 
  }

  const { uniqueTokenPerInterval, intervalMs } = { ...defaultOptions, ...options };

  const now = Date.now();
  let requestTimestamps = ipRequestCounts.get(ip) || [];

  // Filter out timestamps older than the current interval
  requestTimestamps = requestTimestamps.filter(timestamp => now - timestamp < intervalMs);

  if (requestTimestamps.length >= uniqueTokenPerInterval) {
    // Limit exceeded
    ipRequestCounts.set(ip, requestTimestamps); // Update with filtered timestamps
    return false;
  }

  // Add current request timestamp
  requestTimestamps.push(now);
  ipRequestCounts.set(ip, requestTimestamps);
  return true;
} 