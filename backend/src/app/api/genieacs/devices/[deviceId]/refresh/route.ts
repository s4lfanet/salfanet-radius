import { type NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import {
  getDevice,
  createTask,
  getTasks,
  sendDirectConnectionRequest,
  extractConnectionRequestInfo,
} from '@/lib/genieacs/api-client';

/**
 * POST /api/genieacs/devices/[deviceId]/refresh
 *
 * Ported from salfanet-radius-go RefreshDevice (genieacs_ext.go):
 *   1. Fetch device to get ConnectionRequestURL + credentials.
 *   2. Queue a getParameterValues task with a curated parameter list.
 *   3. Send a direct connection request to the device (bypassing GenieACS
 *      when it cannot reach the CPE). Falls back to GenieACS CR when no
 *      direct URL is available.
 *   4. Poll the task list for up to 20 seconds (10 iterations × 2s) to
 *      report whether the task was executed.
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

    // 1. Fetch device to get ConnectionRequestURL + credentials
    const device = await getDevice(deviceId);
    if (!device) return fail('device not found', 404);
    const { crURL, crUser, crPass } = extractConnectionRequestInfo(device);

    // 2. Create getParameterValues task with curated parameter list
    // (matches Go source RefreshDevice parameterNames)
    const task: any = {
      name: 'getParameterValues',
      parameterNames: [
        'InternetGatewayDevice.DeviceInfo.SerialNumber',
        'InternetGatewayDevice.DeviceInfo.Manufacturer',
        'InternetGatewayDevice.DeviceInfo.ModelName',
        'InternetGatewayDevice.DeviceInfo.SoftwareVersion',
        'InternetGatewayDevice.ManagementServer.ConnectionRequestURL',
        'InternetGatewayDevice.ManagementServer.PeriodicInformInterval',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionStatus',
      ],
    };
    const created = await createTask(deviceId, task);
    const taskId = (created as any)?._id ?? '';

    // 3. Send direct connection request (or fallback to GenieACS CR)
    if (crURL) {
      // Fire-and-forget — do not block the response on the device CR.
      sendDirectConnectionRequest(crURL, crUser, crPass, deviceId).catch(() => undefined);
    } else {
      // Fallback: trigger GenieACS connection request (no direct URL available)
      try {
        await createTask(deviceId, {} as any);
      } catch {
        /* best-effort */
      }
    }

    // 4. Poll task list for up to 20s to detect execution
    let taskExecuted = false;
    if (taskId) {
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const tasks = await getTasks();
          const found = (tasks as any[]).some((t) => t?._id === taskId);
          if (!found) {
            taskExecuted = true;
            break;
          }
        } catch {
          /* keep polling */
        }
      }
    }

    return ok({ ...created, taskExecuted, objectName });
  } catch (e) {
    return fail((e as Error).message);
  }
}
