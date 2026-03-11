import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// GET /api/network/cables/[id] - Get a single fiber cable
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
    const { searchParams } = new URL(request.url);
    const includeDetails = searchParams.get('includeDetails') !== 'false';

    const cable = await prisma.fiber_cables.findUnique({
      where: { id },
      include: (includeDetails ? {
        tubes: {
          orderBy: { tubeNumber: 'asc' },
          include: {
            cores: {
              orderBy: { coreNumber: 'asc' },
            },
          },
        },
        cable_segments: {
          orderBy: { createdAt: 'asc' },
        },
      } : undefined) as any,
    });

    if (!cable) {
      return NextResponse.json({ error: 'Cable not found' }, { status: 404 });
    }

    // Type guard for includeDetails
    type CableWithDetails = typeof cable & {
      tubes?: Array<{
        tubeNumber: number;
        colorCode: string;
        cores?: Array<{ status: string }>;
      }>;
    };
    
    // Calculate statistics
    if (includeDetails && (cable as CableWithDetails).tubes) {
      const cableWithTubes = cable as CableWithDetails;
      const stats = {
        totalCores: 0,
        availableCores: 0,
        assignedCores: 0,
        reservedCores: 0,
        damagedCores: 0,
        tubeStats: [] as Array<{
          tubeNumber: number;
          colorCode: string;
          totalCores: number;
          availableCores: number;
          assignedCores: number;
          reservedCores: number;
          damagedCores: number;
        }>,
      };

      cableWithTubes.tubes?.forEach((tube) => {
        const tubeStats = {
          tubeNumber: tube.tubeNumber,
          colorCode: tube.colorCode,
          totalCores: tube.cores?.length || 0,
          availableCores: 0,
          assignedCores: 0,
          reservedCores: 0,
          damagedCores: 0,
        };

        tube.cores?.forEach((core) => {
          stats.totalCores++;
          
          switch (core.status) {
            case 'AVAILABLE':
              stats.availableCores++;
              tubeStats.availableCores++;
              break;
            case 'ASSIGNED':
              stats.assignedCores++;
              tubeStats.assignedCores++;
              break;
            case 'RESERVED':
              stats.reservedCores++;
              tubeStats.reservedCores++;
              break;
            case 'DAMAGED':
              stats.damagedCores++;
              tubeStats.damagedCores++;
              break;
          }
        });

        stats.tubeStats.push(tubeStats);
      });

      return NextResponse.json({
        ...cable,
        stats,
      });
    }

    return NextResponse.json(cable);
  } catch (error: any) {
    console.error('[FIBER_CABLE_GET_ERROR]', error);
    return NextResponse.json(
      { error: 'Failed to fetch fiber cable', details: error.message },
      { status: 500 }
    );
  }
}

// PUT /api/network/cables/[id] - Update a fiber cable
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

    // Check if cable exists
    const existingCable = await prisma.fiber_cables.findUnique({
      where: { id },
    });

    if (!existingCable) {
      return NextResponse.json({ error: 'Cable not found' }, { status: 404 });
    }

    // Only allow updating certain fields
    const allowedFields = ['code', 'name', 'cableType', 'tubeCount', 'coresPerTube', 'manufacturer', 'partNumber', 'notes', 'status', 'outerDiameter'];
    const updateData: Record<string, unknown> = {};
    
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Recompute totalCores if tube structure changed
    const finalTubeCount = (updateData.tubeCount as number) ?? existingCable.tubeCount;
    const finalCoresPerTube = (updateData.coresPerTube as number) ?? existingCable.coresPerTube;
    updateData.totalCores = finalTubeCount * finalCoresPerTube;

    const updatedCable = await prisma.fiber_cables.update({
      where: { id },
      data: updateData,
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

    return NextResponse.json(updatedCable);
  } catch (error: any) {
    console.error('[FIBER_CABLE_UPDATE_ERROR]', error);
    return NextResponse.json(
      { error: 'Failed to update fiber cable', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/network/cables/[id] - Delete a fiber cable
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

    // Check if cable exists
    const existingCable = await prisma.fiber_cables.findUnique({
      where: { id },
      include: {
        tubes: {
          include: {
            cores: true,
          },
        },
      },
    });

    if (!existingCable) {
      return NextResponse.json({ error: 'Cable not found' }, { status: 404 });
    }

    // Check if any cores are assigned
    const hasAssignedCores = existingCable.tubes?.some((t) => 
      t.cores?.some((c) => c.status === 'ASSIGNED')
    );

    if (hasAssignedCores) {
      return NextResponse.json(
        { error: 'Cannot delete cable with assigned cores. Please release all core assignments first.' },
        { status: 400 }
      );
    }

    // Delete in transaction (cascade will handle tubes and cores)
    await prisma.fiber_cables.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Cable deleted successfully' });
  } catch (error: any) {
    console.error('[FIBER_CABLE_DELETE_ERROR]', error);
    return NextResponse.json(
      { error: 'Failed to delete fiber cable', details: error.message },
      { status: 500 }
    );
  }
}
