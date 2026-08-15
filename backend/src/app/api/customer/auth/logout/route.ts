import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';

/**
 * POST /api/customer/auth/logout
 * Server-side logout: invalidate the customer session token in the database.
 * Body: none — token is read from Authorization header.
 */
export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, RateLimitPresets.moderate);
  if (limited) {
    return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
  }
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token) {
      // Mark the session as expired / delete it so the token can no longer be used
      await prisma.customerSession.deleteMany({
        where: { token },
      });
    }

    return NextResponse.json({ success: true, message: 'Logged out' });
  } catch (error) {
    console.error('Customer logout error:', error);
    return NextResponse.json({ success: true, message: 'Logged out' });
  }
}
