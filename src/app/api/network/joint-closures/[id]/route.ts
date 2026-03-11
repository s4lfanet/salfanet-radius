import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prepareJCMetadata } from '@/lib/network-sync-helpers';

// GET /api/network/joint-closures/:id - Get Joint Closure detail (enriched)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const jointClosure = await prisma.network_joint_closures.findUnique({
      where: { id }
    });

    if (!jointClosure) {
      return NextResponse.json({ success: false, error: 'Joint Closure not found' }, { status: 404 });
    }

    // ── Input segments: cables arriving AT this JC (from OTB or other devices) ──
    const rawInputSegs = await prisma.cable_segments.findMany({
      where: { toDeviceType: 'JOINT_CLOSURE', toDeviceId: id },
      orderBy: { toPort: 'asc' },
      include: { cable: { select: { id: true, code: true, name: true, cableType: true, tubeCount: true, coresPerTube: true, totalCores: true } } },
    });

    // ── Output segments: cables leaving FROM this JC ────────────────────────
    const rawOutputSegs = await prisma.cable_segments.findMany({
      where: { fromDeviceType: 'JOINT_CLOSURE', fromDeviceId: id },
      orderBy: { fromPort: 'asc' },
      include: { cable: { select: { id: true, code: true, name: true, cableType: true, tubeCount: true, coresPerTube: true, totalCores: true } } },
    });

    // Resolve upstream device names for input segments (OTB)
    const otbIds = rawInputSegs.filter(s => s.fromDeviceType === 'OTB').map(s => s.fromDeviceId);
    const otbs = otbIds.length > 0
      ? await prisma.network_otbs.findMany({ where: { id: { in: otbIds } }, select: { id: true, name: true, code: true } })
      : [];
    const otbMap = Object.fromEntries(otbs.map(o => [o.id, o]));

    // Resolve downstream device names for output segments (ODC / ODP / other JC)
    const odcIdsOut = rawOutputSegs.filter(s => s.toDeviceType === 'ODC').map(s => s.toDeviceId);
    const odpIdsOut = rawOutputSegs.filter(s => s.toDeviceType === 'ODP').map(s => s.toDeviceId);
    const jcIdsOut  = rawOutputSegs.filter(s => s.toDeviceType === 'JOINT_CLOSURE').map(s => s.toDeviceId);

    const [odcOut, odpOut, jcOut] = await Promise.all([
      odcIdsOut.length > 0 ? prisma.networkODC.findMany({ where: { id: { in: odcIdsOut } }, select: { id: true, name: true } }) : [],
      odpIdsOut.length > 0 ? prisma.networkODP.findMany({ where: { id: { in: odpIdsOut } }, select: { id: true, name: true } }) : [],
      jcIdsOut.length  > 0 ? prisma.network_joint_closures.findMany({ where: { id: { in: jcIdsOut } }, select: { id: true, name: true, code: true } }) : [],
    ]);
    const odcOutMap = Object.fromEntries(odcOut.map(d => [d.id, d]));
    const odpOutMap = Object.fromEntries(odpOut.map(d => [d.id, d]));
    const jcOutMap  = Object.fromEntries(jcOut.map(d => [d.id, d]));

    const resolveOutDevice = (seg: any) => {
      if (seg.toDeviceType === 'ODC')           return odcOutMap[seg.toDeviceId] ?? null;
      if (seg.toDeviceType === 'ODP')           return odpOutMap[seg.toDeviceId] ?? null;
      if (seg.toDeviceType === 'JOINT_CLOSURE') return jcOutMap[seg.toDeviceId]  ?? null;
      return null;
    };

    const inputSegments  = rawInputSegs.map(s => ({ ...s, fromDevice: s.fromDeviceType === 'OTB' ? (otbMap[s.fromDeviceId] ?? null) : null }));
    const outputSegments = rawOutputSegs.map(s => ({ ...s, toDevice: resolveOutDevice(s) }));

    // ── Splice points at this JC ─────────────────────────────────────────────
    const splicePoints = await prisma.splice_points.findMany({
      where: { deviceType: 'JOINT_CLOSURE' as any, deviceId: id },
      include: {
        incomingCore: { include: { tube: { include: { cable: { select: { id: true, code: true, name: true } } } } } },
        outgoingCore: { include: { tube: { include: { cable: { select: { id: true, code: true, name: true } } } } } },
      },
      orderBy: [{ trayNumber: 'asc' }, { createdAt: 'asc' }],
    });

    return NextResponse.json({
      success: true,
      data: { ...jointClosure, inputSegments, outputSegments, splicePoints },
    });

  } catch (error: any) {
    console.error('Error fetching joint closure:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch joint closure' }, { status: 500 });
  }
}

