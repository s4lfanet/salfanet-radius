import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// GET /api/network/otbs/:id - Get OTB by ID (enriched with incomingCable + outputSegments)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const otb = await prisma.network_otbs.findUnique({
      where: { id },
      include: {
        olt: {
          select: { id: true, name: true, ipAddress: true, latitude: true, longitude: true },
        },
        odcs: {
          select: { id: true, name: true, latitude: true, longitude: true, portCount: true, status: true },
        },
      },
    });

    if (!otb) {
      return NextResponse.json({ error: 'OTB not found' }, { status: 404 });
    }

    // ── Enrich: incoming feeder cable with tubes + cores ────────────────────
    let incomingCable = null;
    if (otb.incomingCableId) {
      incomingCable = await prisma.fiber_cables.findUnique({
        where: { id: otb.incomingCableId },
        include: {
          tubes: {
            orderBy: { tubeNumber: 'asc' },
            include: {
              cores: { orderBy: { coreNumber: 'asc' } },
            },
          },
        },
      });
    }

    // ── Enrich: output tube→JC assignments (cable_segments) ─────────────────
    const rawSegments = await prisma.cable_segments.findMany({
      where: { fromDeviceType: 'OTB', fromDeviceId: id },
      orderBy: { fromPort: 'asc' },
    });

    // Resolve JC names for all segments in one query
    const jcIds = rawSegments
      .filter(s => s.toDeviceType === 'JOINT_CLOSURE')
      .map(s => s.toDeviceId);
    const jcs = jcIds.length > 0
      ? await prisma.network_joint_closures.findMany({
          where: { id: { in: jcIds } },
          select: { id: true, name: true, code: true },
        })
      : [];
    const jcMap = Object.fromEntries(jcs.map(j => [j.id, j]));

    const outputSegments = rawSegments.map(s => ({
      ...s,
      toDevice: s.toDeviceType === 'JOINT_CLOSURE' ? (jcMap[s.toDeviceId] ?? null) : null,
    }));

    // ── Enrich: feeder cables (cable_segments with FEEDER → OTB) ────────────
    const feederSegments = await prisma.cable_segments.findMany({
      where: { toDeviceType: 'OTB', toDeviceId: id, fromDeviceType: 'FEEDER' },
      orderBy: { fromPort: 'asc' },
    });
    const feederCableIds = [...new Set(feederSegments.map(s => s.cableId))];
    const feederCables = feederCableIds.length > 0
      ? await prisma.fiber_cables.findMany({
          where: { id: { in: feederCableIds } },
          include: {
            tubes: {
              orderBy: { tubeNumber: 'asc' },
              include: { cores: { orderBy: { coreNumber: 'asc' } } },
            },
          },
        })
      : [];
    const feederCableMap = Object.fromEntries(feederCables.map(c => [c.id, c]));
    const feederCableAssignments = feederSegments.map(s => ({
      segmentId: s.id,
      cableId: s.cableId,
      cable: feederCableMap[s.cableId] ?? null,
      portFrom: s.fromPort,
      portTo: s.toPort,
    }));

    return NextResponse.json({ ...otb, incomingCable, outputSegments, feederCableAssignments });
  } catch (error: any) {
    console.error('[OTB_GET_ERROR]', error);
    return NextResponse.json({ error: 'Failed to fetch OTB', details: error.message }, { status: 500 });
  }
}

// PUT /api/network/otbs/:id - Update OTB
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const {
      name,
      code,
      latitude,
      longitude,
      address,
      oltId,
      portCount,
      cableType,
      feederCable,
      hasSplitter,
      splitterRatio,
      coverageRadiusKm,
      installDate,
      status,
      notes,
      metadata,
      incomingCableId,
      spliceTrayCount,
      totalSpliceCapacity,
    } = body;

    // Check if OTB exists
    const existing = await prisma.network_otbs.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'OTB not found' }, { status: 404 });
    }

    // Check if code is being changed and already exists
    if (code && code !== existing.code) {
      const codeExists = await prisma.network_otbs.findUnique({
        where: { code },
      });
      if (codeExists) {
        return NextResponse.json(
          { error: 'OTB code already exists' },
          { status: 409 }
        );
      }
    }

    // Validate portCount if provided
    if (portCount) {
      const validPortCounts = [12, 24, 48, 96, 144, 288, 576];
      if (!validPortCounts.includes(portCount)) {
        return NextResponse.json(
          { error: `Invalid port count. Must be one of: ${validPortCounts.join(', ')}` },
          { status: 400 }
        );
      }
    }

    const otb = await prisma.network_otbs.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(code && { code }),
        ...(latitude && { latitude: parseFloat(latitude) }),
        ...(longitude && { longitude: parseFloat(longitude) }),
        ...(address !== undefined && { address }),
        ...(oltId !== undefined && { oltId }),
        ...(portCount && { portCount }),
        ...(cableType !== undefined && { cableType }),
        ...(feederCable !== undefined && { feederCable }),
        ...(hasSplitter !== undefined && { hasSplitter }),
        ...(splitterRatio !== undefined && { splitterRatio }),
        ...(coverageRadiusKm && { coverageRadiusKm: parseFloat(coverageRadiusKm) }),
        ...(installDate !== undefined && { installDate: installDate ? new Date(installDate) : null }),
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
        ...(metadata !== undefined && { metadata }),
        ...(incomingCableId !== undefined && { incomingCableId: incomingCableId || null }),
        ...(spliceTrayCount !== undefined && { spliceTrayCount: parseInt(spliceTrayCount?.toString() || '1') }),
        ...(totalSpliceCapacity !== undefined && { totalSpliceCapacity: parseInt(totalSpliceCapacity?.toString() || '24') }),
      },
      include: {
        olt: {
          select: {
            id: true,
            name: true,
            ipAddress: true,
          },
        },
        odcs: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(otb);
  } catch (error: any) {
    console.error('[OTB_UPDATE_ERROR]', error);
    return NextResponse.json(
      { error: 'Failed to update OTB', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/network/otbs/:id - Delete OTB
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    // Check if OTB exists
    const otb = await prisma.network_otbs.findUnique({
      where: { id },
      include: {
        odcs: true,
      },
    });

    if (!otb) {
      // Already deleted from source table — clean up network_nodes orphan if present
      await prisma.network_nodes.deleteMany({ where: { id } }).catch(() => {});
      return NextResponse.json({ message: 'OTB deleted successfully' });
    }

    // Check if OTB has connected ODCs
    if (otb.odcs && otb.odcs.length > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete OTB with connected ODCs',
          details: `This OTB has ${otb.odcs.length} connected ODC(s)`,
        },
        { status: 409 }
      );
    }

    await prisma.network_otbs.delete({
      where: { id },
    });

    // Sync: remove from unified map table
    try {
      await prisma.network_nodes.deleteMany({ where: { id } });
    } catch (_) { /* non-fatal */ }

    return NextResponse.json({ message: 'OTB deleted successfully' });
  } catch (error: any) {
    console.error('[OTB_DELETE_ERROR]', error);
    return NextResponse.json(
      { error: 'Failed to delete OTB', details: error.message },
      { status: 500 }
    );
  }
}
