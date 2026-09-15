import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { pollDeviceTraffic } from '@/lib/genieacs/acs-traffic';

interface RouteParams {
  params: Promise<{ deviceId: string }>;
}

/**
 * GET /api/genieacs/devices/[deviceId]/traffic
 *
 * Poll current WAN traffic rate (bps) for a device via TR-069 byte counters.
 * Call repeatedly (e.g. every 5-10s) from the UI to build a live rate graph —
 * the first call returns `first: true` with no rate (needs 2 samples).
 *
 * Query params:
 *   refresh=0   — skip connection-request refresh (use cached counters, faster
 *                 but may be stale). Default: refresh enabled.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const authCheck = await requirePermission('network.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { deviceId } = await params;
    const url = new URL(request.url);
    const refresh = url.searchParams.get('refresh') !== '0';

    const result = await pollDeviceTraffic(deviceId, { refresh, waitMs: refresh ? 5000 : 0 });
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error('[ACS Traffic]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to poll traffic' },
      { status: 500 }
    );
  }
}
