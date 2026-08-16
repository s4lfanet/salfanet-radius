import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Route protection + subdomain routing middleware.
 *
 * Subdomain routing:
 *   customer.domain.com/  → /customer/
 *   pelanggan.domain.com/ → /customer/
 *   agent.domain.com/     → /agent/
 *   agen.domain.com/      → /agent/
 *   teknisi.domain.com/   → /technician/
 *   technician.domain.com/→ /technician/
 *   admin.domain.com/     → /admin/
 *
 * Admin routes (/admin/*) require a valid NextAuth JWT session.
 * Agent, customer, and technician portals use client-side token auth
 * (localStorage-based) and are therefore NOT enforced here — their
 * layout components handle redirects to the appropriate login page.
 *
 * Public routes that never require auth:
 *   /admin/login, /login, /daftar, /evoucher, /pay, /pay-manual,
 *   /payment, /offline, /isolated, /docs, /download-apk,
 *   /api/* (API routes handle their own auth)
 */
const PUBLIC_PATHS = [
  '/admin/login',
  '/login',
  '/daftar',
  '/evoucher',
  '/pay',
  '/pay-manual',
  '/payment',
  '/offline',
  '/isolated',
  '/docs',
  '/download-apk',
];

const SUBDOMAIN_MAP: Record<string, string> = {
  'admin': '/admin',
  'customer': '/customer',
  'pelanggan': '/customer',
  'agent': '/agent',
  'agen': '/agent',
  'teknisi': '/technician',
  'technician': '/technician',
};

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const host = req.headers.get('host') || '';

  // Skip non-page requests and API routes entirely
  if (pathname.startsWith('/api/')) return NextResponse.next();
  if (pathname.startsWith('/_next/')) return NextResponse.next();
  if (pathname.includes('.')) return NextResponse.next();

  // ─── Subdomain routing ──────────────────────────────────────────────
  // Extract subdomain from host (strip port if present)
  const hostname = host.split(':')[0];
  const parts = hostname.split('.');

  // Only rewrite if we have a subdomain (parts.length >= 3 for sub.domain.tld)
  // or if using a custom domain with known subdomain prefix
  if (parts.length >= 3) {
    const sub = parts[0].toLowerCase();
    const targetPath = SUBDOMAIN_MAP[sub];

    if (targetPath) {
      // Rewrite: sub.domain.com/foo → domain.com/customer/foo
      const newPath = pathname === '/' ? targetPath : `${targetPath}${pathname}`;
      const url = req.nextUrl.clone();
      url.pathname = newPath;
      // Keep the same host so the browser URL doesn't change
      return NextResponse.rewrite(url);
    }
  }

  // ─── Auth for /admin/* routes ───────────────────────────────────────
  if (!pathname.startsWith('/admin')) return NextResponse.next();
  if (isPublic(pathname)) return NextResponse.next();

  const secret = process.env.NEXTAUTH_SECRET ||
    (process.env.NODE_ENV !== 'production' ? 'salfanet-radius-secret-change-in-production' : undefined);

  if (!secret) {
    console.error('[middleware] NEXTAUTH_SECRET is missing');
    return NextResponse.redirect(new URL('/admin/login?error=config', req.url));
  }

  const token = await getToken({ req, secret });

  if (!token || !token.id) {
    const loginUrl = new URL('/admin/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except API and static assets
    '/((?!api/|_next/|favicon\\.ico|.*\\.).*)',
  ],
};
