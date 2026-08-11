/**
 * /api/network/joint-closures/:id/segments
 * CRUD for cable segments connected TO or FROM this Joint Closure
 *
 * Direction is set by the `direction` field in the request body:
 *   'IN'  → creates cable_segment where toDeviceType='JOINT_CLOSURE', toDeviceId=id
 *   'OUT' → creates cable_segment where fromDeviceType='JOINT_CLOSURE', fromDeviceId=id
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { nanoid } from 'nanoid';

type Direction = 'IN' | 'OUT';

// ── GET /api/network/joint-closures/:id/segments ───────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const direction = (new URL(request.url).searchParams.get('direction') as Direction | null);

    const jc = await prisma.network_joint_closures.findUnique({ where: { id }, select: { id: true } });
    if (!jc) return NextResponse.json({ error: 'Joint Closure not found' }, { status: 404 });

    const [inputSegs, outputSegs] = await Promise.all([
      (direction === 'OUT') ? Promise.resolve([]) : prisma.cable_segments.findMany({
        where: { toDeviceType: 'JOINT_CLOSURE', toDeviceId: id },
        orderBy: { toPort: 'asc' },
        include: { cable: { select: { id: true, code: true, name: true, tubeCount: true, coresPerTube: true, totalCores: true } } },
      }),
      (direction === 'IN') ? Promise.resolve([]) : prisma.cable_segments.findMany({
        where: { fromDeviceType: 'JOINT_CLOSURE', fromDeviceId: id },
        orderBy: { fromPort: 'asc' },
        include: { cable: { select: { id: true, code: true, name: true, tubeCount: true, coresPerTube: true, totalCores: true } } },
      }),
    ]);

    // Resolve upstream device names (OTB) for input segments
    const otbIds = inputSegs.filter(s => s.fromDeviceType === 'OTB').map(s => s.fromDeviceId);
    const otbs = otbIds.length > 0
      ? await prisma.network_otbs.findMany({ where: { id: { in: otbIds } }, select: { id: true, name: true, code: true } })
      : [];
    const otbMap = Object.fromEntries(otbs.map(o => [o.id, o]));

    return NextResponse.json({
      inputSegments: inputSegs.map(s => ({ ...s, fromDevice: s.fromDeviceType === 'OTB' ? (otbMap[s.fromDeviceId] ?? null) : null })),
      outputSegments: outputSegs,
    });
  } catch (error: any) {
    console.error('[JC_SEGMENTS_GET]', error);
    return NextResponse.json({ error: 'Failed to fetch segments', details: error.message }, { status: 500 });
  }
}

// ── POST /api/network/joint-closures/:id/segments ─────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const {
      direction,       // 'IN' | 'OUT'
      remoteDeviceType, // e.g. 'OTB', 'ODC', 'ODP', 'JOINT_CLOSURE'
      remoteDeviceId,
      port,            // fromPort (if OUT) or toPort (if IN)
      cableId,
      lengthMeters,
      status = 'ACTIVE',
    } = body;

    if (!direction) {
      return NextResponse.json({ error: 'direction is required' }, { status: 400 });
    }

    // Verify JC exists
    const jc = await prisma.network_joint_closures.findUnique({ where: { id }, select: { id: true } });
    if (!jc) return NextResponse.json({ error: 'Joint Closure not found' }, { status: 404 });

    // Validate cableId
    if (cableId) {
      const cable = await prisma.fiber_cables.findUnique({ where: { id: cableId }, select: { id: true } });
      if (!cable) return NextResponse.json({ error: 'Fiber cable not found' }, { status: 400 });
    }

    const isOut = direction === 'OUT';
    // remoteDeviceType and remoteDeviceId are optional — segments can be "unlinked" (no target device)
    const remoteType = remoteDeviceType || 'UNLINKED';
    const remoteId   = remoteDeviceId   || 'unlinked';
    const segmentData = {
      id: nanoid(),
      cableId: cableId || '',
      fromDeviceType: isOut ? 'JOINT_CLOSURE' : remoteType,
      fromDeviceId:   isOut ? id               : remoteId,
      fromPort:       isOut ? (port ? parseInt(port) : null) : null,
      toDeviceType:   isOut ? remoteType : 'JOINT_CLOSURE',
      toDeviceId:     isOut ? remoteId   : id,
      toPort:         isOut ? null : (port ? parseInt(port) : null),
      lengthMeters:   lengthMeters ? parseFloat(lengthMeters) : undefined,
      status:         status as any,
    };

    // Require a valid cableId for the Prisma FK constraint
    if (!cableId) {
      return NextResponse.json({ error: 'cableId is required to create a cable segment' }, { status: 400 });
    }

    const segment = await prisma.cable_segments.create({ data: segmentData });

    return NextResponse.json(segment, { status: 201 });
  } catch (error: any) {
    console.error('[JC_SEGMENTS_POST]', error);
    return NextResponse.json({ error: 'Failed to create segment', details: error.message }, { status: 500 });
  }
}

// ── DELETE /api/network/joint-closures/:id/segments?segmentId=xxx ──────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const segmentId = new URL(request.url).searchParams.get('segmentId');
    if (!segmentId) return NextResponse.json({ error: 'segmentId query param is required' }, { status: 400 });

    // Verify segment belongs to this JC (either direction)
    const segment = await prisma.cable_segments.findFirst({
      where: {
        id: segmentId,
        OR: [
          { fromDeviceType: 'JOINT_CLOSURE', fromDeviceId: id },
          { toDeviceType: 'JOINT_CLOSURE', toDeviceId: id },
        ],
      },
    });
    if (!segment) return NextResponse.json({ error: 'Segment not found for this Joint Closure' }, { status: 404 });

    await prisma.cable_segments.delete({ where: { id: segmentId } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[JC_SEGMENTS_DELETE]', error);
    return NextResponse.json({ error: 'Failed to delete segment', details: error.message }, { status: 500 });
  }
}
