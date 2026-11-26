import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';

export const dynamic = 'force-dynamic';

const OPEN_STATUSES = ['unmatched', 'ambiguous', 'error'];
const LOOKBACK_DAYS = 30;

/**
 * GET /api/payment-gateway/qris-mandiri/unmatched
 *
 * QRIS notifications that did not settle anything (no pending QR with that
 * nominal, QR already expired, two QRs with the same nominal, or a failed
 * settlement), each with the QR orders it could belong to, so an admin can
 * settle it by hand instead of digging through webhook logs.
 */
export async function GET() {
  const authCheck = await requirePermission('settings.payment');
  if (!authCheck.authorized) return authCheck.response;
  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const logs = await prisma.webhookLog.findMany({
      where: { gateway: 'qris_own', status: { in: OPEN_STATUSES }, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const amounts = [...new Set(logs.map((l) => l.amount).filter((a): a is number => typeof a === 'number'))];
    const orderIds = [...new Set(logs.filter((l) => l.status === 'error').map((l) => l.orderId))];
    const pendings = amounts.length || orderIds.length
      ? await prisma.qrisPending.findMany({
          where: {
            createdAt: { gte: since },
            OR: [
              ...(amounts.length ? [{ uniqueAmount: { in: amounts }, status: 'pending' }] : []),
              ...(orderIds.length ? [{ orderId: { in: orderIds } }] : []),
            ],
          },
          select: { id: true, orderId: true, invoiceId: true, userId: true, baseAmount: true, uniqueAmount: true, status: true, expiresAt: true, createdAt: true },
        })
      : [];

    const invoiceIds = pendings.map((p) => p.invoiceId).filter((v): v is string => !!v);
    const invoices = invoiceIds.length
      ? await prisma.invoice.findMany({
          where: { id: { in: invoiceIds } },
          select: { id: true, invoiceNumber: true, customerName: true, customerUsername: true, status: true },
        })
      : [];
    const invoiceById = new Map(invoices.map((i) => [i.id, i]));

    const items = logs.map((log) => {
      let detail: { sourceApp?: string; rawText?: string } = {};
      try {
        detail = log.payload ? JSON.parse(log.payload) : {};
      } catch {
        detail = {};
      }
      const candidates = pendings
        .filter((p) => (log.status === 'error' ? p.orderId === log.orderId : p.uniqueAmount === log.amount && p.status === 'pending'))
        .map((p) => {
          const inv = p.invoiceId ? invoiceById.get(p.invoiceId) : undefined;
          return {
            pendingId: p.id,
            orderId: p.orderId,
            baseAmount: p.baseAmount,
            uniqueAmount: p.uniqueAmount,
            status: p.status,
            expiresAt: p.expiresAt,
            expired: p.expiresAt < new Date(),
            invoiceNumber: inv?.invoiceNumber ?? null,
            invoiceStatus: inv?.status ?? null,
            customerName: inv?.customerName ?? null,
            customerUsername: inv?.customerUsername ?? null,
          };
        });
      return {
        id: log.id,
        kind: log.status as 'unmatched' | 'ambiguous' | 'error',
        amount: log.amount,
        sourceApp: detail.sourceApp ?? null,
        rawText: detail.rawText ?? null,
        reason: log.errorMessage,
        createdAt: log.createdAt,
        candidates,
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error('[QRIS unmatched] list error:', error);
    return NextResponse.json({ error: 'Gagal memuat notifikasi QRIS' }, { status: 500 });
  }
}
