import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/addon-types/[id]
 * Update an addon type. Uses COALESCE pattern — only update provided fields.
 * Body: { name?, description?, price?, isRecurring?, isActive? }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission('customers.edit');
    if (!authCheck.authorized) return authCheck.response;

    const { id } = await params;
    const body = await request.json();
    const { name, description, price, isRecurring, isActive } = body as {
      name?: string;
      description?: string | null;
      price?: number;
      isRecurring?: boolean;
      isActive?: boolean;
    };

    const existing = await prisma.addonType.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Addon type not found' }, { status: 404 });
    }

    // COALESCE pattern: only update provided fields, keep existing otherwise
    const updated = await prisma.addonType.update({
      where: { id },
      data: {
        name: name !== undefined ? name.trim() : existing.name,
        description: description !== undefined ? (description?.trim() || null) : existing.description,
        price: price !== undefined ? price : existing.price,
        isRecurring: isRecurring !== undefined ? isRecurring : existing.isRecurring,
        isActive: isActive !== undefined ? isActive : existing.isActive,
      },
    });

    return NextResponse.json({ addon: updated });
  } catch (error: any) {
    console.error('[AddonTypes PUT] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/addon-types/[id]
 * If addon type is in use by active customer_addons, soft delete (set isActive=false).
 * Otherwise hard delete.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission('customers.delete');
    if (!authCheck.authorized) return authCheck.response;

    const { id } = await params;

    const existing = await prisma.addonType.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Addon type not found' }, { status: 404 });
    }

    // Check if any active customer_addons reference this addon type
    const activeCount = await prisma.customerAddon.count({
      where: { addonTypeId: id, endDate: null },
    });

    if (activeCount > 0) {
      // Soft delete — addon is in use
      await prisma.addonType.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({
        success: true,
        message: `Addon type deactivated (soft delete) — currently assigned to ${activeCount} active customer(s).`,
      });
    }

    // Hard delete — not in use
    await prisma.addonType.delete({ where: { id } });
    return NextResponse.json({ success: true, message: 'Addon type deleted successfully.' });
  } catch (error: any) {
    console.error('[AddonTypes DELETE] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
