import { type NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { rebootDevice } from '@/lib/genieacs/api-client';

/**
 * POST /api/genieacs/devices/[deviceId]/reboot
 * Queues a reboot task on the device.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  try {
    const { deviceId } = await params;
    const task = await rebootDevice(deviceId);
    return ok(task);
  } catch (e) {
    return fail((e as Error).message);
  }
}
