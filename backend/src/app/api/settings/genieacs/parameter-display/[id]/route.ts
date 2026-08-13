import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

// GET - Fetch single configuration by ID
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const id = parseInt(params.id);
    
    const config = await prisma.parameterDisplayConfig.findUnique({
      where: { id }
    });

    if (!config) {
      return NextResponse.json(
        { success: false, error: 'Configuration not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      config
    });
  } catch (error: any) {
    console.error('Error fetching parameter display config:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// PUT - Update single configuration
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const id = parseInt(params.id);
    const body = await request.json();
    
    const {
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
    } = body;

    // Build update data (only include provided fields)
    const updateData: any = {};
    if (section !== undefined) updateData.section = section;
    if (parameterName !== undefined) updateData.parameterName = parameterName;
    if (label !== undefined) updateData.label = label;
    if (parameterPaths !== undefined) {
      if (!Array.isArray(parameterPaths) || parameterPaths.length === 0) {
        return NextResponse.json(
          { success: false, error: 'parameterPaths must be a non-empty array' },
          { status: 400 }
        );
      }
      updateData.parameterPaths = parameterPaths;
    }
    if (enabled !== undefined) updateData.enabled = enabled;
    if (displayOrder !== undefined) updateData.displayOrder = displayOrder;
    if (columnWidth !== undefined) updateData.columnWidth = columnWidth;
    if (format !== undefined) updateData.format = format;
    if (colorCoding !== undefined) updateData.colorCoding = colorCoding;
    if (icon !== undefined) updateData.icon = icon;

    const config = await prisma.parameterDisplayConfig.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({
      success: true,
      config
    });
  } catch (error: any) {
    console.error('Error updating parameter display config:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Delete single configuration
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const id = parseInt(params.id);
    
    await prisma.parameterDisplayConfig.delete({
      where: { id }
    });

    return NextResponse.json({
      success: true,
      message: 'Configuration deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting parameter display config:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
