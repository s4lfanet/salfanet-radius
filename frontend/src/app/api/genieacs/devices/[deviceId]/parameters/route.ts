import { type NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { getParameterValues, setParameterValues } from '@/lib/genieacs/api-client';
import type { ParamUpdate } from '@/lib/genieacs/types';

/**
 * GET /api/genieacs/devices/[deviceId]/parameters
 *   ?paths=Device.DeviceInfo.SoftwareVersion,Device.DeviceInfo.HardwareVersion,...
 *
 * POST /api/genieacs/devices/[deviceId]/parameters
 *   body: { updates: [{ path, value, type? }] }
 *
 * Both return a GenieACS task object (queued to run at next inform).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  try {
    const { deviceId } = await params;
    const url = new URL(req.url);
    const pathsParam = url.searchParams.get('paths') ?? '';
    const paths = pathsParam
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (paths.length === 0) return fail('paths query param is required', 400);
    const task = await getParameterValues(deviceId, paths);
    return ok(task);
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  try {
    const { deviceId } = await params;
    const body = await req.json();
    const updates: ParamUpdate[] = body?.updates;
    if (!Array.isArray(updates) || updates.length === 0) {
      return fail('updates array is required', 400);
    }
    for (const u of updates) {
      if (!u.path || u.value === undefined) {
        return fail('Each update must have path and value', 400);
      }
    }
    const task = await setParameterValues(deviceId, updates);
    return ok(task);
  } catch (e) {
    return fail((e as Error).message);
  }
}
