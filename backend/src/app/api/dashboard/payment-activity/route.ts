import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/dashboard/payment-activity?limit=15
// Recent invoice settlements, regardless of which of the many code paths
// paid them (online gateway, collector cash/transfer, admin manual mark-paid,
// approved manual transfer) — the invoice row itself is the one place all of
// those converge, so this reads from there rather than chasing every route.
export async function GET(request: NextRequest) {
  try {
    const authCheck = await requirePermission('dashboard.view');
    if (!authCheck.authorized) return authCheck.response;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '15', 10) || 15));

    const invoices = await prisma.invoice.findMany({
      where: { status: 'PAID', paidAt: { not: null } },
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        paidAt: true,
        paidById: true,
        customerName: true,
        user: { select: { name: true, username: true } },
        payments: {
          select: { method: true, gateway: { select: { provider: true, name: true } } },
          take: 1,
        },
        manualPayments: {
          where: { status: 'APPROVED' },
          select: { approvedBy: true, bankName: true },
          orderBy: { approvedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { paidAt: 'desc' },
      take: limit,
    });

    // Batch-resolve the two separate "who did this" id spaces (invoice.paidById
    // for collector/admin cash-or-transfer settlements, manualPayment.approvedBy
    // for approved bank-transfer proof reviews) in one query.
    const actorIds = new Set<string>();
    for (const inv of invoices) {
      if (inv.paidById) actorIds.add(inv.paidById);
      const approvedBy = inv.manualPayments[0]?.approvedBy;
      if (approvedBy) actorIds.add(approvedBy);
    }
    const actors = actorIds.size > 0
      ? await prisma.adminUser.findMany({
          where: { id: { in: [...actorIds] } },
          select: { id: true, name: true, role: true },
        })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    const activities = invoices.map((inv) => {
      const gatewayPayment = inv.payments[0];
      const manualPayment = inv.manualPayments[0];

      let methodLabel: string;
      let actorLabel: string;

      if (gatewayPayment) {
        const gatewayName = gatewayPayment.gateway?.name || gatewayPayment.gateway?.provider || gatewayPayment.method;
        methodLabel = 'online';
        actorLabel = `Dibayar online via ${gatewayName} oleh pelanggan`;
      } else if (manualPayment) {
        const approver = manualPayment.approvedBy ? actorMap.get(manualPayment.approvedBy) : null;
        methodLabel = 'transfer';
        actorLabel = approver
          ? `Transfer manual (${manualPayment.bankName}) disetujui oleh ${approver.name}`
          : `Transfer manual (${manualPayment.bankName}) disetujui admin`;
      } else if (inv.paidById) {
        const actor = actorMap.get(inv.paidById);
        const isCollector = actor?.role === 'COLLECTOR';
        methodLabel = isCollector ? 'collector' : 'admin';
        actorLabel = actor
          ? isCollector
            ? `Dilunaskan oleh kolektor ${actor.name}`
            : `Ditandai lunas oleh admin ${actor.name}`
          : 'Ditandai lunas manual';
      } else {
        methodLabel = 'other';
        actorLabel = 'Pembayaran tercatat';
      }

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.user?.name || inv.customerName || '-',
        customerUsername: inv.user?.username || null,
        amount: inv.amount,
        paidAt: inv.paidAt,
        methodLabel,
        actorLabel,
      };
    });

    return NextResponse.json({ success: true, activities });
  } catch (error) {
    console.error('Error fetching payment activity:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch payment activity' },
      { status: 500 }
    );
  }
}
