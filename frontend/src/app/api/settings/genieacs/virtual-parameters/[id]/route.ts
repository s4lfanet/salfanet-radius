import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { 
      name, parameter, expression, description, isActive,
      displayType, displayOrder, icon, color, category, unit, showInSummary
    } = body;

    if (!name || !parameter || !expression) {
      return NextResponse.json({ success: false, error: 'Name, parameter, and expression are required' }, { status: 400 });
    }

    // Convert empty strings to null for optional fields
    const updated = await prisma.genieacsVirtualParameter.update({
      where: { id },
      data: {
        name: name.trim(),
        parameter: parameter.trim(),
        expression: expression.trim(),
        displayType: displayType && displayType.trim() ? displayType.trim() : 'card',
        displayOrder: typeof displayOrder === 'number' ? displayOrder : 0,
        icon: icon && icon.trim() ? icon.trim() : null,
        color: color && color.trim() ? color.trim() : null,
        category: category && category.trim() ? category.trim() : null,
        unit: unit && unit.trim() ? unit.trim() : null,
        showInSummary: typeof showInSummary === 'boolean' ? showInSummary : true,
        description: description && description.trim() ? description.trim() : null,
        isActive: typeof isActive === 'boolean' ? isActive : true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Error updating virtual parameter:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    const status = error?.code === 'P2025' ? 404 : 500;
    const message = error?.code === 'P2002' ? 'Parameter must be unique' : 'Failed to update virtual parameter';
    return NextResponse.json({ success: false, error: message, details: error?.message }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.genieacsVirtualParameter.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting virtual parameter:', error);
    const status = error?.code === 'P2025' ? 404 : 500;
    return NextResponse.json({ success: false, error: 'Failed to delete virtual parameter' }, { status });
  }
}
