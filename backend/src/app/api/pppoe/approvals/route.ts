import { NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, serverError } from '@/lib/api-response';
import { prisma } from '@/server/db/client';

// GET — list pending approvals
export async function GET(request: NextRequest) {
  const authCheck = await requirePermission('customers.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const users = await prisma.pppoeUser.findMany({
      where: { approvalStatus: 'pending' },
      include: {
        profile: { select: { id: true, name: true, price: true } },
        area: { select: { id: true, name: true } },
        router: { select: { id: true, name: true } },
        registeredByTechnician: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return ok({ users });
  } catch (error) {
    console.error('Get pending approvals error:', error);
    return serverError();
  }
}
