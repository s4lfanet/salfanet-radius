import { type NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { getDevice, deleteDevice } from '@/lib/genieacs/api-client';
import { logActivity } from '@/server/services/activity-log.service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

/**
 * GET /api/genieacs/devices/[deviceId]
 * DELETE /api/genieacs/devices/[deviceId]
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  try {
    const { deviceId } = await params;
    const device = await getDevice(deviceId);
    if (!device) return fail('Device not found', 404);
    return ok(device);
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  try {
    const { deviceId } = await params;
    await deleteDevice(deviceId);
    const session = await getServerSession(authOptions);
    await logActivity({
      username: session?.user?.name ?? 'unknown',
      userId: session?.user?.id,
      action: 'genieacs.device.delete',
      description: `Deleted GenieACS device: ${deviceId}`,
      module: 'genieacs',
      status: 'warning',
      request: req,
    });
    return ok({ deviceId });
  } catch (e) {
    return fail((e as Error).message);
  }
}
