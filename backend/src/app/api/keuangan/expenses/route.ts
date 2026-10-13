import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC, formatWIB, nowWIB } from '@/lib/timezone';

/** Company-timezone bounds of a `yyyy-MM` month. */
function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    from: startOfDayWIBtoUTC(`${y}-${pad(m)}-01`),
    to: endOfDayWIBtoUTC(`${y}-${pad(m)}-${pad(last)}`),
  };
}

function previousMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function sumByCategory(type: 'INCOME' | 'EXPENSE', from: Date, to: Date) {
  const rows = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where: { type, date: { gte: from, lte: to } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.categoryId, { amount: Number(r._sum.amount ?? 0), count: r._count._all }]));
}

/**
 * GET /api/keuangan/expenses?month=YYYY-MM
 *
 * Operating costs for one month set against that month's income: what was
 * spent, on what, versus last month, and what is left as profit.
 */
export async function GET(request: NextRequest) {
  const authCheck = await requirePermission('keuangan.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const param = new URL(request.url).searchParams.get('month');
    const month = param && /^\d{4}-\d{2}$/.test(param) ? param : formatWIB(nowWIB(), 'yyyy-MM');
    const prev = previousMonth(month);
    const cur = monthRange(month);
    const old = monthRange(prev);

    const [categories, expenseNow, expensePrev, incomeNow, expenses] = await Promise.all([
      prisma.transactionCategory.findMany({ where: { type: 'EXPENSE' }, orderBy: { name: 'asc' } }),
      sumByCategory('EXPENSE', cur.from, cur.to),
      sumByCategory('EXPENSE', old.from, old.to),
      prisma.transaction.aggregate({ where: { type: 'INCOME', date: { gte: cur.from, lte: cur.to } }, _sum: { amount: true } }),
      prisma.transaction.findMany({
        where: { type: 'EXPENSE', date: { gte: cur.from, lte: cur.to } },
        include: { category: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' },
        take: 1000,
      }),
    ]);

    const totalExpense = [...expenseNow.values()].reduce((s, v) => s + v.amount, 0);
    const totalExpensePrev = [...expensePrev.values()].reduce((s, v) => s + v.amount, 0);
    const totalIncome = Number(incomeNow._sum.amount ?? 0);

    const byCategory = categories
      .map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        isActive: c.isActive,
        amount: expenseNow.get(c.id)?.amount ?? 0,
        count: expenseNow.get(c.id)?.count ?? 0,
        previousAmount: expensePrev.get(c.id)?.amount ?? 0,
      }))
      .sort((a, b) => b.amount - a.amount || b.previousAmount - a.previousAmount || a.name.localeCompare(b.name));

    return NextResponse.json({
      success: true,
      month,
      previousMonth: prev,
      totalIncome,
      totalExpense,
      totalExpensePrev,
      net: totalIncome - totalExpense,
      byCategory,
      expenses,
    });
  } catch (error) {
    console.error('[Keuangan expenses] GET error:', error);
    return NextResponse.json({ success: false, error: 'Gagal memuat biaya operasional' }, { status: 500 });
  }
}

// The same expense categories prisma/seeds/seed-all.ts installs, for
// installs that were never seeded.
const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Bandwidth & Upstream', description: 'Biaya bandwidth dan koneksi upstream' },
  { name: 'Gaji Karyawan', description: 'Biaya gaji dan upah karyawan' },
  { name: 'Peralatan & Hardware', description: 'Pembelian peralatan dan hardware jaringan' },
  { name: 'Maintenance & Repair', description: 'Biaya perawatan dan perbaikan perangkat' },
  { name: 'Listrik', description: 'Biaya listrik untuk operasional' },
  { name: 'Sewa Tempat', description: 'Biaya sewa kantor atau tempat operasional' },
  { name: 'Komisi Agent', description: 'Biaya komisi untuk agent voucher' },
  { name: 'Marketing & Promosi', description: 'Biaya marketing, iklan, dan promosi' },
  { name: 'Operasional Lainnya', description: 'Biaya operasional lainnya' },
];

/** POST /api/keuangan/expenses — installs the default expense categories that are missing. */
export async function POST() {
  const authCheck = await requirePermission('keuangan.categories');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const existing = new Set((await prisma.transactionCategory.findMany({ select: { name: true } })).map((c) => c.name));
    const missing = DEFAULT_EXPENSE_CATEGORIES.filter((c) => !existing.has(c.name));
    for (const c of missing) {
      await prisma.transactionCategory.create({ data: { id: nanoid(), name: c.name, type: 'EXPENSE', description: c.description, isActive: true } });
    }
    return NextResponse.json({ success: true, created: missing.length });
  } catch (error) {
    console.error('[Keuangan expenses] POST error:', error);
    return NextResponse.json({ success: false, error: 'Gagal memasang kategori' }, { status: 500 });
  }
}
