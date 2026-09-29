import { NextRequest, NextResponse } from 'next/server';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']);

/**
 * FreeRADIUS's rlm_rest calls the /api/radius/* hooks directly on
 * http://localhost:3001 (freeradius-config/mods-available/rest). Public
 * traffic reaches the same routes only through nginx, which always sets
 * X-Real-IP / X-Forwarded-For to the client address. So a request is a
 * genuine local hook call only when every forwarded address is loopback.
 *
 * Without this, anyone could POST a guessed voucher code to post-auth and
 * start its validity clock (and book a sale in Keuangan).
 */
export function isLocalHookCall(request: NextRequest): boolean {
  const forwarded = request.headers.get('x-forwarded-for');
  const real = request.headers.get('x-real-ip');
  const addresses = [real, ...(forwarded ? forwarded.split(',') : [])]
    .map((v) => v?.trim())
    .filter((v): v is string => !!v);
  return addresses.every((a) => LOOPBACK.has(a));
}

export function rejectNonLocal(request: NextRequest): NextResponse | null {
  if (isLocalHookCall(request)) return null;
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
