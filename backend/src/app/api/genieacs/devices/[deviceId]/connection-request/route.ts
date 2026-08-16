import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import {
  getDevice,
  createTask,
  sendDirectConnectionRequest,
  extractConnectionRequestInfo,
} from '@/lib/genieacs/api-client';

interface RouteParams {
  params: Promise<{ deviceId: string }>;
}

/**
 * POST /api/genieacs/devices/[deviceId]/connection-request
 *
 * Ported from salfanet-radius-go ConnectionRequest (genieacs.go) +
 * sendDirectConnectionRequest (genieacs_ext.go):
 *   1. Fetch device to obtain ConnectionRequestURL + CR credentials.
 *   2. If a direct CR URL is available, send a direct connection request
 *      to the device (basic auth first, digest auth on 401 challenge).
 *      This bypasses GenieACS, which may not have a network route to the
 *      CPE.
 *   3. Otherwise, fall back to the GenieACS NBI connection-request task
 *      (`POST /devices/{id}/tasks?connection_request`).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const authCheck = await requirePermission('network.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { deviceId } = await params;

    // 1. Fetch device to get ConnectionRequestURL + credentials
    const device = await getDevice(deviceId);
    if (!device) {
      return NextResponse.json(
        { success: false, error: 'Device tidak ditemukan di GenieACS' },
        { status: 404 },
      );
    }
    const { crURL, crUser, crPass } = extractConnectionRequestInfo(device);

    // 2. Direct connection request to device (bypass GenieACS)
    if (crURL) {
      const result = await sendDirectConnectionRequest(crURL, crUser, crPass, deviceId);
      if (result.ok) {
        return NextResponse.json({
          success: true,
          message: 'Connection request dikirim langsung ke device',
          method: result.method,
          status: result.status,
        });
      }
      // Direct CR failed — fall through to GenieACS CR as a fallback.
      console.warn(
        `[GenieACS] direct CR failed (status=${result.status}), falling back to GenieACS CR for device=${deviceId}`,
      );
    }

    // 3. Fallback: GenieACS connection-request task
    const task = {
      name: 'getParameterValues',
      parameterNames: ['InternetGatewayDevice.DeviceInfo.SoftwareVersion'],
    };
    const created = await createTask(deviceId, task as any);
    return NextResponse.json({
      success: true,
      message: 'Connection request dikirim via GenieACS',
      taskId: (created as any)?._id,
      method: 'genieacs',
    });
  } catch (error) {
    console.error('Error triggering connection request:', error);
    const msg = error instanceof Error ? error.message : 'Terjadi kesalahan';
    // Treat GenieACS 504 (device offline) as a soft error.
    if (/504|timeout/i.test(msg)) {
      return NextResponse.json(
        { success: false, error: 'Device offline atau tidak merespons (timeout)' },
        { status: 200 },
      );
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
