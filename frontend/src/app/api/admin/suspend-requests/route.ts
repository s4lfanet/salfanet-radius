import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

/**
 * GET /api/admin/suspend-requests
 * List all suspend requests (filter by status)
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'PENDING';
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

  const where: any = {};
  if (status !== 'all') where.status = status;

  const [rows, total] = await Promise.all([
    prisma.suspendRequest.findMany({
      where,
      orderBy: { requestedAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            customerId: true,
            phone: true,
            status: true,
          },
        },
      },
    }),
    prisma.suspendRequest.count({ where }),
  ]);

  return NextResponse.json({ rows, total });
}