// PUT /api/network/joint-closures/:id - Update Joint Closure
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;


    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      code,
      type,
      latitude,
      longitude,
      address,
      cableType,
      fiberCount,
      connections,
      hasSplitter,
      splitterRatio,
      status,
      installDate,
      lastInspection,
      followRoad,
      customRouteWaypoints,
      spliceTrayCount,
      totalSpliceCapacity,
      closureType,
    } = body;

    // Check if exists
    const existing = await prisma.network_joint_closures.findUnique({
      where: { id: id }
    });

    if (!existing) {
      return NextResponse.json({
        success: false,
        error: 'Joint Closure not found'
      }, { status: 404 });
    }

    // If code is changing, check for duplicates
    if (code && code !== existing.code) {
      const duplicate = await prisma.network_joint_closures.findUnique({
        where: { code }
      });

      if (duplicate) {
        return NextResponse.json({
          success: false,
          error: `Joint Closure with code '${code}' already exists`
        }, { status: 409 });
      }
    }

    // Update Joint Closure
    const updated = await prisma.network_joint_closures.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(code && { code }),
        ...(type && { type }),
        ...(latitude !== undefined && { latitude: parseFloat(latitude) }),
        ...(longitude !== undefined && { longitude: parseFloat(longitude) }),
        ...(address !== undefined && { address }),
        ...(cableType && { cableType }),
        ...(fiberCount !== undefined && { fiberCount: parseInt(fiberCount) }),
        ...(connections !== undefined && { connections }),
        ...(hasSplitter !== undefined && { hasSplitter }),
        ...(splitterRatio !== undefined && { splitterRatio }),
        ...(status && { status }),
        ...(installDate !== undefined && { installDate: installDate ? new Date(installDate) : null }),
        ...(lastInspection !== undefined && { lastInspection: lastInspection ? new Date(lastInspection) : null }),
        ...(followRoad !== undefined && { followRoad }),
        ...(customRouteWaypoints !== undefined && { customRouteWaypoints }),
        ...(spliceTrayCount !== undefined && { spliceTrayCount: parseInt(spliceTrayCount) }),
        ...(totalSpliceCapacity !== undefined && { totalSpliceCapacity: parseInt(totalSpliceCapacity) }),
        ...(closureType && { closureType }),
      }
    });

    // 🔄 AUTO-SYNC to network_nodes (Unified Map)
    try {
      await prisma.network_nodes.update({
        where: { id: updated.id },
        data: {
          code: updated.code,
          name: updated.name,
          latitude: updated.latitude,
          longitude: updated.longitude,
          address: updated.address,
          status: updated.status as 'active' | 'inactive' | 'maintenance' | 'damaged',
          metadata: prepareJCMetadata(updated),
        }
      });
      console.log(`✅ Joint Closure ${updated.code} updated in network_nodes`);
    } catch (syncError: any) {
      console.error('⚠️ Failed to sync update to network_nodes:', syncError.message);
      // Tidak throw error
    }

    return NextResponse.json({
      success: true,
      message: 'Joint Closure updated successfully',
      data: updated
    });

  } catch (error: any) {
    console.error('Error updating joint closure:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update joint closure'
    }, { status: 500 });
  }
}

// DELETE /api/network/joint-closures/:id - Delete Joint Closure
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;


    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }


    // Check if exists
    const existing = await prisma.network_joint_closures.findUnique({
      where: { id }
    });

    if (!existing) {
      return NextResponse.json({
        success: false,
        error: 'Joint Closure not found'
      }, { status: 404 });
    }

    // Check if JC is referenced in fiber paths
    const referencedPaths = await prisma.network_fiber_paths.findMany({
      where: {
        pathNodes: {
          path: '$[*].id',
          equals: id
        }
      }
    });

    if (referencedPaths.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Cannot delete Joint Closure. It is referenced in ${referencedPaths.length} fiber path(s). Please remove those references first.`
      }, { status: 409 });
    }

    // Delete Joint Closure
    await prisma.network_joint_closures.delete({
      where: { id }
    });

    // 🔄 AUTO-DELETE from network_nodes (Unified Map)
    try {
      await prisma.network_nodes.delete({
        where: { id }
      });
      console.log(`✅ Joint Closure ${id} deleted from network_nodes`);
    } catch (syncError: any) {
      console.error('⚠️ Failed to delete from network_nodes:', syncError.message);
      // Ignore error jika tidak ada di network_nodes
    }

    return NextResponse.json({
      success: true,
      message: 'Joint Closure deleted successfully'
    });

  } catch (error: any) {
    console.error('Error deleting joint closure:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to delete joint closure'
    }, { status: 500 });
  }
}
