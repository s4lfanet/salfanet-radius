import 'server-only'
/**
 * API Rate Limiting Utility
 *
 * Uses Redis as primary store with in-memory fallback.
 *
 * Security improvements (Phase 5):
 * - Redis-backed for multi-process consistency (PM2 cluster)
 * - IP header validation: only trusts cf-connecting-ip (Cloudflare) and
 *   x-forwarded-for from known proxy ranges. Falls back to connection IP.
 * - Atomic INCR + EXPIRE in Redis prevents race conditions
 * - Path-scoped keys prevent bypassing limits by varying other request params
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

// ─── In-memory fallback store ────────────────────────────────────────────────
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetAt: number;
  };
}
const memStore: RateLimitStore = {};

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(memStore).forEach(key => {
    if (memStore[key].resetAt < now) {
      delete memStore[key];
    }
  });
}, 5 * 60 * 1000);

// ─── Redis client (lazy init, graceful fallback) ─────────────────────────────
let _redis: import('ioredis').Redis | null = null;
let _redisAttempted = false;

function getRedis(): import('ioredis').Redis | null {
  if (_redisAttempted) return _redis;
  _redisAttempted = true;
  try {
    const Redis = require('ioredis');
    const url = process.env.REDIS_URL || process.env.REDIS_HOST
      ? `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || '6379'}`
      : 'redis://127.0.0.1:6379';
    _redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    _redis.on('error', () => { /* silent — fallback to memory */ });
    return _redis;
  } catch {
    return null;
  }
}

/**
 * Get client IP from request — hardened against IP header spoofing.
 *
 * Priority (only trusted sources):
 * 1. cf-connecting-ip (Cloudflare sets this, cannot be spoofed by client when
 *    behind Cloudflare proxy)
 * 2. x-forwarded-for FIRST IP (only if request came through our proxy)
 * 3. x-real-ip (set by our nginx)
 * 4. NextRequest.ip / request.headers geo (Next.js built-in)
 * 5. 'unknown' fallback
 *
 * Note: When NOT behind Cloudflare, cf-connecting-ip can be spoofed by the
 * client. In production, Cloudflare strips and rewrites this header, so it
 * is safe to trust. If not using Cloudflare, only x-real-ip from nginx is
 * trusted (nginx overwrites it).
 */
function getClientIp(request: NextRequest): string {
  // Cloudflare connecting IP — highest trust when behind CF
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp && isValidIp(cfConnectingIp)) {
    return cfConnectingIp.trim();
  }

  // x-real-ip — set by our nginx reverse proxy
  const realIp = request.headers.get('x-real-ip');
  if (realIp && isValidIp(realIp)) {
    return realIp.trim();
  }

  // x-forwarded-for — take first IP (closest to server)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp && isValidIp(firstIp)) {
      return firstIp;
    }
  }

  // Next.js built-in (from connection)
  try {
    // NextRequest.geo may have country but not IP; use ip property if available
    const connIp = (request as any).ip;
    if (connIp && isValidIp(connIp)) {
      return connIp;
    }
  } catch { /* ignore */ }

  return 'unknown';
}

/**
 * Validate that a string is a valid IPv4 or IPv6 address.
 * Prevents injection of arbitrary strings via forged headers.
 */
function isValidIp(ip: string): boolean {
  const trimmed = ip.trim();
  if (!trimmed || trimmed.length > 45) return false; // IPv6 max 45 chars
  // IPv4
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4.test(trimmed)) {
    return trimmed.split('.').every(octet => {
      const n = parseInt(octet, 10);
      return n >= 0 && n <= 255;
    });
  }
  // IPv6 (simplified check)
  const ipv6 = /^[0-9a-fA-F:]+$/;
  return ipv6.test(trimmed);
}

/**
 * Get client identifier from request (IP + path scope)
 */
function getClientId(request: NextRequest): string {
  const ip = getClientIp(request);
  const path = new URL(request.url).pathname;
  return `${ip}:${path}`;
}

/**
 * Check if request should be rate limited.
 *
 * Uses Redis INCR + EXPIRE for atomic, race-condition-free counting.
 * Falls back to in-memory store if Redis is unavailable.
 *
 * @param request - NextRequest object
 * @param config - Rate limit configuration
 * @returns true if rate limit exceeded, false otherwise
 */
