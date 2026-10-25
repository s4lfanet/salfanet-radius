import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC, refreshTimezoneFromDB, todayWIBStr, formatWIB } from '@/lib/timezone';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 93;

const isCash = (m: string | null) => !m || m === 'cash';

/**
 * Settlement per collector: what each collector took in over one day, or over
 * a range. Every payment carries the customer's details and whether finance
 * has confirmed it. Days follow the company time zone, the same as the
 * collector's own Setoran Saya, so both screens agree on which day a payment
 * belongs to.
 *
 * `date` keeps the original response (an array of collectors) for the admin
 * app; `from` + `to` adds `days` to each collector.
 */
export async function GET(req: NextRequest) {
  const authCheck = await requirePermission('keuangan.view');
  if (!authCheck.authorized) return authCheck.response;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const isRange = !!(from && to);

  if (isRange && (!DATE.test(from!) || !DATE.test(to!) || from! > to!)) {
    return NextResponse.json({ error: 'Rentang tanggal tidak valid' }, { status: 400 });
  }
  const dateParam = searchParams.get('date');
  if (dateParam && !DATE.test(dateParam)) {
    return NextResponse.json({ error: 'Format tanggal harus YYYY-MM-DD' }, { status: 400 });
  }

  try {
    await refreshTimezoneFromDB();
    const first = isRange ? from! : dateParam || todayWIBStr();
    const last = isRange ? to! : first;
    const spanDays = Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000) + 1;
    if (spanDays > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: `Rentang paling lama ${MAX_RANGE_DAYS} hari` }, { status: 400 });
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        status: 'PAID',
        paidById: { not: null },
        paymentMethod: { not: 'discount' },
        paidAt: { gte: startOfDayWIBtoUTC(first), lte: endOfDayWIBtoUTC(last) },
      },
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        paidAt: true,
        paidById: true,
        invoiceNumber: true,
        customerName: true,
        customerUsername: true,
        customerPhone: true,
        collectorProof: true,
        settlementConfirmedById: true,
        settlementConfirmedAt: true,
        user: {
          select: {
            customerId: true,
            phone: true,
            address: true,
            area: { select: { name: true } },
            profile: { select: { name: true } },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
    });

    // Active collectors, plus any deactivated one who still has payments in
    // the period: their money has not vanished because the account was.
    const paidIds = [...new Set(invoices.map((i) => i.paidById).filter((v): v is string => !!v))];
    const collectors = await prisma.adminUser.findMany({
      where: { role: 'COLLECTOR', OR: [{ isActive: true }, { id: { in: paidIds } }] },
      select: { id: true, name: true, username: true, isActive: true },
      orderBy: { name: 'asc' },
    });

    const dayRecords = await prisma.collectorSettlementConfirmation.findMany({
      where: { date: { gte: first, lte: last } },
      select: { collectorId: true, date: true, confirmedBy: true, confirmedAt: true },
    });
    const recordOf = new Map(dayRecords.map((c) => [`${c.collectorId}|${c.date}`, c]));

    const confirmerIds = new Set<string>([
      ...dayRecords.map((c) => c.confirmedBy),
      ...invoices.map((i) => i.settlementConfirmedById).filter((v): v is string => !!v),
    ]);
    const admins = await prisma.adminUser.findMany({ where: { id: { in: [...confirmerIds] } }, select: { id: true, name: true } });
    const adminName = new Map(admins.map((a) => [a.id, a.name || 'Admin']));

    // A payment is confirmed on its own, or because its collector's day was.
    const confirmationOf = (i: (typeof invoices)[number]) => {
      if (i.settlementConfirmedAt && i.settlementConfirmedById) {
        return { by: adminName.get(i.settlementConfirmedById) || 'Admin', at: i.settlementConfirmedAt };
      }
      const rec = i.paidAt && i.paidById ? recordOf.get(`${i.paidById}|${formatWIB(i.paidAt, 'yyyy-MM-dd')}`) : undefined;
      return rec ? { by: adminName.get(rec.confirmedBy) || 'Admin', at: rec.confirmedAt } : null;
    };

    const totals = (rows: typeof invoices) => ({
      invoice_count: rows.length,
      total_amount: rows.reduce((s, i) => s + i.amount, 0),
      cash_amount: rows.filter((i) => isCash(i.paymentMethod)).reduce((s, i) => s + i.amount, 0),
      transfer_amount: rows.filter((i) => !isCash(i.paymentMethod)).reduce((s, i) => s + i.amount, 0),
    });

    // A group of payments counts as confirmed when every one of them is.
    const groupConfirmation = (rows: typeof invoices) => {
      if (rows.length === 0) return null;
      const all = rows.map(confirmationOf);
      if (all.some((c) => !c)) return null;
      return all.reduce((latest, c) => (c!.at > latest!.at ? c : latest), all[0])!;
    };

    const result = collectors.map((c) => {
      const own = invoices.filter((i) => i.paidById === c.id);
      const whole = !isRange ? groupConfirmation(own) : null;

      const days = isRange
        ? [...new Set(own.map((i) => formatWIB(i.paidAt!, 'yyyy-MM-dd')))].sort().reverse().map((day) => {
            const dayRows = own.filter((i) => formatWIB(i.paidAt!, 'yyyy-MM-dd') === day);
            const dayConf = groupConfirmation(dayRows);
            return { date: day, ...totals(dayRows), confirmed_by: dayConf?.by || null, confirmed_at: dayConf?.at || null };
          })
        : undefined;

      return {
        collector_id: c.id,
        collector_name: c.name,
        collector_username: c.username,
        is_active: c.isActive,
        ...totals(own),
        confirmed_by: whole?.by || null,
        confirmed_at: whole?.at || null,
        ...(days && { days }),
        invoices: own.map((i) => {
          const conf = confirmationOf(i);
          return {
            id: i.id,
            invoiceNumber: i.invoiceNumber,
            amount: i.amount,
            paymentMethod: i.paymentMethod,
            paidAt: i.paidAt,
            customerName: i.customerName,
            customerUsername: i.customerUsername,
            customerId: i.user?.customerId || null,
            phone: i.user?.phone || i.customerPhone || null,
            address: i.user?.address || null,
            areaName: i.user?.area?.name || null,
            profileName: i.user?.profile?.name || null,
            has_proof: !!i.collectorProof,
            confirmed_by: conf?.by || null,
            confirmed_at: conf?.at || null,
          };
        }),
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Collector setoran error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
