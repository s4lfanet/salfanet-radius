import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { settleOrder } from '@/server/services/payment/order-settlement.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payment-gateway/qris-mandiri/unmatched/[id]
 * Body: { action: 'settle', pendingId } | { action: 'retry' } | { action: 'dismiss' }
 *
 *  - settle: the money arrived but no live QR matched (late, or ambiguous).
 *            The admin picks the QR order it belongs to; the nominal must
 *            equal that QR's unique amount.
 *  - retry:  the QR was matched but settling failed; run settlement again
 *            (invoice settlement skips an invoice that is already PAID).
 *  - dismiss: not a customer payment (or handled elsewhere); close it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authCheck = await requirePermission('settings.payment');
  if (!authCheck.authorized) return authCheck.response;
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = body?.action as string | undefined;

    const log = await prisma.webhookLog.findUnique({ where: { id } });
    if (!log || log.gateway !== 'qris_own' || !['unmatched', 'ambiguous', 'error'].includes(log.status)) {
      return NextResponse.json({ error: 'Notifikasi tidak ditemukan atau sudah ditangani' }, { status: 404 });
    }
    const by = `oleh admin ${authCheck.userId}`;

    const close = (status: string, note: string) =>
      prisma.webhookLog.updateMany({
        where: { id, status: { in: ['unmatched', 'ambiguous', 'error'] } },
        data: { status, success: status === 'resolved', errorMessage: `${note} ${by}` },
      });

    if (action === 'dismiss') {
      await close('dismissed', 'Diabaikan');
      return NextResponse.json({ success: true });
    }

    if (action === 'retry') {
      if (log.status !== 'error') return NextResponse.json({ error: 'Hanya untuk pembayaran yang gagal diproses' }, { status: 400 });
      const pending = await prisma.qrisPending.findUnique({ where: { orderId: log.orderId } });
      if (!pending) return NextResponse.json({ error: 'Pesanan QRIS tidak ditemukan' }, { status: 404 });
      await settleOrder(pending.orderId, 'settlement', 'qris_own', 'manual_retry', pending.paidAt ?? new Date(), pending.id, pending.baseAmount);
      await close('resolved', 'Diproses ulang');
      return NextResponse.json({ success: true });
    }

    if (action === 'settle') {
      if (log.status === 'error') return NextResponse.json({ error: 'Gunakan Proses ulang untuk pembayaran yang gagal' }, { status: 400 });
      const pendingId = typeof body.pendingId === 'string' ? body.pendingId : '';
      const pending = pendingId ? await prisma.qrisPending.findUnique({ where: { id: pendingId } }) : null;
      if (!pending) return NextResponse.json({ error: 'Pesanan QRIS tidak ditemukan' }, { status: 404 });
      if (pending.status !== 'pending') return NextResponse.json({ error: 'Pesanan QRIS ini sudah dibayar' }, { status: 409 });
      if (log.amount !== pending.uniqueAmount) {
        return NextResponse.json({ error: 'Nominal notifikasi tidak sama dengan nominal QR pesanan ini' }, { status: 400 });
      }

      // Claim first so two admins cannot settle the same QR twice.
      const now = new Date();
      const claimed = await prisma.qrisPending.updateMany({
        where: { id: pending.id, status: 'pending' },
        data: { status: 'paid', sourceApp: 'manual', paidAt: now },
      });
      if (claimed.count === 0) return NextResponse.json({ error: 'Pesanan QRIS ini sudah dibayar' }, { status: 409 });

      try {
        await settleOrder(pending.orderId, 'settlement', 'qris_own', 'manual_reconcile', now, pending.id, pending.baseAmount);
      } catch (e) {
        // Settlement failed: keep the log open as an error so it can be retried.
        await prisma.webhookLog.update({
          where: { id },
          data: { status: 'error', orderId: pending.orderId, errorMessage: e instanceof Error ? e.message : String(e) },
        });
        return NextResponse.json({ error: 'Gagal memproses pembayaran; bisa dicoba lagi lewat Proses ulang' }, { status: 500 });
      }
      await close('resolved', `Dicocokkan manual ke ${pending.orderId}`);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Aksi tidak dikenal' }, { status: 400 });
  } catch (error) {
    console.error('[QRIS unmatched] action error:', error);
    return NextResponse.json({ error: 'Gagal memproses' }, { status: 500 });
  }
}
