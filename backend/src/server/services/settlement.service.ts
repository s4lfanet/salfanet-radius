import { prisma } from '@/server/db/client';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC, formatWIB, refreshTimezoneFromDB } from '@/lib/timezone';
import { notifyCollectorsOfPayments, fmtRupiah } from '@/server/services/collector-notification.service';

const confirmedNotice = (count: number, amount: number) => ({
  type: 'settlement_confirmed',
  title: 'Setoran dikonfirmasi',
  message: `${count} pembayaran, ${fmtRupiah(amount)}, sudah dicocokkan dan dikonfirmasi admin.`,
  link: '/collector/settlements',
});
const unconfirmedNotice = (count: number, amount: number) => ({
  type: 'settlement_unconfirmed',
  title: 'Konfirmasi setoran dibatalkan',
  message: `Konfirmasi ${count} pembayaran (${fmtRupiah(amount)}) dibatalkan admin. Hubungi admin jika ada yang perlu dicocokkan ulang.`,
  link: '/collector/settlements',
});

/**
 * Finance's check of collector payments, one invoice at a time.
 *
 * Older confirmations were one row per collector and day
 * (collector_settlement_confirmations). That row still counts for every
 * payment of the day, and the admin app still writes it. Taking one payment
 * out of a confirmed day first spreads the day's confirmation onto its
 * payments, so the others stay confirmed.
 */
export async function setInvoiceConfirmation(invoiceIds: string[], confirm: boolean, adminId: string): Promise<number> {
  await refreshTimezoneFromDB();

  const rows = await prisma.invoice.findMany({
    where: {
      id: { in: invoiceIds },
      status: 'PAID',
      paidById: { not: null },
      paymentMethod: { not: 'discount' },
    },
    select: { id: true, paidById: true, paidAt: true, amount: true, settlementConfirmedAt: true },
  });
  if (rows.length === 0) return 0;
  const ids = rows.map((r) => r.id);
  // Whom to tell: only payments whose state actually changes.
  const changing = confirm ? rows.filter((r) => !r.settlementConfirmedAt) : rows;

  await prisma.$transaction(async (tx) => {
    if (!confirm) {
      const days = new Map<string, { collectorId: string; date: string }>();
      for (const r of rows) {
        if (!r.paidById || !r.paidAt) continue;
        const date = formatWIB(r.paidAt, 'yyyy-MM-dd');
        days.set(`${r.paidById}|${date}`, { collectorId: r.paidById, date });
      }
      const records = await tx.collectorSettlementConfirmation.findMany({
        where: { OR: [...days.values()].map((d) => ({ collectorId: d.collectorId, date: d.date })) },
      });
      for (const rec of records) {
        await tx.invoice.updateMany({
          where: {
            paidById: rec.collectorId,
            status: 'PAID',
            settlementConfirmedAt: null,
            paidAt: { gte: startOfDayWIBtoUTC(rec.date), lte: endOfDayWIBtoUTC(rec.date) },
          },
          data: { settlementConfirmedById: rec.confirmedBy, settlementConfirmedAt: rec.confirmedAt },
        });
        await tx.collectorSettlementConfirmation.delete({ where: { collectorId_date: { collectorId: rec.collectorId, date: rec.date } } });
      }
      await tx.invoice.updateMany({ where: { id: { in: ids } }, data: { settlementConfirmedById: null, settlementConfirmedAt: null } });
    } else {
      await tx.invoice.updateMany({
        where: { id: { in: ids }, settlementConfirmedAt: null },
        data: { settlementConfirmedById: adminId, settlementConfirmedAt: new Date() },
      });
    }
  });

  await notifyCollectorsOfPayments(changing, confirm ? confirmedNotice : unconfirmedNotice);
  return ids.length;
}

/** The day-level confirmation, written onto that collector's payments of the day too. */
export async function setDayConfirmation(collectorId: string, date: string, confirm: boolean, adminId: string) {
  await refreshTimezoneFromDB();
  const dayWhere = {
    paidById: collectorId,
    status: 'PAID' as const,
    paidAt: { gte: startOfDayWIBtoUTC(date), lte: endOfDayWIBtoUTC(date) },
  };
  const affected = await prisma.invoice.findMany({
    where: confirm ? { ...dayWhere, settlementConfirmedAt: null } : dayWhere,
    select: { paidById: true, amount: true },
  });
  if (confirm) {
    await prisma.invoice.updateMany({
      where: { ...dayWhere, settlementConfirmedAt: null },
      data: { settlementConfirmedById: adminId, settlementConfirmedAt: new Date() },
    });
  } else {
    await prisma.invoice.updateMany({ where: dayWhere, data: { settlementConfirmedById: null, settlementConfirmedAt: null } });
  }
  await notifyCollectorsOfPayments(affected, confirm ? confirmedNotice : unconfirmedNotice);
}
