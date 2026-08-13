import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { nanoid } from 'nanoid';
import { FIBER_COLORS, CABLE_TYPES, CableType } from '@/lib/network/fiber-core-types';

// GET /api/network/cables - List all fiber cables with optional filters
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status');
    const cableType = searchParams.get('cableType');
    const includeDetails = searchParams.get('includeDetails') === 'true';

    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { code: { contains: search } },
        { name: { contains: search } },
        { manufacturer: { contains: search } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (cableType) {
      where.cableType = cableType;
    }

    const [cables, total] = await Promise.all([
      prisma.fiber_cables.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: (includeDetails ? {
          tubes: {
            orderBy: { tubeNumber: 'asc' },
            include: {
              cores: {
                orderBy: { coreNumber: 'asc' },
              },
            },
          },
          cable_segments: true,
        } : {
          _count: {
            select: {
              tubes: true,
              cable_segments: true,
            },
          },
        }) as any,
      }),
      prisma.fiber_cables.count({ where }),
    ]);

    // Calculate usage statistics for each cable
    const cablesWithStats = await Promise.all(cables.map(async (cable) => {
      const usageStats = await prisma.fiber_cores.aggregate({
        where: {
          tube: {
            cableId: cable.id,
          },
        },
        _count: {
          _all: true,
        },
      });

      const assignedCores = await prisma.fiber_cores.count({
        where: {
          tube: {
            cableId: cable.id,
          },
          status: 'ASSIGNED',
        },
      });

      const availableCores = await prisma.fiber_cores.count({
        where: {
          tube: {
            cableId: cable.id,
          },
          status: 'AVAILABLE',
        },
      });

      return {
        ...cable,
        totalCores: cable.totalCores || (cable.tubeCount * cable.coresPerTube) || usageStats._count._all,
        usageStats: {
          totalCores: usageStats._count._all,
          assignedCores,
          availableCores,
          utilizationPercent: usageStats._count._all > 0 
            ? Math.round((assignedCores / usageStats._count._all) * 100) 
            : 0,
        },
      };
    }));

    return NextResponse.json({
      cables: cablesWithStats,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('[FIBER_CABLES_LIST_ERROR]', error);
    return NextResponse.json(
      { error: 'Failed to fetch fiber cables', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/network/cables - Create a new fiber cable with tubes and cores
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      code,
      name,
      cableType = 'SM_G652',
      tubeCount,
      coresPerTube,
      outerDiameter,
      manufacturer,
      partNumber,
      notes,
    } = body;

    // Validate required fields
    if (!code || !name || !tubeCount || !coresPerTube) {
      return NextResponse.json(
        { error: 'Missing required fields: code, name, tubeCount, coresPerTube' },
        { status: 400 }
      );
    }

    // Check if code already exists
    const existingCable = await prisma.fiber_cables.findUnique({
      where: { code },
    });

    if (existingCable) {
      return NextResponse.json(
        { error: 'Cable with this code already exists' },
        { status: 409 }
      );
    }

    // Create cable with tubes and cores in a transaction
    const cable = await prisma.$transaction(async (tx) => {
      // Create the cable (totalCores is a generated column in DB, don't include it)
      const newCable = await tx.fiber_cables.create({
        data: {
          id: nanoid(),
          code,
          name,
          cableType,
          tubeCount,
          coresPerTube,
          totalCores: tubeCount * coresPerTube,
          outerDiameter: outerDiameter || null,
          manufacturer: manufacturer || null,
          partNumber: partNumber || null,
          status: 'ACTIVE',
          notes: notes || null,
        },
      });

      // Create tubes with cores
      for (let t = 1; t <= tubeCount; t++) {
        const tubeColor = FIBER_COLORS[(t - 1) % 12];
        
        const tube = await tx.fiber_tubes.create({
          data: {
            id: nanoid(),
            cableId: newCable.id,
            tubeNumber: t,
            colorCode: tubeColor.name,
            colorHex: tubeColor.hex,
            coreCount: coresPerTube,
            status: 'ACTIVE',
          },
        });

        // Create cores for this tube
        const coreData: Array<{
          id: string;
          tubeId: string;
          coreNumber: number;
          colorCode: string;
          colorHex: string;
          status: 'AVAILABLE';
        }> = [];
        for (let c = 1; c <= coresPerTube; c++) {
          const coreColor = FIBER_COLORS[(c - 1) % 12];
          coreData.push({
            id: nanoid(),
            tubeId: tube.id,
            coreNumber: c,
            colorCode: coreColor.name,
            colorHex: coreColor.hex,
            status: 'AVAILABLE',
          });
        }

        await tx.fiber_cores.createMany({
          data: coreData,
        });
      }

      return newCable;
    });

    // Fetch the created cable with all relations
    const createdCable = await prisma.fiber_cables.findUnique({
      where: { id: cable.id },
      include: {
        tubes: {
          orderBy: { tubeNumber: 'asc' },
          include: {
            cores: {
              orderBy: { coreNumber: 'asc' },
            },
          },
        },
      },
    });

    return NextResponse.json(createdCable, { status: 201 });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[FIBER_CABLE_CREATE_ERROR]', err);
    return NextResponse.json(
      { error: 'Failed to create fiber cable', details: err.message },
      { status: 500 }
    );
  }
}
