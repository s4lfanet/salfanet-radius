import { NextRequest } from 'next/server';
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response';
import { requirePermission } from '@/server/middleware/api-auth';
import { getFailedSyncs, manualRetry } from '@/server/services/radius/radius-sync-queue.service';
import { runReconciliation } from '@/server/services/radius/radius-reconciliation.service';

// GET /api/admin/pppoe/radius-sync/status
// View failed/dead syncs and run reconciliation
export async function GET(request: NextRequest) {
  const auth = await requirePermission('customers.view');
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'reconcile') {
      // Run full reconciliation report
      const report = await runReconciliation();
      return ok(report);
    }

    // Default: return failed syncs
    const failedSyncs = await getFailedSyncs(100);
    return ok({
      failedSyncs,
      count: failedSyncs.length,
    });
  } catch (error) {
    console.error('[radius-sync-status] error:', error);
    return serverError();
  }
}

// POST /api/admin/pppoe/radius-sync/retry
// Manually retry a dead/failed sync entry
export async function POST(request: NextRequest) {
  const auth = await requirePermission('customers.edit');
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { queueId } = body as { queueId?: string };

    if (!queueId) {
      return badRequest('queueId is required');
    }

    await manualRetry(queueId);
    return ok({ success: true, message: 'Sync entry reset for immediate retry' });
  } catch (error) {
    console.error('[radius-sync-retry] error:', error);
    return serverError();
  }
}
