/**
 * API Rate Limiting Utility
 *
 * Menggunakan in-memory store.
 *
 * Usage:
 * ```typescript
 * import { rateLimit } from '@/server/middleware/rate-limit';
 *
 * export async function POST(request: NextRequest) {
 *   const limited = await rateLimit(request, { max: 60, windowMs: 60000 });
 *   if (limited) {
 *     return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
 *   }
 *   // Your API logic here...
 * }
 * ```
 */

import { NextRequest } from 'next/server';

interface RateLimitConfig {
  max: number; // Maximum requests
  windowMs: number; // Time window in milliseconds
  skipSuccessfulRequests?: boolean; // Don't count successful requests
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetAt: number;
  };
}

// In-memory store
const store: RateLimitStore = {};

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach(key => {
    if (store[key].resetAt < now) {
      delete store[key];
    }
  });
}, 5 * 60 * 1000);

/**
 * Get client identifier from request
 */
function getClientId(request: NextRequest): string {
  // Try to get real IP from headers (for proxies/load balancers)
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip'); // Cloudflare
  
  const ip = cfConnectingIp || forwardedFor?.split(',')[0] || realIp || 'unknown';
  
  // Also include path to allow different limits per endpoint
  const path = new URL(request.url).pathname;
  
  return `${ip}:${path}`;
}

/**
 * Check if request should be rate limited
 *
 * Menggunakan in-memory store.
 *
 * @param request - NextRequest object
 * @param config - Rate limit configuration
 * @returns true if rate limit exceeded, false otherwise
 */
export async function rateLimit(
  request: NextRequest,
  config: RateLimitConfig = { max: 100, windowMs: 60000 } // Default: 100 req/min
): Promise<boolean> {
  const clientId = getClientId(request);

  // ---- In-memory store ----
  const now = Date.now();
  let client = store[clientId];

  if (!client || client.resetAt < now) {
    store[clientId] = { count: 1, resetAt: now + config.windowMs };
    return false;
  }

  client.count++;
  return client.count > config.max;
}

/**
 * Get rate limit info for a client
 */
export function getRateLimitInfo(request: NextRequest): {
  count: number;
  resetAt: number;
  remaining: number;
} {
  const clientId = getClientId(request);
  const client = store[clientId];
  
  if (!client || client.resetAt < Date.now()) {
    return {
      count: 0,
      resetAt: Date.now() + 60000,
      remaining: 100,
    };
  }
  
  return {
    count: client.count,
    resetAt: client.resetAt,
    remaining: Math.max(0, 100 - client.count),
  };
}

/**
 * Preset rate limit configurations
 */
export const RateLimitPresets = {
  // Very strict - for sensitive operations (login, payment)
  strict: { max: 5, windowMs: 60000 }, // 5 req/min
  
  // Moderate - for normal API endpoints
  moderate: { max: 60, windowMs: 60000 }, // 60 req/min
  
  // Relaxed - for public endpoints
  relaxed: { max: 100, windowMs: 60000 }, // 100 req/min
  
  // Very relaxed - for internal/trusted endpoints
  veryRelaxed: { max: 500, windowMs: 60000 }, // 500 req/min
};

/**
 * Helper to reset rate limit for a specific client
 * Useful for manual interventions
 */
export function resetRateLimit(ip: string, path: string) {
  const clientId = `${ip}:${path}`;
  delete store[clientId];
}

/**
 * Get all current rate limit entries (for monitoring)
 */
export function getRateLimitStats(): { clientId: string; count: number; resetAt: number }[] {
  const now = Date.now();
  return Object.entries(store)
    .filter(([_, data]) => data.resetAt >= now)
    .map(([clientId, data]) => ({
      clientId,
      count: data.count,
      resetAt: data.resetAt,
    }));
}
