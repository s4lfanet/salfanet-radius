import { NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, badRequest, notFound, serverError } from '@/lib/api-response';
import { prisma } from '@/server/db/client';
import { approvePppoeUser, rejectPppoeUser } from '@/server/services/pppoe.service';

// GET — list pending approvals
export async function GET(_request: NextRequest) {
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

// POST — approve or reject a pending registration
// Body: { userId: string, action: 'approve' | 'reject', reason?: string }
//
// The admin web panel (frontend/src/app/admin/pppoe/approvals/page.tsx) has
// always POSTed here, to this exact base path with no :id segment — but
// until now the only POST handler for this action lived at the sibling
// route pppoe/approvals/[id]/route.ts, which nothing ever calls (Next.js
// only matches that file for /api/pppoe/approvals/<something>). Every
// Setujui/Tolak click on the web panel has been hitting a 405 here. Moving
// the handler to where it's actually reachable — this is also the endpoint
// the new admin mobile app's Approvals screen calls.
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('customers.edit');
  if (!authCheck.authorized) return authCheck.response;
  const session = authCheck.session;
  const adminId = (session?.user as never as { id: string })?.id || 'unknown';
  const adminName = (session?.user as never as { name: string })?.name || 'Admin';

  try {
    const body = await request.json();
    const { userId, action, reason } = body;

    if (!userId || !action) {
      return badRequest('userId and action are required');
    }

    if (action === 'approve') {
      const result = await approvePppoeUser(userId, adminId, adminName, request);
      return ok({ success: true, ...result });
    } else if (action === 'reject') {
      if (!reason) {
        return badRequest('Reason is required for rejection');
      }
      const result = await rejectPppoeUser(userId, adminId, adminName, reason, request);
      return ok({ success: true, ...result });
    } else {
      return badRequest('Invalid action. Use "approve" or "reject"');
    }
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'NOT_FOUND') return notFound(err.message);
    if (err.code === 'INVALID_STATE') return badRequest(err.message || 'Invalid state');
    console.error('Approval action error:', error);
    return serverError();
  }
}
