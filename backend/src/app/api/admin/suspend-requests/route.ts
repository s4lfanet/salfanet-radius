import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';

/**
 * GET /api/admin/suspend-requests
 * List all suspend requests (filter by status)
 */
export async function GET(request: NextRequest) {
  const authCheck = await requirePermission('customers.view');
  if (!authCheck.authorized) return authCheck.response;
  const session = authCheck.session;

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
