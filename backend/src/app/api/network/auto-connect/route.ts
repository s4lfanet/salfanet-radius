/**
 * POST /api/network/auto-connect
 *
 * Smart auto-connect API for the unified map "draw line" feature.
 * Detects connection type from source/target device types,
 * creates fiber_cable (if needed) + cable_segments with auto tube/core allocation.
 *
 * Supported connection patterns:
 *   OTB  → JOINT_CLOSURE    — all available tubes pass through (feeder cable)
 *   JC   → JOINT_CLOSURE    — branch: creates distribution cable + segment
 *   JC   → ODC              — distribution cable + segment
 *   JC   → ODP              — drop cable + segment
 *   ODC  → ODP              — distribution + segment
 *   ODP  → ODP              — daisy-chain + segment
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { nanoid } from 'nanoid';

// Haversine distance in meters
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Device type → table name mapping
const DEVICE_TABLES: Record<string, string> = {
  OLT: 'network_olts',
  OTB: 'network_otbs',
  JOINT_CLOSURE: 'network_joint_closures',
  ODC: 'network_odcs',
  ODP: 'network_odps',
};

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { sourceId, sourceType, targetId, targetType, cableSpec } = body;

    if (!sourceId || !sourceType || !targetId || !targetType) {
      return NextResponse.json({ error: 'sourceId, sourceType, targetId, and targetType are required' }, { status: 400 });
    }

    if (sourceId === targetId) {
      return NextResponse.json({ error: 'Source and target cannot be the same device' }, { status: 400 });
    }

    // ── 1. Resolve source and target devices (get coordinates + names) ──────
    const sourceNode = await (prisma as any).network_nodes.findUnique({
      where: { id: sourceId },
      select: { id: true, type: true, code: true, name: true, latitude: true, longitude: true },
    });
    const targetNode = await (prisma as any).network_nodes.findUnique({
      where: { id: targetId },
      select: { id: true, type: true, code: true, name: true, latitude: true, longitude: true },
    });

    if (!sourceNode) return NextResponse.json({ error: `Source device not found: ${sourceId}` }, { status: 404 });
    if (!targetNode) return NextResponse.json({ error: `Target device not found: ${targetId}` }, { status: 404 });

    // Calculate distance (straight line × 1.3 for road factor)
    const straightDist = haversineMeters(
      Number(sourceNode.latitude), Number(sourceNode.longitude),
      Number(targetNode.latitude), Number(targetNode.longitude),
    );
    const estimatedLength = Math.round(straightDist * 1.3);

    const connectionKey = `${sourceType} → ${targetType}`;

    // ── 2. Handle OTB → JOINT_CLOSURE (all available tubes pass through) ────
    if (sourceType === 'OTB' && targetType === 'JOINT_CLOSURE') {
      return await handleOtbToJc(prisma, sourceId, targetId, sourceNode, targetNode, estimatedLength);
    }

    // ── 3. Handle JC → JC, JC → ODC, JC → ODP, ODC → ODP, ODP → ODP ──────
    const validConnections = [
      'JOINT_CLOSURE → JOINT_CLOSURE',
      'JOINT_CLOSURE → ODC',
      'JOINT_CLOSURE → ODP',
      'ODC → ODP',
      'ODP → ODP',
      'OTB → ODC',
    ];

    if (!validConnections.includes(connectionKey)) {
      return NextResponse.json({
        error: `Unsupported connection: ${connectionKey}. Supported: ${validConnections.join(', ')}, OTB → JOINT_CLOSURE`,
      }, { status: 400 });
    }

    return await handleGenericConnection(
      prisma, sourceId, sourceType, targetId, targetType,
      sourceNode, targetNode, estimatedLength, cableSpec,
    );

  } catch (error: any) {
    console.error('[AUTO_CONNECT]', error);
    return NextResponse.json({ error: 'Auto-connect failed', details: error.message }, { status: 500 });
  }
}

// ── OTB → JC: pass all available tubes from feeder cable ─────────────────────
async function handleOtbToJc(
  prisma: any, otbId: string, jcId: string,
  sourceNode: any, targetNode: any, distMeters: number,
) {
  // Get OTB with incomingCableId
  const otb = await prisma.network_otbs.findUnique({
    where: { id: otbId },
    select: { id: true, name: true, code: true, incomingCableId: true },
  });
  if (!otb) return NextResponse.json({ error: 'OTB not found in native table' }, { status: 404 });
  if (!otb.incomingCableId) {
    return NextResponse.json({ error: 'OTB has no incoming (feeder) cable. Please assign a feeder cable to the OTB first.' }, { status: 400 });
  }

  // Get the feeder cable specs
  const cable = await prisma.fiber_cables.findUnique({
    where: { id: otb.incomingCableId },
    select: { id: true, code: true, name: true, tubeCount: true, coresPerTube: true, totalCores: true },
  });
  if (!cable) return NextResponse.json({ error: 'Feeder cable not found' }, { status: 404 });

  // Find already-assigned tubes (from this OTB)
  const existingSegments = await prisma.cable_segments.findMany({
    where: { fromDeviceType: 'OTB', fromDeviceId: otbId },
    select: { fromPort: true, toDeviceId: true },
  });
  const assignedTubes = new Set(existingSegments.map((s: any) => s.fromPort));

  // Check if any tubes were already assigned to THIS JC specifically
  const alreadyConnectedToTarget = existingSegments.filter((s: any) => s.toDeviceId === jcId);
  if (alreadyConnectedToTarget.length > 0) {
    return NextResponse.json({
      error: `OTB "${otb.name}" is already connected to this JC with ${alreadyConnectedToTarget.length} tube(s).`,
      existingCount: alreadyConnectedToTarget.length,
    }, { status: 409 });
  }

  // Get available (unassigned) tube numbers
  const allTubeNumbers = Array.from({ length: cable.tubeCount }, (_, i) => i + 1);
  const availableTubes = allTubeNumbers.filter(t => !assignedTubes.has(t));

  if (availableTubes.length === 0) {
    return NextResponse.json({ error: 'All tubes from the feeder cable are already assigned. No tubes available.' }, { status: 400 });
  }

  // Create one cable_segment per available tube
  const results = await Promise.allSettled(
    availableTubes.map(tubeNum =>
      prisma.cable_segments.create({
        data: {
          id: nanoid(),
          fromDeviceType: 'OTB',
          fromDeviceId: otbId,
          fromPort: tubeNum,
          toDeviceType: 'JOINT_CLOSURE',
          toDeviceId: jcId,
          cableId: cable.id,
          lengthMeters: distMeters,
          status: 'ACTIVE',
        },
      })
    )
  );

  const created = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  return NextResponse.json({
    success: true,
    connectionType: 'OTB → JOINT_CLOSURE',
    cable: { id: cable.id, name: cable.name, code: cable.code, tubeCount: cable.tubeCount, coresPerTube: cable.coresPerTube },
    segments: { created, failed, tubeNumbers: availableTubes },
    summary: `${sourceNode.name} → ${targetNode.name}: ${created} tube (${created * cable.coresPerTube} core), ≈${distMeters}m`,
    estimatedLength: distMeters,
  });
}

// ── Generic connection: create cable + single segment ────────────────────────
async function handleGenericConnection(
  prisma: any,
  sourceId: string, sourceType: string,
  targetId: string, targetType: string,
  sourceNode: any, targetNode: any,
  distMeters: number,
  cableSpec?: { name?: string; tubeCount?: number; coresPerTube?: number; cableType?: string },
) {
  // Check for existing connection between these two devices
  const existing = await prisma.cable_segments.findFirst({
    where: {
      OR: [
        { fromDeviceType: sourceType, fromDeviceId: sourceId, toDeviceType: targetType, toDeviceId: targetId },
        { fromDeviceType: targetType, fromDeviceId: targetId, toDeviceType: sourceType, toDeviceId: sourceId },
      ],
    },
  });
  if (existing) {
    return NextResponse.json({
      error: `These devices are already connected (segment ${existing.id}).`,
    }, { status: 409 });
  }

  // Determine default cable specs based on connection type
  const connectionKey = `${sourceType} → ${targetType}`;
  let defaultTubeCount = 12;
  let defaultCoresPerTube = 12;
  let cableTypeStr = 'SM_G652';

  switch (connectionKey) {
    case 'JOINT_CLOSURE → JOINT_CLOSURE':
      defaultTubeCount = cableSpec?.tubeCount ?? 6;
      defaultCoresPerTube = cableSpec?.coresPerTube ?? 12;
      break;
    case 'JOINT_CLOSURE → ODC':
    case 'OTB → ODC':
      defaultTubeCount = cableSpec?.tubeCount ?? 4;
      defaultCoresPerTube = cableSpec?.coresPerTube ?? 12;
      break;
    case 'JOINT_CLOSURE → ODP':
    case 'ODC → ODP':
      defaultTubeCount = cableSpec?.tubeCount ?? 2;
      defaultCoresPerTube = cableSpec?.coresPerTube ?? 12;
      break;
    case 'ODP → ODP':
      defaultTubeCount = cableSpec?.tubeCount ?? 1;
      defaultCoresPerTube = cableSpec?.coresPerTube ?? 4;
      break;
  }

  const tubeCount = cableSpec?.tubeCount ?? defaultTubeCount;
  const coresPerTube = cableSpec?.coresPerTube ?? defaultCoresPerTube;
  const totalCores = tubeCount * coresPerTube;
  const cableName = cableSpec?.name ?? `${sourceNode.code} → ${targetNode.code}`;
  const cableCode = `cable_${nanoid(8)}`;

  // Create fiber_cable
  const cable = await prisma.fiber_cables.create({
    data: {
      id: nanoid(),
      code: cableCode,
      name: cableName,
      cableType: cableTypeStr,
      tubeCount,
      coresPerTube,
      totalCores,
      status: 'ACTIVE',
    },
  });

  // Auto-create tubes for the cable
  const FIBER_COLORS = [
    { code: 'BLUE', hex: '#0000FF' },
    { code: 'ORANGE', hex: '#FF8C00' },
    { code: 'GREEN', hex: '#008000' },
    { code: 'BROWN', hex: '#8B4513' },
    { code: 'SLATE', hex: '#708090' },
    { code: 'WHITE', hex: '#FFFFFF' },
    { code: 'RED', hex: '#FF0000' },
    { code: 'BLACK', hex: '#000000' },
    { code: 'YELLOW', hex: '#FFD700' },
    { code: 'VIOLET', hex: '#8B00FF' },
    { code: 'ROSE', hex: '#FF007F' },
    { code: 'AQUA', hex: '#00FFFF' },
  ];

  // Create tubes
  await Promise.allSettled(
    Array.from({ length: tubeCount }, (_, i) => {
      const color = FIBER_COLORS[i % FIBER_COLORS.length];
      return prisma.fiber_tubes.create({
        data: {
          id: nanoid(),
          cableId: cable.id,
          tubeNumber: i + 1,
          colorCode: color.code,
          colorHex: color.hex,
          coreCount: coresPerTube,
          usedCores: 0,
        },
      });
    })
  );

  // Create cable_segment
  const segment = await prisma.cable_segments.create({
    data: {
      id: nanoid(),
      fromDeviceType: sourceType,
      fromDeviceId: sourceId,
      toDeviceType: targetType,
      toDeviceId: targetId,
      cableId: cable.id,
      lengthMeters: distMeters,
      status: 'ACTIVE',
    },
  });

  // If target is a JC, also create an IN direction reference
  // (JC segments API expects input segments with toDeviceType=JOINT_CLOSURE)
  // No need — the segment already has toDeviceType=JOINT_CLOSURE

  return NextResponse.json({
    success: true,
    connectionType: `${sourceType} → ${targetType}`,
    cable: { id: cable.id, name: cable.name, code: cable.code, tubeCount, coresPerTube, totalCores },
    segment: { id: segment.id },
    summary: `${sourceNode.name} → ${targetNode.name}: ${tubeCount}T × ${coresPerTube}C = ${totalCores} core, ≈${distMeters}m`,
    estimatedLength: distMeters,
  });
}
