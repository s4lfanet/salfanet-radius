import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIsolationSettings, isIpInIsolationPool } from '@/server/services/isolation.service';

/**
 * Proxy to handle:
 * 1. Admin authentication (only /admin routes)
 * 2. Isolated user detection (auto-redirect to /isolated page)
 * 3. Security headers
 * 4. Bot/scanner path blocking
 * 5. Brute-force rate limiting for admin login
 * 
 * Customer routes (/customer, /login, /) are PUBLIC - no NextAuth protection
 */

// ============================================
// In-memory rate limiter (Edge-compatible)
// ============================================
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function inMemoryRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }
  if (entry.count >= max) return false; // blocked
  entry.count++;
  return true; // allowed
}

// Paths known to be attacked by bots / scanners — block them immediately
const BLOCKED_PATHS = [
  '/wp-admin', '/wp-login', '/.env', '/phpinfo', '/admin/config',
  '/config.php', '/setup.php', '/install.php', '/.git', '/xmlrpc.php',
  '/actuator', '/console', '/.well-known/security.txt',
];

// Suspicious User-Agent substrings
const BLOCKED_UA_PATTERNS = ['sqlmap', 'nikto', 'masscan', 'nmap', 'hydra', 'medusa'];

export default async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // ============================================
  // 0a. BLOCK KNOWN SCANNER/BOT PATHS
  // ============================================
  if (BLOCKED_PATHS.some(p => pathname.startsWith(p))) {
    return new NextResponse(null, { status: 404 });
  }

  // ============================================
  // 0b. BLOCK SUSPICIOUS USER-AGENTS
  // ============================================
  const ua = (req.headers.get('user-agent') || '').toLowerCase();
  if (BLOCKED_UA_PATTERNS.some(p => ua.includes(p))) {
    return new NextResponse(null, { status: 403 });
  }

  // ============================================
  // 0c. ADMIN LOGIN BRUTE-FORCE PROTECTION
  // ============================================
  if (pathname === '/api/auth/callback/credentials' && req.method === 'POST') {
    const forwarded = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const ip = forwarded?.split(',')[0]?.trim() || realIp || 'unknown';
    const allowed = inMemoryRateLimit(`admin-login:${ip}`, 10, 15 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
        { status: 429 }
      );
    }
  }

  // ============================================
  // 1. ISOLATION CHECK (for all non-static routes)
  // ============================================
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const sourceIp = forwarded?.split(',')[0]?.trim() || realIp || '';
  
  if (sourceIp) {
    try {
      const isolationSettings = await getIsolationSettings();
      const isIsolatedIp = isolationSettings.isolationEnabled && 
        isIpInIsolationPool(sourceIp, isolationSettings.isolationIpPool);
      
      if (isIsolatedIp) {
        const allowedPaths = [
          '/isolated', '/pay', '/api', '/_next', '/favicon.ico', '/logo.png', '/images', '/admin',
        ];
        const isAllowedPath = allowedPaths.some(path => pathname.startsWith(path));
        const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(pathname);
        
        if (!isAllowedPath && !hasFileExtension) {
          console.log(`[PROXY] Isolated IP detected: ${sourceIp}, redirecting to /isolated`);
          const url = req.nextUrl.clone();
          url.pathname = '/isolated';
          url.searchParams.set('ip', sourceIp);
          return NextResponse.redirect(url);
        }
      }
    } catch (error) {
      console.error('[PROXY] Error checking isolation settings:', error);
      // Fallback hardcoded check
      if (sourceIp.startsWith('192.168.200.')) {
        const allowedPaths = ['/isolated', '/pay', '/api', '/_next', '/favicon.ico', '/logo.png', '/images', '/admin'];
        const isAllowedPath = allowedPaths.some(path => pathname.startsWith(path));
        const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(pathname);
        
        if (!isAllowedPath && !hasFileExtension) {
          console.log(`[PROXY] Isolated IP detected (fallback): ${sourceIp}, redirecting to /isolated`);
          const url = req.nextUrl.clone();
          url.pathname = '/isolated';
          url.searchParams.set('ip', sourceIp);
          return NextResponse.redirect(url);
        }
      }
    }
  }

  // ============================================
  // 2. ADMIN AUTH CHECK - only for /admin routes (except /admin/login)
  // ============================================
  if (pathname.startsWith('/admin') && pathname !== '/admin/login' && pathname !== '/admin/auth/two-factor') {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET || 'salfanet-radius-secret-change-in-production',
    });

    if (!token) {
      const loginUrl = new URL('/admin/login', req.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ============================================
  // 3. SECURITY HEADERS (for all routes)
  // ============================================
  const response = NextResponse.next();
    
  // X-Frame-Options: Prevents clickjacking attacks
  response.headers.set('X-Frame-Options', 'DENY');
  
  // X-Content-Type-Options: Prevents MIME sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');
  
  // X-XSS-Protection: Legacy XSS protection (for older browsers)
  response.headers.set('X-XSS-Protection', '1; mode=block');
  
  // Referrer-Policy: Controls referrer information
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions-Policy: Controls browser features
  // geolocation=(self) — allow same-origin geolocation (used in GPS features on admin pages)
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self), interest-cohort=()'
  );
  
  // Content-Security-Policy: Comprehensive protection against XSS
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://static.cloudflareinsights.com",
    "script-src-elem 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://api.fonnte.com https://api.wablas.com https://cloudflareinsights.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
  ].join('; ');
  response.headers.set('Content-Security-Policy', cspDirectives);
  
  // X-DNS-Prefetch-Control: Control DNS prefetching
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  
  // X-Download-Options: Prevent IE from executing downloads
  response.headers.set('X-Download-Options', 'noopen');
  
  // X-Permitted-Cross-Domain-Policies: Control Adobe Flash/PDF
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  
  // Remove technology disclosure headers
  response.headers.delete('X-Powered-By');
  response.headers.delete('Server');
  
  return response;
}

export const config = {
  matcher: [
    '/admin/:path*',  // Admin routes (auth required)
    '/api/auth/callback/:path*',  // NextAuth callback - untuk admin login brute-force protection
    '/((?!api|_next/static|_next/image|favicon.ico|logo.png|manifest.json|manifest-admin.json|manifest-agent.json|manifest-customer.json|manifest-technician.json|pwa).*)', // All other routes (for isolated IP check + security headers)
  ],
};
