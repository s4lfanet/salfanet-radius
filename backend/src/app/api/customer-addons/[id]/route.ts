import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/customer-addons/[id]
 * Stop/remove a customer addon.
 * - Set endDate = now() (soft delete/stop)
 * - If the addon was recurring, remove it from UNPAID invoices for current/future periods:
 *   delete invoiceAddon records + subtract from invoice.addonAmount + invoice.amount
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if ((session.user as any)?.role !== 'ADMIN' && (session.user as any)?.role !== 'SUPER_ADMIN' && (session.user as any)?.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    const customerAddon = await prisma.customerAddon.findUnique({
      where: { id },
      include: { addonType: true },
    });

    if (!customerAddon) {
      return NextResponse.json({ error: 'Customer addon not found' }, { status: 404 });
    }

    if (customerAddon.endDate !== null) {
      return NextResponse.json({ error: 'Addon is already stopped' }, { status: 400 });
    }

    const now = new Date();

    // Set endDate = now (soft delete/stop)
    await prisma.customerAddon.update({
      where: { id },
      data: { endDate: now },
    });

    // If recurring, remove from unpaid invoices for current/future periods
    if (customerAddon.addonType?.isRecurring) {
      const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

      const unpaidInvoices = await prisma.invoice.findMany({
        where: {
          userId: customerAddon.pppoeUserId,
          status: { in: ['PENDING', 'OVERDUE'] },
          dueDate: { gte: periodStart },
        },
        include: { invoiceAddons: true },
      });

      for (const invoice of unpaidInvoices) {
        const addonRecords = invoice.invoiceAddons.filter(
          (ia) => ia.addonTypeId === customerAddon.addonTypeId
        );

        if (addonRecords.length === 0) continue;

        const totalSubtract = addonRecords.reduce((sum, ia) => sum + ia.amount, 0);

        // Delete invoiceAddon records for this addon on this invoice
        await prisma.invoiceAddon.deleteMany({
          where: {
            invoiceId: invoice.id,
            addonTypeId: customerAddon.addonTypeId,
          },
        });

        // Subtract from invoice.addonAmount + invoice.amount (never go below 0)
        const newAddonAmount = Math.max(0, invoice.addonAmount - totalSubtract);
        const newAmount = Math.max(0, invoice.amount - totalSubtract);

        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            addonAmount: newAddonAmount,
            amount: newAmount,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Addon stopped successfully.',
    });
  } catch (error: any) {
    console.error('[CustomerAddon DELETE] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
