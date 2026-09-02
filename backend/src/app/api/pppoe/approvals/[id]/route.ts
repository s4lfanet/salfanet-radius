import { NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, badRequest, notFound, serverError } from '@/lib/api-response';
import { approvePppoeUser, rejectPppoeUser } from '@/server/services/pppoe.service';

// POST — approve or reject a pending registration
// Body: { userId: string, action: 'approve' | 'reject', reason?: string }
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
    if (err.code === 'INVALID_STATE') return badRequest(err.message);
    console.error('Approval action error:', error);
    return serverError();
  }
}
