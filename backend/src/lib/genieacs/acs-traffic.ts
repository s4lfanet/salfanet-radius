/**
 * ACS Traffic — per-device WAN byte counters via GenieACS (TR-069).
 *
 * Complements RADIUS-based traffic accounting (session/access-side) with
 * ONU/WAN-side counters read directly from the CPE. Useful because the OLT
 * cannot separate downstream traffic per-ONU, while the device counts its
 * own WAN bytes.
 *
 * Flow:
 *   1. refreshObject WANDevice.1 (triggers connection request so the ONU
 *      reports fresh counters)
 *   2. wait briefly
 *   3. read TotalBytesReceived/Sent (or vendor-specific EPON/PPP/IP paths)
 *   4. compute rate = delta bytes / delta time vs the previous snapshot
 *      (kept in-memory between polls, per deviceId)
 */
import 'server-only';
import { getDevice, refreshObject } from './api-client';
import type { GenieDevice } from './types';

// Path pairs, most universal first. down & up counters per pair.
const PATHS: Array<{ down: string; up: string }> = [
  {
    down: 'InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.TotalBytesReceived',
    up: 'InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.TotalBytesSent',
  },
  {
    down: 'InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.Stats.BytesReceived',
    up: 'InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.Stats.BytesSent',
  },
  {
    down: 'InternetGatewayDevice.WANDevice.1.X_CU_WANEPONInterfaceConfig.Stats.BytesReceived',
    up: 'InternetGatewayDevice.WANDevice.1.X_CU_WANEPONInterfaceConfig.Stats.BytesSent',
  },
  {
    down: 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Stats.EthernetBytesReceived',
    up: 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Stats.EthernetBytesSent',
  },
  {
    down: 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.Stats.EthernetBytesReceived',
    up: 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.Stats.EthernetBytesSent',
  },
];

function gv(obj: unknown, path: string): number | null {
  let cur: unknown = obj;
  for (const p of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[p];
  }
  if (cur && typeof cur === 'object' && '_value' in (cur as object)) {
    const v = (cur as Record<string, unknown>)._value;
    return v == null ? null : Number(v);
  }
  return cur == null ? null : Number(cur);
}

function pickBytes(dev: GenieDevice): { down: number | null; up: number | null; pathIdx: number } | null {
  for (let i = 0; i < PATHS.length; i++) {
    const d = gv(dev, PATHS[i].down);
    const u = gv(dev, PATHS[i].up);
    if (d != null || u != null) return { down: d, up: u, pathIdx: i };
  }
  return null;
}

interface Snapshot {
  down: number | null;
  up: number | null;
  pathIdx: number;
  ts: number;
}

async function snapshot(deviceId: string, opts: { refresh?: boolean; waitMs?: number } = {}): Promise<Snapshot | null> {
  const { refresh = true, waitMs = 6000 } = opts;
  if (refresh) {
    try {
      await refreshObject(deviceId, 'InternetGatewayDevice.WANDevice.1');
    } catch {
      // Connection request timeout is not fatal — device may report on next Inform
    }
    if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
  }
  const dev = await getDevice(deviceId);
  if (!dev) return null;
  const b = pickBytes(dev);
  if (!b) return null;
  return { down: b.down, up: b.up, pathIdx: b.pathIdx, ts: Date.now() };
}

// In-memory state between polls (per deviceId). Resets on process restart —
// acceptable since rate is only meaningful across consecutive polls anyway.
const lastSnapshot = new Map<string, Snapshot>();

function computeRate(prev: Snapshot | undefined, cur: Snapshot) {
  if (!prev) return { first: true, downBps: null as number | null, upBps: null as number | null };
  const dt = (cur.ts - prev.ts) / 1000;
  if (dt <= 0) return { first: false, downBps: null, upBps: null };
  const diff = (a: number | null, b: number | null) => {
    if (a == null || b == null) return null;
    const d = a - b;
    return d < 0 ? a : d; // counter reset (reboot) — treat as fresh total
  };
  const dDown = diff(cur.down, prev.down);
  const dUp = diff(cur.up, prev.up);
  return {
    first: false,
    downBps: dDown == null ? null : Math.max(0, (dDown * 8) / dt),
    upBps: dUp == null ? null : Math.max(0, (dUp * 8) / dt),
  };
}

/**
 * Poll traffic rate for one device. Call repeatedly (e.g. every 5-10s from
 * the UI) — the first call always returns `first: true` with no rate yet.
 */
export async function pollDeviceTraffic(
  deviceId: string,
  opts: { refresh?: boolean; waitMs?: number } = {}
): Promise<{
  first: boolean;
  downBps: number | null;
  upBps: number | null;
  downBytesTotal: number | null;
  upBytesTotal: number | null;
  pathIdx: number | null;
  ts: number | null;
  error?: string;
}> {
  const cur = await snapshot(deviceId, opts);
  if (!cur) return { first: true, downBps: null, upBps: null, downBytesTotal: null, upBytesTotal: null, pathIdx: null, ts: null, error: 'no-data' };
  const prev = lastSnapshot.get(deviceId);
  lastSnapshot.set(deviceId, cur);
  const rate = computeRate(prev, cur);
  return {
    first: rate.first,
    downBps: rate.downBps,
    upBps: rate.upBps,
    downBytesTotal: cur.down,
    upBytesTotal: cur.up,
    pathIdx: cur.pathIdx,
    ts: cur.ts,
  };
}
