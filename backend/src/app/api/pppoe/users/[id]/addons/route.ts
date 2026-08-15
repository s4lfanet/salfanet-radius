import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pppoe/users/[id]/addons
 * List all addons for a pppoeUser, joined with addonType.
 * Returns effective_price = COALESCE(priceOverride, addonType.price).
 * Ordered by startDate DESC.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission('customers.view');
    if (!authCheck.authorized) return authCheck.response;

    const { id } = await params;

    const user = await prisma.pppoeUser.findUnique({ where: { id }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const customerAddons = await prisma.customerAddon.findMany({
      where: { pppoeUserId: id },
      include: { addonType: true },
      orderBy: { startDate: 'desc' },
    });

    const addons = customerAddons.map((ca) => ({
      id: ca.id,
      pppoeUserId: ca.pppoeUserId,
      addonTypeId: ca.addonTypeId,
      priceOverride: ca.priceOverride,
      effective_price: ca.priceOverride !== null ? ca.priceOverride : ca.addonType.price,
      startDate: ca.startDate,
      endDate: ca.endDate,
      notes: ca.notes,
      createdAt: ca.createdAt,
      addonType: {
        id: ca.addonType.id,
        name: ca.addonType.name,
        description: ca.addonType.description,
        price: ca.addonType.price,
        isRecurring: ca.addonType.isRecurring,
        isActive: ca.addonType.isActive,
      },
    }));

    return NextResponse.json({ addons });
  } catch (error: any) {
    console.error('[CustomerAddons GET] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/pppoe/users/[id]/addons
 * Assign an addon to a customer.
 * Body: { addonTypeId, priceOverride?, startDate?, notes? }
 * If addon is recurring, also update all UNPAID invoices for this user with
 * period >= startDate month: add invoiceAddon record + update invoice.addonAmount + invoice.amount.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission('customers.edit');
    if (!authCheck.authorized) return authCheck.response;

    const { id } = await params;

    const user = await prisma.pppoeUser.findUnique({ where: { id }, select: { id: true, username: true } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { addonTypeId, priceOverride, startDate, notes } = body as {
      addonTypeId?: string;
      priceOverride?: number | null;
      startDate?: string;
      notes?: string;
    };

    if (!addonTypeId) {
      return NextResponse.json({ error: 'addonTypeId is required' }, { status: 400 });
    }

    const addonType = await prisma.addonType.findUnique({ where: { id: addonTypeId } });
    if (!addonType) {
      return NextResponse.json({ error: 'Addon type not found' }, { status: 404 });
    }
    if (!addonType.isActive) {
      return NextResponse.json({ error: 'Addon type is not active' }, { status: 400 });
    }

    const effectivePrice = priceOverride !== undefined && priceOverride !== null ? priceOverride : addonType.price;
    const start = startDate ? new Date(startDate) : new Date();

    const customerAddon = await prisma.customerAddon.create({
      data: {
        pppoeUserId: id,
        addonTypeId,
        priceOverride: priceOverride !== undefined ? priceOverride : null,
        startDate: start,
        notes: notes?.trim() || null,
        createdByAdminId: authCheck.userId || null,
      },
      include: { addonType: true },
    });

    // If recurring, update unpaid invoices for periods >= startDate month
    if (addonType.isRecurring) {
      const periodStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1, 0, 0, 0, 0));

      const unpaidInvoices = await prisma.invoice.findMany({
        where: {
          userId: id,
          status: { in: ['PENDING', 'OVERDUE'] },
          dueDate: { gte: periodStart },
        },
      });

      for (const invoice of unpaidInvoices) {
        // Avoid duplicate invoiceAddon for the same addon on the same invoice
        const existingInvoiceAddon = await prisma.invoiceAddon.findFirst({
          where: { invoiceId: invoice.id, addonTypeId: addonType.id },
        });
        if (existingInvoiceAddon) continue;

        await prisma.invoiceAddon.create({
          data: {
            invoiceId: invoice.id,
            addonTypeId: addonType.id,
            addonName: addonType.name,
            amount: effectivePrice,
          },
        });

        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            addonAmount: { increment: effectivePrice },
            amount: { increment: effectivePrice },
          },
        });
      }
    }

    return NextResponse.json(
      {
        addon: {
          ...customerAddon,
          effective_price: effectivePrice,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[CustomerAddons POST] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
