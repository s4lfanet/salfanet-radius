/**
 * Redis cache utility — for non-realtime data (profiles, areas, routers, etc.)
 *
 * Design:
 * - Data yang jarang berubah → cache dengan TTL 5 menit
 * - Data semi-realtime → cache dengan TTL 30 detik
 * - Data realtime (online/offline, sessions, invoices) → TIDAK di-cache
 * - Cache di-invalidate manual saat ada mutation (create/update/delete)
 *
 * Fallback: jika Redis tidak tersedia, function tetap jalan tanpa cache
 * (graceful degradation — return null, caller query DB langsung)
 */

import Redis from 'ioredis';

let _redis: Redis | null = null;
let _connectAttempted = false;

function getRedis(): Redis | null {
  if (_connectAttempted) return _redis;
  _connectAttempted = true;

  const url = process.env.REDIS_URL || process.env.REDIS_HOST
    ? `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || '6379'}`
    : 'redis://127.0.0.1:6379';

  try {
    _redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      enableOfflineQueue: false,
      lazyConnect: false,
    });

    _redis.on('error', (err) => {
      // Silent — Redis is optional, fallback to DB
      if (process.env.NODE_ENV === 'development') {
        console.warn('[REDIS] Error:', err.message);
      }
    });

    _redis.on('connect', () => {
      console.log('[REDIS] Connected');
    });

    return _redis;
  } catch (e: any) {
    console.warn('[REDIS] Failed to initialize:', e?.message);
    return null;
  }
}

/**
 * Get cached data by key. Returns null if not found or Redis unavailable.
 */
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis();
    if (!redis) return null;
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/**
 * Set cache with TTL (seconds). Silently fails if Redis unavailable.
 */
export async function setCached<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.setex(key, ttlSeconds, JSON.stringify(data));
  } catch {
    // Silent — cache is optional
  }
}

/**
 * Invalidate cache by key pattern. Use * for wildcard.
 * Example: invalidatePattern('profiles:*') or invalidateKey('routers:list')
 */
export async function invalidateKey(key: string): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.del(key);
  } catch {
    // Silent
  }
}

export async function invalidatePattern(pattern: string): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    // Use SCAN to find keys matching pattern (avoid blocking with KEYS)
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch {
    // Silent
  }
}

/**
 * Cache-aside pattern: try cache first, if miss → call fetchFn → cache result → return
 */
export async function cacheAside<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
): Promise<T> {
  const cached = await getCached<T>(key);
  if (cached !== null) {
    return cached;
  }
  const fresh = await fetchFn();
  await setCached(key, fresh, ttlSeconds);
  return fresh;
}

// ─── Cache key constants ──────────────────────────────────────────────────────
export const CACHE_KEYS = {
  profiles: 'pppoe:profiles',
  areas: 'pppoe:areas',
  routers: 'network:routers',
  routerById: (id: string) => `network:router:${id}`,
  stoppedUsers: 'pppoe:users:stopped',
  invoiceCounts: (userIds: string) => `invoices:counts:${userIds}`,
} as const;

// ─── TTL constants (seconds) ──────────────────────────────────────────────────
export const CACHE_TTL = {
  static: 300,      // 5 minutes — profiles, areas, routers (rarely change)
  semiRealtime: 30, // 30 seconds — stopped users, invoice counts
} as const;
