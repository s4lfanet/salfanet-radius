import { type NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { factoryResetDevice } from '@/lib/genieacs/api-client';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';
import { logActivity } from '@/server/services/activity-log.service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

/**
 * POST /api/genieacs/devices/[deviceId]/factory-reset
 * Queues a factory reset task on the device.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;
  const limited = await rateLimit(req, RateLimitPresets.strict);
  if (limited) return limited;

  try {
    const { deviceId } = await params;
    const task = await factoryResetDevice(deviceId);
    const session = await getServerSession(authOptions);
    await logActivity({
      username: session?.user?.name ?? 'unknown',
      userId: session?.user?.id,
      action: 'genieacs.device.factory-reset',
      description: `Factory reset queued for device: ${deviceId}`,
      module: 'genieacs',
      status: 'warning',
      request: req,
    });
    return ok(task);
  } catch (e) {
    return fail((e as Error).message);
  }
}
