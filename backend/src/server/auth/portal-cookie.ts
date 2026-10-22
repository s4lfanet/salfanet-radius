import { NextRequest } from 'next/server';

/**
 * Whether a portal login cookie (technician-token, collector-token) may carry
 * the Secure flag. It follows the scheme the browser used, not NODE_ENV: an
 * install reached over plain http (by IP, before SSL is set up) would
 * otherwise get a cookie the browser refuses to store, and the login would
 * bounce straight back to the login page.
 */
export function isSecureRequest(req: NextRequest): boolean {
  const forwarded = req.headers.get('x-forwarded-proto')?.split(',')[0].trim();
  if (forwarded) return forwarded === 'https';
  return req.nextUrl.protocol === 'https:';
}
