import { NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { deleteFault } from '@/lib/genieacs/api-client';

/**
 * POST /api/genieacs/faults/bulk-delete
 * body: { ids: string[] }
 *
 * Ported from salfanet-radius-go DeleteFaultsBulk (genieacs_ext.go):
 * iterates over the supplied fault IDs and deletes each one from GenieACS.
 * Returns counts of successful and failed deletions.
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const ids: unknown = body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return fail('ids array is required', 400);
    }

    let success = 0;
    let failed = 0;
    const errors: { id: string; error: string }[] = [];

    for (const id of ids) {
      if (typeof id !== 'string' || !id) {
        failed++;
        errors.push({ id: String(id), error: 'invalid id' });
        continue;
      }
      try {
        await deleteFault(id);
        success++;
      } catch (e) {
        failed++;
        errors.push({ id, error: (e as Error).message });
      }
    }

    return ok({ success, failed, errors }, ids.length);
  } catch (e) {
    return fail((e as Error).message);
  }
}
