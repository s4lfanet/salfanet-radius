import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { nanoid } from 'nanoid';
import { Prisma } from '@prisma/client';

// GET /api/network/cores - List fiber cores with filters
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const cableId = searchParams.get('cableId');
    const tubeId = searchParams.get('tubeId');
    const status = searchParams.get('status');
    const assignedToId = searchParams.get('assignedToId');

    const skip = (page - 1) * limit;

    const where: Prisma.fiber_coresWhereInput = {};

    if (tubeId) {
      where.tubeId = tubeId;
    } else if (cableId) {
      where.tube = {
        cableId: cableId,
      };
    }

    if (status) {
      where.status = status as Prisma.Enumfiber_cores_statusFilter['equals'];
    }

    if (assignedToId) {
      where.assignedToId = assignedToId;
    }

    const [cores, total] = await Promise.all([
      prisma.fiber_cores.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { tube: { tubeNumber: 'asc' } },
          { coreNumber: 'asc' },
        ],
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
      }),
      prisma.fiber_cores.count({ where }),
    ]);

    return NextResponse.json({
      cores,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[FIBER_CORES_LIST_ERROR]', err);
    return NextResponse.json(
      { error: 'Failed to fetch fiber cores', details: err.message },
      { status: 500 }
    );
  }
}

// POST /api/network/cores - Assign a core or perform bulk operations
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'assign': {
        const { coreId, assignedToType, assignedToId, notes } = body;
        
        if (!coreId || !assignedToType || !assignedToId) {
          return NextResponse.json(
            { error: 'Missing required fields: coreId, assignedToType, assignedToId' },
            { status: 400 }
          );
        }

        const core = await prisma.fiber_cores.findUnique({
          where: { id: coreId },
        });

        if (!core) {
          return NextResponse.json({ error: 'Core not found' }, { status: 404 });
        }

        if (core.status !== 'AVAILABLE' && core.status !== 'RESERVED') {
          return NextResponse.json(
            { error: `Cannot assign core with status ${core.status}` },
            { status: 400 }
          );
        }

        const updatedCore = await prisma.fiber_cores.update({
          where: { id: coreId },
          data: {
            status: 'ASSIGNED',
            assignedToType,
            assignedToId,
            notes: notes || core.notes,
          },
          include: {
            tube: {
              include: {
                cable: true,
              },
            },
          },
        });

        // Log assignment history
        await prisma.core_assignment_history.create({
          data: {
            id: nanoid(),
            coreId,
            action: 'ASSIGN',
            newAssignedToType: assignedToType,
            newAssignedToId: assignedToId,
            previousStatus: core.status,
            newStatus: 'ASSIGNED',
            performedBy: (session.user as { id?: string })?.id || 'system',
            reason: notes,
          },
        });

        // Update tube usage count
        await prisma.fiber_tubes.update({
          where: { id: core.tubeId },
          data: {
            // This would need recalculation, simplified for now
          },
        });

        return NextResponse.json(updatedCore);
      }

      case 'release': {
        const { coreIds, reason } = body;
        
        if (!coreIds || !Array.isArray(coreIds) || coreIds.length === 0) {
          return NextResponse.json(
            { error: 'Missing required field: coreIds (array)' },
            { status: 400 }
          );
        }

        const results = await prisma.$transaction(async (tx) => {
          const released: string[] = [];
          
          for (const coreId of coreIds) {
            const core = await tx.fiber_cores.findUnique({
              where: { id: coreId },
            });

            if (!core || core.status !== 'ASSIGNED') {
              continue;
            }

            await tx.fiber_cores.update({
              where: { id: coreId },
              data: {
                status: 'AVAILABLE',
                assignedToType: null,
                assignedToId: null,
              },
            });

            await tx.core_assignment_history.create({
              data: {
                id: nanoid(),
                coreId,
                action: 'RELEASE',
                previousAssignedToType: core.assignedToType,
                previousAssignedToId: core.assignedToId,
                previousStatus: core.status,
                newStatus: 'AVAILABLE',
                performedBy: (session.user as { id?: string })?.id || 'system',
                reason,
              },
            });

            released.push(coreId);
          }

          return released;
        });

        return NextResponse.json({
          message: `Released ${results.length} cores`,
          releasedCoreIds: results,
        });
      }

      case 'reserve': {
        const { coreIds, reason } = body;
        
        if (!coreIds || !Array.isArray(coreIds) || coreIds.length === 0) {
          return NextResponse.json(
            { error: 'Missing required field: coreIds (array)' },
            { status: 400 }
          );
        }

        const results = await prisma.$transaction(async (tx) => {
          const reserved: string[] = [];
          
          for (const coreId of coreIds) {
            const core = await tx.fiber_cores.findUnique({
              where: { id: coreId },
            });

            if (!core || core.status !== 'AVAILABLE') {
              continue;
            }

            await tx.fiber_cores.update({
              where: { id: coreId },
              data: {
                status: 'RESERVED',
                notes: reason || core.notes,
              },
            });

            await tx.core_assignment_history.create({
              data: {
                id: nanoid(),
                coreId,
                action: 'RESERVE',
                previousStatus: core.status,
                newStatus: 'RESERVED',
                performedBy: (session.user as { id?: string })?.id || 'system',
                reason,
              },
            });

            reserved.push(coreId);
          }

          return reserved;
        });

        return NextResponse.json({
          message: `Reserved ${results.length} cores`,
          reservedCoreIds: results,
        });
      }

      case 'mark_damaged': {
        const { coreIds, reason } = body;
        
        if (!coreIds || !Array.isArray(coreIds) || coreIds.length === 0) {
          return NextResponse.json(
            { error: 'Missing required field: coreIds (array)' },
            { status: 400 }
          );
        }

        const results = await prisma.$transaction(async (tx) => {
          const damaged: string[] = [];
          
          for (const coreId of coreIds) {
            const core = await tx.fiber_cores.findUnique({
              where: { id: coreId },
            });

            if (!core) {
              continue;
            }

            await tx.fiber_cores.update({
              where: { id: coreId },
              data: {
                status: 'DAMAGED',
                assignedToType: null,
                assignedToId: null,
                notes: reason || core.notes,
              },
            });

            await tx.core_assignment_history.create({
              data: {
                id: nanoid(),
                coreId,
                action: 'DAMAGE',
                previousStatus: core.status,
                newStatus: 'DAMAGED',
                performedBy: (session.user as { id?: string })?.id || 'system',
                reason,
              },
            });

            damaged.push(coreId);
          }

          return damaged;
        });

        return NextResponse.json({
          message: `Marked ${results.length} cores as damaged`,
          damagedCoreIds: results,
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Supported actions: assign, release, reserve, mark_damaged' },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[FIBER_CORES_ACTION_ERROR]', err);
    return NextResponse.json(
      { error: 'Failed to perform core action', details: err.message },
      { status: 500 }
    );
  }
}
