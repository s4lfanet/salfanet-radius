import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC, refreshTimezoneFromDB, todayWIBStr, formatWIB } from '@/lib/timezone';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 93;

const isCash = (m: string | null) => !m || m === 'cash';

/**
 * Settlement per collector: what each collector took in over one day, or over
 * a range with a row per day. Days follow the company time zone, the same as
 * the collector's own Setoran Saya, so both screens agree on which day a
 * payment belongs to.
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
        collectorProof: true,
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

    const confirmations = await prisma.collectorSettlementConfirmation.findMany({
      where: { date: { gte: first, lte: last } },
      select: { collectorId: true, date: true, confirmedBy: true, confirmedAt: true },
    });
    const admins = await prisma.adminUser.findMany({
      where: { id: { in: [...new Set(confirmations.map((c) => c.confirmedBy))] } },
      select: { id: true, name: true },
    });
    const adminName = new Map(admins.map((a) => [a.id, a.name]));
    const confirmationOf = new Map(confirmations.map((c) => [`${c.collectorId}|${c.date}`, c]));

    const totals = (rows: typeof invoices) => ({
      invoice_count: rows.length,
      total_amount: rows.reduce((s, i) => s + i.amount, 0),
      cash_amount: rows.filter((i) => isCash(i.paymentMethod)).reduce((s, i) => s + i.amount, 0),
      transfer_amount: rows.filter((i) => !isCash(i.paymentMethod)).reduce((s, i) => s + i.amount, 0),
    });

    const result = collectors.map((c) => {
      const own = invoices.filter((i) => i.paidById === c.id);
      const conf = confirmationOf.get(`${c.id}|${first}`);

      const days = isRange
        ? [...new Set(own.map((i) => formatWIB(i.paidAt!, 'yyyy-MM-dd')))].sort().reverse().map((day) => {
            const dayRows = own.filter((i) => formatWIB(i.paidAt!, 'yyyy-MM-dd') === day);
            const dayConf = confirmationOf.get(`${c.id}|${day}`);
            return {
              date: day,
              ...totals(dayRows),
              confirmed_by: dayConf ? adminName.get(dayConf.confirmedBy) || 'Admin' : null,
              confirmed_at: dayConf?.confirmedAt || null,
            };
          })
        : undefined;

      return {
        collector_id: c.id,
        collector_name: c.name,
        collector_username: c.username,
        is_active: c.isActive,
        ...totals(own),
        // One day: the confirmation of that day. A range has one per day, in `days`.
        confirmed_by: !isRange && conf ? adminName.get(conf.confirmedBy) || 'Admin' : null,
        confirmed_at: !isRange && conf ? conf.confirmedAt : null,
        ...(days && { days }),
        invoices: own.map((i) => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          amount: i.amount,
          paymentMethod: i.paymentMethod,
          paidAt: i.paidAt,
          customerName: i.customerName,
          customerUsername: i.customerUsername,
          has_proof: !!i.collectorProof,
        })),
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Collector setoran error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
