/**
 * GET /api/network/connections
 *
 * Returns all cable_segments grouped by cable, with resolved coordinates
 * for rendering polylines on the unified map.
 *
 * Groups multiple segments between the same device pair (same cable)
 * into a single connection line for the map.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// Color mapping for connection types
const CONNECTION_COLORS: Record<string, string> = {
  'OTB:JOINT_CLOSURE': '#a855f7',      // violet (feeder → JC)
  'JOINT_CLOSURE:JOINT_CLOSURE': '#8b5cf6', // purple (JC → JC branch)
  'JOINT_CLOSURE:ODC': '#06b6d4',      // cyan (JC → ODC)
  'JOINT_CLOSURE:ODP': '#10b981',      // emerald (JC → ODP)
  'ODC:ODP': '#22c55e',                // green (ODC → ODP)
  'ODP:ODP': '#84cc16',                // lime (ODP daisy-chain)
  'OTB:ODC': '#3b82f6',                // blue (OTB → ODC)
  'DEFAULT': '#6b7280',                // gray fallback
};

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch all active cable_segments with their cable info
    const segments = await prisma.cable_segments.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        cableId: true,
        fromDeviceType: true,
        fromDeviceId: true,
        fromPort: true,
        toDeviceType: true,
        toDeviceId: true,
        toPort: true,
        lengthMeters: true,
        cable: {
          select: { id: true, code: true, name: true, tubeCount: true, coresPerTube: true, totalCores: true },
        },
      },
    });

    if (segments.length === 0) {
      return NextResponse.json({ connections: [] });
    }

    // Collect all unique device IDs
    const deviceIds = new Set<string>();
    for (const seg of segments) {
      if (seg.fromDeviceId && seg.fromDeviceId !== 'unlinked') deviceIds.add(seg.fromDeviceId);
      if (seg.toDeviceId && seg.toDeviceId !== 'unlinked') deviceIds.add(seg.toDeviceId);
    }

    // Fetch coordinates from network_nodes (all device types share IDs with network_nodes)
    const nodes = await prisma.network_nodes.findMany({
      where: { id: { in: Array.from(deviceIds) } },
      select: { id: true, type: true, code: true, name: true, latitude: true, longitude: true },
    });
    const nodeMap = new Map(nodes.map((n: any) => [n.id, n]));

    // Group segments by device pair (fromDeviceId + toDeviceId + cableId)
    const groupMap = new Map<string, {
      cableId: string;
      cable: any;
      fromDeviceType: string;
      fromDeviceId: string;
      toDeviceType: string;
      toDeviceId: string;
      segmentCount: number;
      tubeNumbers: number[];
      lengthMeters: number;
    }>();

    for (const seg of segments) {
      // Skip UNLINKED endpoints
      if (seg.toDeviceId === 'unlinked' || seg.fromDeviceId === 'unlinked') continue;

      const key = `${seg.fromDeviceId}:${seg.toDeviceId}:${seg.cableId}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          cableId: seg.cableId,
          cable: seg.cable,
          fromDeviceType: seg.fromDeviceType,
          fromDeviceId: seg.fromDeviceId,
          toDeviceType: seg.toDeviceType,
          toDeviceId: seg.toDeviceId,
          segmentCount: 0,
          tubeNumbers: [],
          lengthMeters: Number(seg.lengthMeters) || 0,
        });
      }
      const group = groupMap.get(key)!;
      group.segmentCount++;
      if (seg.fromPort) group.tubeNumbers.push(seg.fromPort);
    }

    // Build connection lines with coordinates
    const connections = [];
    for (const [key, group] of groupMap) {
      const fromNode = nodeMap.get(group.fromDeviceId);
      const toNode = nodeMap.get(group.toDeviceId);
      if (!fromNode || !toNode) continue; // skip if coordinates not found

      const colorKey = `${group.fromDeviceType}:${group.toDeviceType}`;
      const color = CONNECTION_COLORS[colorKey] || CONNECTION_COLORS.DEFAULT;

      connections.push({
        id: key,
        cableId: group.cableId,
        cableName: group.cable?.name ?? group.cableId,
        cableCode: group.cable?.code,
        from: {
          id: group.fromDeviceId,
          type: group.fromDeviceType,
          name: fromNode.name,
          code: fromNode.code,
          lat: Number(fromNode.latitude),
          lng: Number(fromNode.longitude),
        },
        to: {
          id: group.toDeviceId,
          type: group.toDeviceType,
          name: toNode.name,
          code: toNode.code,
          lat: Number(toNode.latitude),
          lng: Number(toNode.longitude),
        },
        segmentCount: group.segmentCount,
        tubeCount: group.cable?.tubeCount ?? group.segmentCount,
        coresPerTube: group.cable?.coresPerTube ?? 12,
        totalCores: group.cable?.totalCores ?? (group.segmentCount * 12),
        lengthMeters: group.lengthMeters,
        color,
      });
    }

    return NextResponse.json({ connections });
  } catch (error: any) {
    console.error('[CONNECTIONS_GET]', error);
    return NextResponse.json({ error: 'Failed to fetch connections', details: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/network/connections?from=xxx&to=xxx
 * Deletes all cable_segments between two devices (and optionally the cable if orphaned)
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const fromId = url.searchParams.get('from');
    const toId = url.searchParams.get('to');

    if (!fromId || !toId) {
      return NextResponse.json({ error: 'from and to query params are required' }, { status: 400 });
    }

    // Find all segments between these two devices (both directions)
    const segments = await prisma.cable_segments.findMany({
      where: {
        OR: [
          { fromDeviceId: fromId, toDeviceId: toId },
          { fromDeviceId: toId, toDeviceId: fromId },
        ],
      },
      select: { id: true, cableId: true },
    });

    if (segments.length === 0) {
      return NextResponse.json({ error: 'No connection found between these devices' }, { status: 404 });
    }

    // Delete all segments
    const ids = segments.map((s: any) => s.id);
    await prisma.cable_segments.deleteMany({ where: { id: { in: ids } } });

    // Check if any cables are now orphaned (no segments left) and clean up
    const cableIds = [...new Set(segments.map((s: any) => s.cableId))];
    for (const cableId of cableIds) {
      const remaining = await prisma.cable_segments.count({ where: { cableId } });
      if (remaining === 0) {
        // Delete orphaned tubes and cable
        await prisma.fiber_tubes.deleteMany({ where: { cableId } });
        await prisma.fiber_cables.delete({ where: { id: String(cableId) } }).catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      deleted: segments.length,
      message: `Deleted ${segments.length} segment(s) between the devices`,
    });
  } catch (error: any) {
    console.error('[CONNECTIONS_DELETE]', error);
    return NextResponse.json({ error: 'Failed to delete connection', details: error.message }, { status: 500 });
  }
}
