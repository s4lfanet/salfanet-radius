/**
 * /api/network/joint-closures/:id/splices
 * CRUD for splice connections at this Joint Closure (stored in splice_points table)
 *
 * A splice connects an incomingCore → outgoingCore at a specific tray inside the JC.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { nanoid } from 'nanoid';

// ── GET /api/network/joint-closures/:id/splices ────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const trayNumber = new URL(request.url).searchParams.get('tray');

    const jc = await prisma.network_joint_closures.findUnique({ where: { id }, select: { id: true } });
    if (!jc) return NextResponse.json({ error: 'Joint Closure not found' }, { status: 404 });

    const splices = await prisma.splice_points.findMany({
      where: {
        deviceType: 'JOINT_CLOSURE' as any,
        deviceId: id,
        ...(trayNumber ? { trayNumber: parseInt(trayNumber) } : {}),
      },
      include: {
        incomingCore: {
          select: {
            id: true, coreNumber: true, colorCode: true, colorHex: true, status: true,
            tube: { select: { id: true, tubeNumber: true, colorCode: true, cable: { select: { id: true, code: true, name: true } } } },
          },
        },
        outgoingCore: {
          select: {
            id: true, coreNumber: true, colorCode: true, colorHex: true, status: true,
            tube: { select: { id: true, tubeNumber: true, colorCode: true, cable: { select: { id: true, code: true, name: true } } } },
          },
        },
      },
      orderBy: [{ trayNumber: 'asc' }, { createdAt: 'asc' }],
    });

    return NextResponse.json(splices);
  } catch (error: any) {
    console.error('[JC_SPLICES_GET]', error);
    return NextResponse.json({ error: 'Failed to fetch splices', details: error.message }, { status: 500 });
  }
}

// ── POST /api/network/joint-closures/:id/splices ───────────────────────────
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
      incomingCoreId,
      outgoingCoreId,
      trayNumber = 1,
      spliceType = 'FUSION',
      insertionLoss,
      reflectance,
      spliceDate,
      splicedBy,
      notes,
    } = body;

    if (!incomingCoreId || !outgoingCoreId) {
      return NextResponse.json({ error: 'incomingCoreId and outgoingCoreId are required' }, { status: 400 });
    }

    // Verify JC exists
    const jc = await prisma.network_joint_closures.findUnique({ where: { id }, select: { id: true } });
    if (!jc) return NextResponse.json({ error: 'Joint Closure not found' }, { status: 404 });

    // Verify cores exist
    const [inCore, outCore] = await Promise.all([
      prisma.fiber_cores.findUnique({ where: { id: incomingCoreId }, select: { id: true, status: true } }),
      prisma.fiber_cores.findUnique({ where: { id: outgoingCoreId }, select: { id: true, status: true } }),
    ]);
    if (!inCore)  return NextResponse.json({ error: 'Incoming core not found' }, { status: 400 });
    if (!outCore) return NextResponse.json({ error: 'Outgoing core not found' }, { status: 400 });

    // Check for duplicate splice on the same incoming core at this JC
    const duplicate = await prisma.splice_points.findFirst({
      where: { deviceType: 'JOINT_CLOSURE' as any, deviceId: id, incomingCoreId },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: `Core ${incomingCoreId} already has a splice in this JC (spliceId: ${duplicate.id})` },
        { status: 409 }
      );
    }

    const splice = await prisma.splice_points.create({
      data: {
        id: nanoid(),
        deviceType: 'JOINT_CLOSURE' as any,
        deviceId: id,
        trayNumber: parseInt(String(trayNumber)),
        incomingCoreId,
        outgoingCoreId,
        spliceType: spliceType as any,
        insertionLoss: insertionLoss ? parseFloat(insertionLoss) : undefined,
        reflectance: reflectance ? parseFloat(reflectance) : undefined,
        spliceDate: spliceDate ? new Date(spliceDate) : undefined,
        splicedBy: splicedBy || undefined,
        notes: notes || undefined,
        status: 'ACTIVE',
      },
      include: {
        incomingCore: {
          select: {
            id: true, coreNumber: true, colorCode: true,
            tube: { select: { id: true, tubeNumber: true, cable: { select: { id: true, code: true, name: true } } } },
          },
        },
        outgoingCore: {
          select: {
            id: true, coreNumber: true, colorCode: true,
            tube: { select: { id: true, tubeNumber: true, cable: { select: { id: true, code: true, name: true } } } },
          },
        },
      },
    });

    // Mark cores as ASSIGNED
    await prisma.fiber_cores.updateMany({
      where: { id: { in: [incomingCoreId, outgoingCoreId] } },
      data: { status: 'ASSIGNED', assignedToType: 'JOINT_CLOSURE', assignedToId: id },
    });

    return NextResponse.json(splice, { status: 201 });
  } catch (error: any) {
    console.error('[JC_SPLICES_POST]', error);
    return NextResponse.json({ error: 'Failed to create splice', details: error.message }, { status: 500 });
  }
}

// ── DELETE /api/network/joint-closures/:id/splices?spliceId=xxx ────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const spliceId = new URL(request.url).searchParams.get('spliceId');
    if (!spliceId) return NextResponse.json({ error: 'spliceId query param is required' }, { status: 400 });

    // Verify splice belongs to this JC
    const splice = await prisma.splice_points.findFirst({
      where: { id: spliceId, deviceType: 'JOINT_CLOSURE' as any, deviceId: id },
    });
    if (!splice) return NextResponse.json({ error: 'Splice not found for this Joint Closure' }, { status: 404 });

    // Free the cores
    await prisma.fiber_cores.updateMany({
      where: { id: { in: [splice.incomingCoreId, splice.outgoingCoreId] } },
      data: { status: 'AVAILABLE', assignedToType: null, assignedToId: null },
    });

    await prisma.splice_points.delete({ where: { id: spliceId } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[JC_SPLICES_DELETE]', error);
    return NextResponse.json({ error: 'Failed to delete splice', details: error.message }, { status: 500 });
  }
}