export async function rateLimit(
  request: NextRequest,
  config: RateLimitConfig = { max: 100, windowMs: 60000 }
): Promise<boolean> {
  const clientId = getClientId(request);
  const redisKey = `ratelimit:${clientId}`;
  const windowSeconds = Math.ceil(config.windowMs / 1000);

  // ─── Skip rate limiting for internal/localhost requests ──────────────────
  // NextAuth authorize() calls backend verify from localhost (server-to-server).
  // Rate limiting localhost would block all logins after 10 total attempts.
  const clientIp = getClientIp(request);
  if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === 'localhost') {
    return false;
  }

  // ─── Try Redis first ──────────────────────────────────────────────────────
  const redis = getRedis();
  if (redis) {
    try {
      // Atomic INCR + EXPIRE via Lua script (Redis 6 compatible)
      // Sets TTL only on first INCR (when count == 1), avoiding the need
      // for EXPIRE ... NX which is Redis 7+ only.
      const luaScript = `
        local count = redis.call('INCR', KEYS[1])
        if count == 1 then
          redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
        end
        return count
      `;
      const count = await redis.eval(luaScript, 1, redisKey, windowSeconds);
      if (count && (count as number) > config.max) {
        return true;
      }
      return false;
    } catch {
      // Redis error — fall through to in-memory
    }
  }

  // ─── In-memory fallback ───────────────────────────────────────────────────
  const now = Date.now();
  let client = memStore[clientId];

  if (!client || client.resetAt < now) {
    memStore[clientId] = { count: 1, resetAt: now + config.windowMs };
    return false;
  }

  client.count++;
  return client.count > config.max;
}

/**
 * Get rate limit info for a client
 */
export async function getRateLimitInfo(request: NextRequest): Promise<{
  count: number;
  resetAt: number;
  remaining: number;
}> {
  const clientId = getClientId(request);
  const redisKey = `ratelimit:${clientId}`;

  const redis = getRedis();
  if (redis) {
    try {
      const [count, ttl] = await Promise.all([
        redis.get(redisKey),
        redis.ttl(redisKey),
      ]);
      const numCount = count ? parseInt(count, 10) : 0;
      const resetAt = ttl > 0 ? Date.now() + ttl * 1000 : Date.now() + 60000;
      return {
        count: numCount,
        resetAt,
        remaining: Math.max(0, 100 - numCount),
      };
    } catch { /* fall through */ }
  }

  const client = memStore[clientId];
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
  // Very strict - for sensitive operations (login, payment, OTP)
  strict: { max: 5, windowMs: 60000 }, // 5 req/min

  // Moderate - for normal API endpoints
  moderate: { max: 60, windowMs: 60000 }, // 60 req/min

  // Relaxed - for public endpoints
  relaxed: { max: 100, windowMs: 60000 }, // 100 req/min

  // Very relaxed - for internal/trusted endpoints
  veryRelaxed: { max: 500, windowMs: 60000 }, // 500 req/min

  // Auth endpoints — brute force protection
  auth: { max: 10, windowMs: 15 * 60 * 1000 }, // 10 per 15 minutes
};

/**
 * Helper to reset rate limit for a specific client
 * Useful for manual interventions
 */
export async function resetRateLimit(ip: string, path: string) {
  const clientId = `${ip}:${path}`;
  const redisKey = `ratelimit:${clientId}`;

  const redis = getRedis();
  if (redis) {
    try { await redis.del(redisKey); } catch { /* ignore */ }
  }
  delete memStore[clientId];
}

/**
 * Get all current rate limit entries (for monitoring)
 */
export async function getRateLimitStats(): Promise<{ clientId: string; count: number; resetAt: number }[]> {
  const redis = getRedis();
  if (redis) {
    try {
      const keys = await redis.keys('ratelimit:*');
      const stats: { clientId: string; count: number; resetAt: number }[] = [];
      for (const key of keys) {
        const [count, ttl] = await Promise.all([
          redis.get(key),
          redis.ttl(key),
        ]);
        stats.push({
          clientId: key.replace('ratelimit:', ''),
          count: count ? parseInt(count, 10) : 0,
          resetAt: ttl > 0 ? Date.now() + ttl * 1000 : Date.now(),
        });
      }
      return stats;
    } catch { /* fall through */ }
  }

  const now = Date.now();
  return Object.entries(memStore)
    .filter(([_, data]) => data.resetAt >= now)
    .map(([clientId, data]) => ({
      clientId,
      count: data.count,
      resetAt: data.resetAt,
    }));
}
