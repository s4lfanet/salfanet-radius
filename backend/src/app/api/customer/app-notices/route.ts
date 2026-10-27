import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/app-notices — the pushes sent to this customer in the
 * last 7 days, newest first. The native app polls this when the server has
 * no Firebase, and shows the ones it has not shown yet.
 */
export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const session = token
    ? await prisma.customerSession.findFirst({
        where: { token, verified: true, expiresAt: { gte: new Date() } },
        select: { userId: true },
      })
    : null;
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const notices = await prisma.customerAppNotice.findMany({
    where: { userId: session.userId, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { id: true, title: true, body: true, url: true, createdAt: true },
  });
  return NextResponse.json({ success: true, notices }, { headers: { 'Cache-Control': 'no-store' } });
}
