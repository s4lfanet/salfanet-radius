import { type NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { refreshObject } from '@/lib/genieacs/api-client';

/**
 * POST /api/genieacs/devices/[deviceId]/refresh
 * body: { objectName?: string }  – default "InternetGatewayDevice" / "Device"
 *
 * Queues a refreshObject task so GenieACS re-reads the given sub-tree
 * from the CPE at its next inform.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  try {
    const { deviceId } = await params;
    const body = await req.json().catch(() => ({}));
    const objectName: string = body?.objectName || 'InternetGatewayDevice';
    const task = await refreshObject(deviceId, objectName);
    return ok(task);
  } catch (e) {
    return fail((e as Error).message);
  }
}
