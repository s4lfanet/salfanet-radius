import { type NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, fail } from '@/lib/genieacs/helpers';
import { getDevices } from '@/lib/genieacs/api-client';
import type { GenieDevice } from '@/lib/genieacs/types';
import {
  getParam,
  formatUptime,
  formatRxPower,
  PPP_USERNAME_PATHS,
  RX_POWER_PATHS,
  TX_POWER_PATHS,
  PPPOE_IP_PATHS,
  PON_MODE_PATHS,
  UPTIME_PATHS,
  TEMP_PATHS,
  SERIAL_PATHS,
  SSID_PATHS,
  WIFI_ENABLED_PATHS,
  WIFI_CHANNEL_PATHS,
  TOTAL_ASSOC_PATHS,
} from '@/lib/genieacs/param-paths';

/**
 * GET /api/genieacs/device-by-username?username=<pppoe_username>
 *
 * Finds the GenieACS device whose PPPoE username matches the given
 * customer username — used by the unified map popup to show live
 * ONT info (optical power, WiFi, uptime) for PPPoE customers.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePermission('settings.genieacs');
  if (!auth.authorized) return auth.response;

  const username = req.nextUrl.searchParams.get('username')?.trim();
  if (!username) return fail('Parameter username wajib diisi', 400);

  try {
    const or: Record<string, string>[] = [];
    for (const p of PPP_USERNAME_PATHS) {
      or.push({ [p]: username }, { [`${p}._value`]: username });
    }
    const devices = await getDevices({ $or: or });
    const device = devices.find((d: GenieDevice) => {
      const u = getParam(d, PPP_USERNAME_PATHS);
      return u !== null && u.toLowerCase() === username.toLowerCase();
    });

    if (!device) {
      return NextResponse.json({ success: true, device: null });
    }

    const idObj = device._deviceId || {};
    const lastInform = device._lastInform ?? null;
    const online = lastInform
      ? Date.now() - new Date(lastInform).getTime() < 15 * 60 * 1000
      : false;
    const rxRaw = getParam(device, RX_POWER_PATHS);
    const rxDbm = rxRaw !== null && !isNaN(parseFloat(rxRaw))
      ? (parseFloat(rxRaw) < -100 ? parseFloat(rxRaw) / 1000 : parseFloat(rxRaw))
      : null;

    return NextResponse.json({
      success: true,
      device: {
        _id: device._id,
        serialNumber: idObj._SerialNumber ?? getParam(device, SERIAL_PATHS),
        manufacturer: idObj._Manufacturer ?? null,
        model: idObj._ProductClass ?? null,
        pppUsername: getParam(device, PPP_USERNAME_PATHS),
        ipAddress: getParam(device, PPPOE_IP_PATHS),
        rxPower: formatRxPower(rxRaw),
        rxDbm,
        txPower: getParam(device, TX_POWER_PATHS),
        temperature: getParam(device, TEMP_PATHS),
        uptime: formatUptime(getParam(device, UPTIME_PATHS)),
        ponMode: getParam(device, PON_MODE_PATHS),
        ssid: getParam(device, SSID_PATHS),
        wifiEnabled: getParam(device, WIFI_ENABLED_PATHS),
        wifiChannel: getParam(device, WIFI_CHANNEL_PATHS),
        wifiClients: getParam(device, TOTAL_ASSOC_PATHS),
        lastInform,
        online,
      },
    });
  } catch (e) {
    return fail((e as Error).message);
  }
}
