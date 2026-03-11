import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// GET /api/network/splices/[id] - Get single splice point
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

    const splice = await prisma.splice_points.findUnique({
      where: { id },
      include: {
        incomingCore: {
          include: {
            tube: {
              include: {
                cable: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        outgoingCore: {
          include: {
            tube: {
              include: {
                cable: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!splice) {
      return NextResponse.json({ error: 'Splice point not found' }, { status: 404 });
    }

    return NextResponse.json({ splice });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[SPLICE_POINT_GET_ERROR]', err);
    return NextResponse.json(
      { error: 'Failed to fetch splice point', details: err.message },
      { status: 500 }
    );
  }
}

// DELETE /api/network/splices/[id] - Delete splice point and release cores
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

    // Get the splice point first
    const splice = await prisma.splice_points.findUnique({
      where: { id },
      include: {
        incomingCore: true,
        outgoingCore: true,
      },
    });

    if (!splice) {
      return NextResponse.json({ error: 'Splice point not found' }, { status: 404 });
    }

    // Use transaction to delete splice and release cores
    await prisma.$transaction(async (tx) => {
      // Delete the splice point
      await tx.splice_points.delete({
        where: { id },
      });

      // Release incoming core if exists
      if (splice.incomingCoreId) {
        await tx.fiber_cores.update({
          where: { id: splice.incomingCoreId },
          data: {
            status: 'AVAILABLE',
            assignedToType: null,
            assignedToId: null,
            notes: 'Released from splice point deletion',
            updatedAt: new Date(),
          },
        });

        // Add history record
        await tx.core_assignment_history.create({
          data: {
            id: `cah-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            coreId: splice.incomingCoreId,
            action: 'RELEASE',
            previousStatus: 'IN_USE',
            newStatus: 'AVAILABLE',
            performedBy: session.user?.id || 'system',
            reason: `Released from splice point ${id} deletion`,
          },
        });
      }

      // Release outgoing core if exists
      if (splice.outgoingCoreId) {
        await tx.fiber_cores.update({
          where: { id: splice.outgoingCoreId },
          data: {
            status: 'AVAILABLE',
            assignedToType: null,
            assignedToId: null,
            notes: 'Released from splice point deletion',
            updatedAt: new Date(),
          },
        });

        // Add history record
        await tx.core_assignment_history.create({
          data: {
            id: `cah-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            coreId: splice.outgoingCoreId,
            action: 'RELEASE',
            previousStatus: 'IN_USE',
            newStatus: 'AVAILABLE',
            performedBy: session.user?.id || 'system',
            reason: `Released from splice point ${id} deletion`,
          },
        });
      }
    });

    return NextResponse.json({
      message: 'Splice point deleted successfully',
      releasedCores: [splice.incomingCoreId, splice.outgoingCoreId].filter(Boolean),
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[SPLICE_POINT_DELETE_ERROR]', err);
    return NextResponse.json(
      { error: 'Failed to delete splice point', details: err.message },
      { status: 500 }
    );
  }
}
