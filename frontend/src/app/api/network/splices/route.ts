import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { nanoid } from 'nanoid';
import { ATTENUATION_CONSTANTS } from '@/lib/network/fiber-core-types';
import { Prisma } from '@prisma/client';

// GET /api/network/splices - List splice points with filters
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const deviceType = searchParams.get('deviceType');
    const deviceId = searchParams.get('deviceId');
    const status = searchParams.get('status');
    const spliceType = searchParams.get('spliceType');

    const skip = (page - 1) * limit;

    const where: Prisma.splice_pointsWhereInput = {};

    if (deviceType) {
      where.deviceType = deviceType as Prisma.Enumsplice_points_deviceTypeFilter['equals'];
    }

    if (deviceId) {
      where.deviceId = deviceId;
    }

    if (status) {
      where.status = status as Prisma.Enumsplice_points_statusFilter['equals'];
    }

    if (spliceType) {
      where.spliceType = spliceType as Prisma.Enumsplice_points_spliceTypeFilter['equals'];
    }

    const [splices, total] = await Promise.all([
      prisma.splice_points.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { trayNumber: 'asc' },
          { createdAt: 'desc' },
        ],
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
      }),
      prisma.splice_points.count({ where }),
    ]);

    return NextResponse.json({
      splices,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[SPLICE_POINTS_LIST_ERROR]', err);
    return NextResponse.json(
      { error: 'Failed to fetch splice points', details: err.message },
      { status: 500 }
    );
  }
}

// POST /api/network/splices - Create splice connections
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action = 'create' } = body;

    switch (action) {
      case 'create': {
        const {
          deviceType,
          deviceId,
          trayNumber = 1,
          incomingCoreId,
          outgoingCoreId,
          spliceType = 'FUSION',
          insertionLoss,
          reflectance,
          splicedBy,
          notes,
        } = body;

        // Validate required fields
        if (!deviceType || !deviceId || !incomingCoreId) {
          return NextResponse.json(
            { error: 'Missing required fields: deviceType, deviceId, incomingCoreId' },
            { status: 400 }
          );
        }

        // Verify cores exist
        const incomingCore = await prisma.fiber_cores.findUnique({ where: { id: incomingCoreId } });
        if (!incomingCore) {
          return NextResponse.json({ error: 'Incoming core not found' }, { status: 404 });
        }

        if (outgoingCoreId) {
          const outgoingCore = await prisma.fiber_cores.findUnique({ where: { id: outgoingCoreId } });
          if (!outgoingCore) {
            return NextResponse.json({ error: 'Outgoing core not found' }, { status: 404 });
          }
        }

        // Check for duplicate splice
        const existingSplice = await prisma.splice_points.findFirst({
          where: {
            deviceType,
            deviceId,
            incomingCoreId,
            outgoingCoreId: outgoingCoreId || null,
          },
        });

        if (existingSplice) {
          return NextResponse.json(
            { error: 'Splice connection already exists' },
            { status: 409 }
          );
        }

        // Create the splice point
        const splice = await prisma.splice_points.create({
          data: {
            id: nanoid(),
            deviceType,
            deviceId,
            trayNumber,
            incomingCoreId,
            outgoingCoreId: outgoingCoreId || null,
            spliceType,
            insertionLoss: insertionLoss ?? (spliceType === 'FUSION' 
              ? ATTENUATION_CONSTANTS.SPLICE_LOSS_FUSION 
              : ATTENUATION_CONSTANTS.SPLICE_LOSS_MECHANICAL),
            reflectance: reflectance || null,
            spliceDate: new Date(),
            splicedBy: splicedBy || (session.user as { name?: string })?.name || 'system',
            status: 'ACTIVE',
            notes: notes || null,
          },
          include: {
            incomingCore: {
              include: {
                tube: {
                  include: {
                    cable: true,
                  },
                },
              },
            },
            outgoingCore: {
              include: {
                tube: {
                  include: {
                    cable: true,
                  },
                },
              },
            },
          },
        });

        return NextResponse.json(splice, { status: 201 });
      }

      case 'bulk_create': {
        const { splices: spliceData } = body;

        if (!spliceData || !Array.isArray(spliceData) || spliceData.length === 0) {
          return NextResponse.json(
            { error: 'Missing required field: splices (array)' },
            { status: 400 }
          );
        }

        const results = await prisma.$transaction(async (tx) => {
          const created = [];

          for (const data of spliceData) {
            const {
              deviceType,
              deviceId,
              trayNumber = 1,
              incomingCoreId,
              outgoingCoreId,
              spliceType = 'FUSION',
              insertionLoss,
              notes,
            } = data;

            if (!deviceType || !deviceId || !incomingCoreId) {
              continue;
            }

            // Check for existing splice
            const existing = await tx.splice_points.findFirst({
              where: {
                deviceType,
                deviceId,
                incomingCoreId,
                outgoingCoreId: outgoingCoreId || null,
              },
            });

            if (existing) {
              continue;
            }

            const splice = await tx.splice_points.create({
              data: {
                id: nanoid(),
                deviceType,
                deviceId,
                trayNumber,
                incomingCoreId,
                outgoingCoreId: outgoingCoreId || null,
                spliceType,
                insertionLoss: insertionLoss ?? (spliceType === 'FUSION'
                  ? ATTENUATION_CONSTANTS.SPLICE_LOSS_FUSION
                  : ATTENUATION_CONSTANTS.SPLICE_LOSS_MECHANICAL),
                spliceDate: new Date(),
                splicedBy: (session.user as { name?: string })?.name || 'system',
                status: 'ACTIVE',
                notes: notes || null,
              },
            });

            created.push(splice);
          }

          return created;
        });

        return NextResponse.json({
          message: `Created ${results.length} splice connections`,
          splices: results,
        }, { status: 201 });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Supported actions: create, bulk_create' },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[SPLICE_POINTS_CREATE_ERROR]', err);
    return NextResponse.json(
      { error: 'Failed to create splice connection', details: err.message },
      { status: 500 }
    );
  }
}
