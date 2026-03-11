/**
 * /api/network/otbs/:id/segments
 * CRUD for tube → JC assignments stored as cable_segments
 *
 * cable_segments structure used here:
 *  fromDeviceType = 'OTB'
 *  fromDeviceId   = otb.id
 *  fromPort       = tube number (1-based)
 *  toDeviceType   = 'JOINT_CLOSURE'
 *  toDeviceId     = jc.id
 *  cableId        = fiber_cables.id (same feeder cable, or a distribution cable)
 *  lengthMeters   = optional
 *  status         = ACTIVE / INACTIVE / DAMAGED
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { nanoid } from 'nanoid';

// ── GET /api/network/otbs/:id/segments ─────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    // Verify OTB exists
    const otb = await prisma.network_otbs.findUnique({ where: { id }, select: { id: true } });
    if (!otb) return NextResponse.json({ error: 'OTB not found' }, { status: 404 });

    const segments = await prisma.cable_segments.findMany({
      where: { fromDeviceType: 'OTB', fromDeviceId: id },
      orderBy: { fromPort: 'asc' },
    });

    // Resolve JC names
    const jcIds = segments.filter(s => s.toDeviceType === 'JOINT_CLOSURE').map(s => s.toDeviceId);
    const jcs = jcIds.length > 0
      ? await prisma.network_joint_closures.findMany({
          where: { id: { in: jcIds } },
          select: { id: true, name: true, code: true, latitude: true, longitude: true },
        })
      : [];
    const jcMap = Object.fromEntries(jcs.map(j => [j.id, j]));

    const result = segments.map(s => ({
      ...s,
      toDevice: s.toDeviceType === 'JOINT_CLOSURE' ? (jcMap[s.toDeviceId] ?? null) : null,
    }));

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[OTB_SEGMENTS_GET]', error);
    return NextResponse.json({ error: 'Failed to fetch segments', details: error.message }, { status: 500 });
  }
}

// ── POST /api/network/otbs/:id/segments ────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { tubeNumber, jcId, cableId, lengthMeters, status = 'ACTIVE' } = body;

    if (!tubeNumber || !jcId) {
      return NextResponse.json({ error: 'tubeNumber and jcId are required' }, { status: 400 });
    }

    // Verify OTB exists
    const otb = await prisma.network_otbs.findUnique({ where: { id }, select: { id: true, incomingCableId: true } });
    if (!otb) return NextResponse.json({ error: 'OTB not found' }, { status: 404 });

    // Verify JC exists
    const jc = await prisma.network_joint_closures.findUnique({ where: { id: jcId }, select: { id: true, name: true, code: true } });
    if (!jc) return NextResponse.json({ error: 'Joint Closure not found' }, { status: 404 });

    // Validate cableId if provided, otherwise fall back to OTB's incoming cable
    const resolvedCableId = cableId || otb.incomingCableId;
    if (resolvedCableId) {
      const cable = await prisma.fiber_cables.findUnique({ where: { id: resolvedCableId }, select: { id: true } });
      if (!cable) return NextResponse.json({ error: 'Fiber cable not found' }, { status: 400 });
    }

    // Check for duplicate tube assignment
    const duplicate = await prisma.cable_segments.findFirst({
      where: { fromDeviceType: 'OTB', fromDeviceId: id, fromPort: parseInt(tubeNumber) },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: `Tube ${tubeNumber} is already assigned to another JC (segmentId: ${duplicate.id})` },
        { status: 409 }
      );
    }

    const segment = await prisma.cable_segments.create({
      data: {
        id: nanoid(),
        fromDeviceType: 'OTB',
        fromDeviceId: id,
        fromPort: parseInt(tubeNumber),
        toDeviceType: 'JOINT_CLOSURE',
        toDeviceId: jcId,
        cableId: resolvedCableId || null,
        lengthMeters: lengthMeters ? parseFloat(lengthMeters) : undefined,
        status: status as any,
      },
    });

    return NextResponse.json({ ...segment, toDevice: jc }, { status: 201 });
  } catch (error: any) {
    console.error('[OTB_SEGMENTS_POST]', error);
    return NextResponse.json({ error: 'Failed to create segment', details: error.message }, { status: 500 });
  }
}

// ── DELETE /api/network/otbs/:id/segments?segmentId=xxx ────────────────────
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

    // Verify segment belongs to this OTB
    const segment = await prisma.cable_segments.findFirst({
      where: { id: segmentId, fromDeviceType: 'OTB', fromDeviceId: id },
    });
    if (!segment) return NextResponse.json({ error: 'Segment not found for this OTB' }, { status: 404 });

    await prisma.cable_segments.delete({ where: { id: segmentId } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[OTB_SEGMENTS_DELETE]', error);
    return NextResponse.json({ error: 'Failed to delete segment', details: error.message }, { status: 500 });
  }
}
