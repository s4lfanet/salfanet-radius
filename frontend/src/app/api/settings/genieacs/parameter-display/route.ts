import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';

// GET - Fetch parameter display configurations
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const configType = searchParams.get('configType'); // DEVICE_LIST or DEVICE_DETAIL
    const section = searchParams.get('section');

    const where: any = {};
    if (configType) where.configType = configType;
    if (section) where.section = section;

    const configs = await prisma.parameterDisplayConfig.findMany({
      where,
      orderBy: [
        { section: 'asc' },
        { displayOrder: 'asc' }
      ]
    });

    return NextResponse.json({
      success: true,
      configs
    });
  } catch (error: any) {
    console.error('Error fetching parameter display configs:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST - Create new parameter display configuration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      configType,
      section,
      parameterName,
      label,
      parameterPaths,
      enabled = true,
      displayOrder = 0,
      columnWidth,
      format,
      colorCoding,
      icon
    } = body;

    // Validation
    if (!configType || !section || !parameterName || !label || !parameterPaths) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!Array.isArray(parameterPaths) || parameterPaths.length === 0) {
      return NextResponse.json(
        { success: false, error: 'parameterPaths must be a non-empty array' },
        { status: 400 }
      );
    }

    const config = await prisma.parameterDisplayConfig.create({
      data: {
        configType,
        section,
        parameterName,
        label,
        parameterPaths,
        enabled,
        displayOrder,
        columnWidth,
        format,
        colorCoding,
        icon
      }
    });

    return NextResponse.json({
      success: true,
      config
    });
  } catch (error: any) {
    console.error('Error creating parameter display config:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// PUT - Bulk update configurations (reorder, enable/disable)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { configs } = body; // Array of {id, enabled?, displayOrder?}

    if (!Array.isArray(configs)) {
      return NextResponse.json(
        { success: false, error: 'configs must be an array' },
        { status: 400 }
      );
    }

    // Update all configs in transaction
    await prisma.$transaction(
      configs.map((config: any) => {
        const updateData: any = {};
        if (typeof config.enabled === 'boolean') updateData.enabled = config.enabled;
        if (typeof config.displayOrder === 'number') updateData.displayOrder = config.displayOrder;

        return prisma.parameterDisplayConfig.update({
          where: { id: config.id },
          data: updateData
        });
      })
    );

    return NextResponse.json({
      success: true,
      message: 'Configurations updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating parameter display configs:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Reset to defaults
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const configType = searchParams.get('configType');

    if (!configType) {
      return NextResponse.json(
        { success: false, error: 'configType is required' },
        { status: 400 }
      );
    }

    // Delete all configs for this type
    await prisma.parameterDisplayConfig.deleteMany({
      where: { configType: configType as any }
    });

    return NextResponse.json({
      success: true,
      message: 'Configurations reset successfully'
    });
  } catch (error: any) {
    console.error('Error resetting parameter display configs:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
