/**
 * /api/network/otbs/:id/feeder-cables
 * Manage feeder cable assignments for an OTB.
 * Each feeder cable is stored as a cable_segment with:
 *   fromDeviceType = 'FEEDER'
 *   fromDeviceId   = fiber_cables.id
 *   fromPort       = portFrom (first port this cable occupies)
 *   toDeviceType   = 'OTB'
 *   toDeviceId     = otb.id
 *   toPort         = portTo (last port this cable occupies)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { nanoid } from 'nanoid';

// ── GET – list feeder cables for an OTB ──────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const segments = await prisma.cable_segments.findMany({
      where: { toDeviceType: 'OTB', toDeviceId: id, fromDeviceType: 'FEEDER' },
      orderBy: { fromPort: 'asc' },
    });

    // Resolve cable details
    const cableIds = [...new Set(segments.map(s => s.cableId))];
    const cables = cableIds.length > 0
      ? await prisma.fiber_cables.findMany({
          where: { id: { in: cableIds } },
          select: { id: true, name: true, code: true, tubeCount: true, coresPerTube: true, totalCores: true },
        })
      : [];
    const cableMap = Object.fromEntries(cables.map(c => [c.id, c]));

    const result = segments.map(s => ({
      id: s.id,
      cableId: s.cableId,
      cable: cableMap[s.cableId] ?? null,
      portFrom: s.fromPort,
      portTo: s.toPort,
      status: s.status,
      createdAt: s.createdAt,
    }));

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[OTB_FEEDER_GET]', error);
    return NextResponse.json({ error: 'Failed to fetch feeder cables', details: error.message }, { status: 500 });
  }
}

// ── POST – assign a feeder cable to an OTB ───────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { cableId, portFrom, portTo } = body;

    if (!cableId) {
      return NextResponse.json({ error: 'cableId is required' }, { status: 400 });
    }

    // Verify OTB exists
    const otb = await prisma.network_otbs.findUnique({ where: { id }, select: { id: true } });
    if (!otb) return NextResponse.json({ error: 'OTB not found' }, { status: 404 });

    // Verify cable exists
    const cable = await prisma.fiber_cables.findUnique({
      where: { id: cableId },
      select: { id: true, name: true, totalCores: true },
    });
    if (!cable) return NextResponse.json({ error: 'Fiber cable not found' }, { status: 400 });

    // Check duplicate: same cable already assigned to this OTB
    const dup = await prisma.cable_segments.findFirst({
      where: { toDeviceType: 'OTB', toDeviceId: id, fromDeviceType: 'FEEDER', cableId },
    });
    if (dup) {
      return NextResponse.json({ error: `Cable "${cable.name}" already assigned to this OTB` }, { status: 409 });
    }

    const segment = await prisma.cable_segments.create({
      data: {
        id: nanoid(),
        cableId,
        fromDeviceType: 'FEEDER',
        fromDeviceId: cableId,
        fromPort: portFrom ?? 1,
        toDeviceType: 'OTB',
        toDeviceId: id,
        toPort: portTo ?? (cable.totalCores ?? 24),
        lengthMeters: 0,
        status: 'ACTIVE',
      },
    });

    return NextResponse.json({ success: true, segment }, { status: 201 });
  } catch (error: any) {
    console.error('[OTB_FEEDER_POST]', error);
    return NextResponse.json({ error: 'Failed to assign feeder cable', details: error.message }, { status: 500 });
  }
}

// ── DELETE – remove a feeder cable assignment ────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const segmentId = searchParams.get('segmentId');

    if (!segmentId) {
      return NextResponse.json({ error: 'segmentId query param required' }, { status: 400 });
    }

    await prisma.cable_segments.deleteMany({
      where: { id: segmentId, toDeviceType: 'OTB', toDeviceId: id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[OTB_FEEDER_DELETE]', error);
    return NextResponse.json({ error: 'Failed to delete feeder cable', details: error.message }, { status: 500 });
  }
}
