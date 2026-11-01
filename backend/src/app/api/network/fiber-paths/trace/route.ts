import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { ATTENUATION_CONSTANTS, getSplitterLoss } from '@/lib/network/fiber-core-types';

// GET /api/network/fiber-paths/trace?from=xxx&to=yyy
// Logical path between two devices. The graph is UNDIRECTED and built from the
// parent links stored on the infrastructure records (OTB->OLT, ODC->OTB/OLT,
// ODP->parent ODP/ODC/OLT) plus real cable segments, so a path is found
// regardless of which end is picked as source. Shortest path by distance.

type NodeInfo = {
  id: string;
  type: string;
  name: string;
  lat: number;
  lng: number;
  splitterRatio?: string | null;
};

const ROAD_FACTOR = 1.3;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(request: NextRequest) {
  try {
    const authCheck = await requirePermission('network.view');
    if (!authCheck.authorized) return authCheck.response;

    const { searchParams } = new URL(request.url);
    const fromId = searchParams.get('from');
    const toId = searchParams.get('to');

    if (!fromId || !toId) {
      return NextResponse.json({ success: false, error: 'Missing required parameters: from, to' }, { status: 400 });
    }

    const [olts, otbs, jcs, odcs, odps, segments] = await Promise.all([
      prisma.networkOLT.findMany({ select: { id: true, name: true, latitude: true, longitude: true } }),
      prisma.network_otbs.findMany({ select: { id: true, name: true, latitude: true, longitude: true, oltId: true, splitterRatio: true } }),
      prisma.network_joint_closures.findMany({ select: { id: true, name: true, latitude: true, longitude: true, connections: true } }),
      prisma.networkODC.findMany({ select: { id: true, name: true, latitude: true, longitude: true, oltId: true, otbId: true } }),
      prisma.networkODP.findMany({ select: { id: true, name: true, latitude: true, longitude: true, oltId: true, odcId: true, parentOdpId: true, splitterRatio: true } }),
      prisma.cable_segments.findMany({
        where: { status: 'ACTIVE' },
        select: { fromDeviceId: true, toDeviceId: true, lengthMeters: true },
      }),
    ]);

    const nodes = new Map<string, NodeInfo>();
    const add = (type: string, n: { id: string; name: string; latitude: number; longitude: number; splitterRatio?: string | null }) =>
      nodes.set(n.id, { id: n.id, type, name: n.name, lat: Number(n.latitude), lng: Number(n.longitude), splitterRatio: n.splitterRatio });
    olts.forEach(n => add('OLT', n));
    otbs.forEach(n => add('OTB', n));
    jcs.forEach(n => add('JOINT_CLOSURE', n));
    odcs.forEach(n => add('ODC', n));
    odps.forEach(n => add('ODP', n));

    if (!nodes.has(fromId) || !nodes.has(toId)) {
      return NextResponse.json({ success: false, error: 'Perangkat asal atau tujuan tidak ditemukan' }, { status: 404 });
    }

    const adj = new Map<string, Map<string, number>>();
    const link = (a: string | null | undefined, b: string | null | undefined, knownMeters = 0) => {
      if (!a || !b || a === b || a === 'unlinked' || b === 'unlinked') return;
      const na = nodes.get(a);
      const nb = nodes.get(b);
      if (!na || !nb) return;
      const meters = knownMeters > 0 ? knownMeters : haversineMeters(na.lat, na.lng, nb.lat, nb.lng) * ROAD_FACTOR;
      const put = (x: string, y: string) => {
        if (!adj.has(x)) adj.set(x, new Map());
        const cur = adj.get(x)!.get(y);
        if (cur === undefined || meters < cur) adj.get(x)!.set(y, meters);
      };
      put(a, b);
      put(b, a);
    };

    otbs.forEach(o => link(o.oltId, o.id));
    odcs.forEach(o => link(o.otbId || o.oltId, o.id));
    odps.forEach(o => link(o.parentOdpId || o.odcId || o.oltId, o.id));
    segments.forEach(s => link(s.fromDeviceId, s.toDeviceId, Number(s.lengthMeters) || 0));
    jcs.forEach(j => {
      const conns = Array.isArray(j.connections) ? (j.connections as Array<{ to?: string; distance?: number }>) : [];
      conns.forEach(c => link(j.id, c.to, Number(c.distance) || 0));
    });

    // Dijkstra (graph is small — a linear scan for the next node is fine)
    const dist = new Map<string, number>([[fromId, 0]]);
    const prev = new Map<string, string>();
    const done = new Set<string>();
    while (true) {
      let cur: string | null = null;
      let best = Infinity;
      for (const [id, d] of dist) if (!done.has(id) && d < best) { best = d; cur = id; }
      if (cur === null || cur === toId) break;
      done.add(cur);
      for (const [next, w] of adj.get(cur) ?? []) {
        const nd = best + w;
        if (nd < (dist.get(next) ?? Infinity)) { dist.set(next, nd); prev.set(next, cur); }
      }
    }

    if (!dist.has(toId)) {
      return NextResponse.json({ success: false, error: 'Tidak ada jalur antara kedua perangkat. Periksa induk (OLT/ODC/ODP) dari tiap perangkat.' }, { status: 404 });
    }

    const ids: string[] = [];
    for (let at: string | undefined = toId; at; at = prev.get(at)) ids.unshift(at);

    let totalMeters = 0;
    let splitterLossDb = 0;
    const path = ids.map((id, index) => {
      const n = nodes.get(id)!;
      const hop = index > 0 ? adj.get(ids[index - 1])!.get(id)! : 0;
      totalMeters += hop;
      if ((n.type === 'ODP' || n.type === 'OTB') && n.splitterRatio) splitterLossDb += getSplitterLoss(n.splitterRatio);
      return {
        type: n.type,
        id: n.id,
        name: n.name,
        order: index + 1,
        coordinates: { lat: n.lat, lng: n.lng },
        ...(index > 0 && { distance: Math.round(hop) }),
      };
    });

    const lossDb =
      (totalMeters / 1000) * ATTENUATION_CONSTANTS.FIBER_LOSS_PER_KM +
      Math.max(ids.length - 1, 0) * ATTENUATION_CONSTANTS.CONNECTOR_LOSS +
      splitterLossDb;

    return NextResponse.json({
      success: true,
      path,
      summary: {
        totalNodes: path.length,
        totalDistance: Math.round(totalMeters),
        // Estimated received level: typical GPON OLT Tx minus fiber, connector and splitter loss
        estimatedLoss: Math.round((ATTENUATION_CONSTANTS.OLT_TX_POWER - lossDb) * 10) / 10,
        status: 'active',
        redundancy: 'none',
      },
      alternatives: [],
    });
  } catch (error: unknown) {
    console.error('Error tracing fiber path:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to trace fiber path' }, { status: 500 });
  }
}
