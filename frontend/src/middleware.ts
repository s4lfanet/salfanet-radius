import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Route protection middleware.
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

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip non-page requests and API routes entirely
  if (pathname.startsWith('/api/')) return NextResponse.next();
  if (pathname.startsWith('/_next/')) return NextResponse.next();
  if (pathname.includes('.')) return NextResponse.next();

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
