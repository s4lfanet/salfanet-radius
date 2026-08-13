import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

async function verifyCustomerToken(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return null;
    const session = await prisma.customerSession.findFirst({
      where: { token, verified: true, expiresAt: { gte: new Date() } },
    });
    if (!session) return null;
    return await prisma.pppoeUser.findUnique({
      where: { id: session.userId },
      select: { id: true },
    });
  } catch {
    return null;
  }
}

// POST /api/customer/notifications/:id/read
// Notifications are derived dynamically (not stored per-customer), so this is a
// no-op acknowledgement endpoint — the Flutter app handles read state locally.
export async function POST(request: NextRequest) {
  const user = await verifyCustomerToken(request);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ success: true });
}
