import { type NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { getTasks, createTask } from '@/lib/genieacs/api-client';
import type { GenieTask } from '@/lib/genieacs/types';

/**
 * GET /api/genieacs/devices/[deviceId]/tasks
 *   Returns tasks filtered to the given device.
 *
 * POST /api/genieacs/devices/[deviceId]/tasks
 *   body: GenieACS task object (name, parameterValues, parameterNames, objectName, …)
 *   Queues a new task (with optional ?connection_request=true to trigger immediate inform).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  try {
    const { deviceId } = await params;
    const tasks = await getTasks({ device: deviceId });
    return ok(tasks, tasks.length);
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
    const body: Partial<GenieTask> = await req.json();
    if (!body.name) return fail('Task name is required', 400);
    const task = await createTask(deviceId, body);
    return ok(task);
  } catch (e) {
    return fail((e as Error).message);
  }
}
