import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { logActivity } from "@/server/services/activity-log.service";
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { z, parseBody } from '@/lib/parse-body';
import type { Prisma } from '@prisma/client';
import { buildTransactionFilters } from '@/server/services/billing/transaction-filter.service';
import { linkTransactionCustomers, linkTransactionCustomersSafe } from '@/server/services/billing/transaction-customer.service';
import { pageAcrossGroups, summarizeTransactionsByInstaller, transactionGroupWhere } from '@/server/services/installer.service';

const createTransactionSchema = z.object({
  categoryId: z.string().min(1, 'Category is required'),
  type: z.enum(['INCOME', 'EXPENSE']),
  // The web form sends the amount as text ("150000"); accept both.
  amount: z.coerce.number().int().positive('Amount must be positive'),
  description: z.string().min(1, 'Description is required').max(500),
  date: z.string().optional(),
  reference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

// GET - List transactions with filters & stats
export async function GET(request: NextRequest) {
  const authCheck = await requirePermission('keuangan.view');
  if (!authCheck.authorized) return authCheck.response;
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "50") || 50);
    const skip = (page - 1) * limit;
    // groupBy=installer: list group by group (Belum ditentukan, installers
    // A–Z, then non-customer rows) with per-group totals.
    const groupByInstaller = searchParams.get("groupBy") === "installer";

    // Resolve the customer of rows written since the last read, so the
    // installer filter and grouping see them.
    await linkTransactionCustomersSafe();

    const { list: where, stats: statsWhere } = buildTransactionFilters(searchParams);
    const include = {
      category: true,
      pppoeUser: { select: { id: true, name: true, username: true, installer: { select: { id: true, name: true } } } },
    } as const;

    const [total, installerSummary] = await Promise.all([
      prisma.transaction.count({ where }),
      groupByInstaller ? summarizeTransactionsByInstaller(where) : Promise.resolve(undefined),
    ]);

    const transactions = installerSummary
      ? await pageAcrossGroups(installerSummary, skip, limit, (g, gSkip, take) =>
          prisma.transaction.findMany({
            where: { AND: [where, transactionGroupWhere(g)] },
            include,
            orderBy: [{ date: "desc" }, { id: "desc" }],
            skip: gSkip,
            take,
          }),
        )
      : await prisma.transaction.findMany({
          where,
          include,
          orderBy: { date: "desc" },
          skip,
          take: limit,
        });

    // Totals cards: date range + installer (not type/category/search).
    const sw = (extra: Prisma.transactionWhereInput) => ({ AND: [statsWhere, extra] });
    const [pppoeCategory, hotspotCategory, installCategory] = await Promise.all([
      prisma.transactionCategory.findFirst({ where: { name: "Pembayaran PPPoE", type: "INCOME" } }),
      prisma.transactionCategory.findFirst({ where: { name: "Pembayaran Hotspot", type: "INCOME" } }),
      prisma.transactionCategory.findFirst({ where: { name: "Biaya Instalasi", type: "INCOME" } }),
    ]);
    const [incomeTotal, expenseTotal, incomeCount, expenseCount, pppoeIncome, hotspotIncome, installIncome] = await Promise.all([
      prisma.transaction.aggregate({ where: sw({ type: "INCOME" }), _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: sw({ type: "EXPENSE" }), _sum: { amount: true } }),
      prisma.transaction.count({ where: sw({ type: "INCOME" }) }),
      prisma.transaction.count({ where: sw({ type: "EXPENSE" }) }),
      prisma.transaction.aggregate({ where: sw({ type: "INCOME", categoryId: pppoeCategory?.id ?? '__none__' }), _sum: { amount: true }, _count: true }),
      prisma.transaction.aggregate({ where: sw({ type: "INCOME", categoryId: hotspotCategory?.id ?? '__none__' }), _sum: { amount: true }, _count: true }),
      prisma.transaction.aggregate({ where: sw({ type: "INCOME", categoryId: installCategory?.id ?? '__none__' }), _sum: { amount: true }, _count: true }),
    ]);

    const totalIncome = incomeTotal._sum.amount || 0;
    const totalExpense = expenseTotal._sum.amount || 0;
    const balance = Number(totalIncome) - Number(totalExpense);

    return NextResponse.json({
      success: true,
      transactions,
      total,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      ...(installerSummary ? { installerSummary } : {}),
      stats: {
        totalIncome: Number(totalIncome),
        totalExpense: Number(totalExpense),
        balance,
        incomeCount,
        expenseCount,
        pppoeIncome: Number(pppoeIncome._sum.amount || 0),
        pppoeCount: pppoeIncome._count,
        hotspotIncome: Number(hotspotIncome._sum.amount || 0),
        hotspotCount: hotspotIncome._count,
        installIncome: Number(installIncome._sum.amount || 0),
        installCount: installIncome._count,
      },
    });
  } catch (error) {
    console.error("Get transactions error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch transactions" },
      { status: 500 },
    );
  }
}

// POST - Create new transaction
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('keuangan.create');
  if (!authCheck.authorized) return authCheck.response;
  try {
    const { data, error } = await parseBody(request, createTransactionSchema);
    if (error) return error;
    const { categoryId, type, amount, description, date, reference, notes } = data;

    // Verify category exists
    const category = await prisma.transactionCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      return NextResponse.json(
        { success: false, error: "Category not found" },
        { status: 404 },
      );
    }
    if (category.type !== type) {
      return NextResponse.json(
        { success: false, error: `Kategori "${category.name}" bukan kategori ${type === 'EXPENSE' ? 'pengeluaran' : 'pemasukan'}` },
        { status: 400 },
      );
    }
    const actor = authCheck.session?.user as { username?: string; name?: string } | undefined;

    // Create transaction
    const transaction = await prisma.transaction.create({
      data: {
        id: nanoid(),
        categoryId,
        type,
        amount,
        description,
        date: date ? new Date(date) : new Date(),
        reference: reference || null,
        notes: notes || null,
        createdBy: actor?.username || actor?.name || null,
      },
      include: {
        category: true,
      },
    });

    // Log activity
    try {
      const session = authCheck.session;
      await logActivity({
        userId: (session?.user as any)?.id,
        username: (session?.user as any)?.username || 'Admin',
        userRole: (session?.user as any)?.role,
        action: type === 'INCOME' ? 'ADD_INCOME' : 'ADD_EXPENSE',
        description: `${type}: ${description} - Rp ${amount.toLocaleString('id-ID')}`,
        module: 'transaction',
        status: 'success',
        request,
        metadata: {
          transactionId: transaction.id,
          type,
          amount,
          categoryId,
          categoryName: category.name,
        },
      });
    } catch (logError) {
      console.error('Activity log error:', logError);
    }

    return NextResponse.json({
      success: true,
      message: "Transaction created successfully",
      transaction,
    });
  } catch (error) {
    console.error("Create transaction error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create transaction" },
      { status: 500 },
    );
  }
}

// PUT - Update transaction
export async function PUT(request: NextRequest) {
  const authCheck = await requirePermission('keuangan.edit');
  if (!authCheck.authorized) return authCheck.response;
  try {
    const body = await request.json();
    const {
      id,
      categoryId,
      type,
      amount,
      description,
      date,
      reference,
      notes,
    } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Transaction ID required" },
        { status: 400 },
      );
    }

    const parsedAmount = amount !== undefined && amount !== null && amount !== '' ? parseInt(String(amount), 10) : undefined;
    if (parsedAmount !== undefined && (!Number.isFinite(parsedAmount) || parsedAmount <= 0)) {
      return NextResponse.json({ success: false, error: "Jumlah harus lebih dari 0" }, { status: 400 });
    }
    if (categoryId || type) {
      const current = await prisma.transaction.findUnique({ where: { id }, select: { type: true, categoryId: true } });
      if (!current) {
        return NextResponse.json({ success: false, error: "Transaction not found" }, { status: 404 });
      }
      const category = await prisma.transactionCategory.findUnique({ where: { id: categoryId || current.categoryId } });
      if (!category || category.type !== (type || current.type)) {
        return NextResponse.json({ success: false, error: "Kategori tidak cocok dengan jenis transaksi" }, { status: 400 });
      }
    }

    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        ...(categoryId && { categoryId }),
        ...(type && { type }),
        ...(parsedAmount !== undefined && { amount: parsedAmount }),
        ...(description && { description }),
        ...(date && { date: new Date(date) }),
        ...(reference !== undefined && { reference }),
        ...(notes !== undefined && { notes }),
      },
      include: {
        category: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Transaction updated successfully",
      transaction,
    });
  } catch (error) {
    console.error("Update transaction error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update transaction" },
      { status: 500 },
    );
  }
}

// DELETE - Delete transaction(s)
// Supports:
//   ?id=xxx            — single delete (existing)
//   ?ids=x,y,z         — bulk delete by IDs
//   ?filterDelete=true — delete all matching current filter (?type=&categoryId=&startDate=&endDate=)
export async function DELETE(request: NextRequest) {
  const authCheck = await requirePermission('keuangan.delete');
  if (!authCheck.authorized) return authCheck.response;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const idsParam = searchParams.get("ids");
    const filterDelete = searchParams.get("filterDelete") === "true";

    // ── Bulk delete by IDs ────────────────────────────────────────────────
    if (idsParam) {
      const ids = idsParam.split(",").filter(Boolean);
      if (ids.length === 0) {
        return NextResponse.json({ success: false, error: "No IDs provided" }, { status: 400 });
      }
      const result = await prisma.transaction.deleteMany({ where: { id: { in: ids } } });
      return NextResponse.json({ success: true, message: `${result.count} transaksi dihapus`, count: result.count });
    }

    // ── Delete by filter ─────────────────────────────────────────────────
    if (filterDelete) {
      // Exactly the rows the list shows for these filters (installer
      // included), so the count in the confirmation is what gets deleted.
      // Strict here: if the links could not be refreshed, delete nothing
      // rather than delete by stale links.
      await linkTransactionCustomers();
      const { list: where } = buildTransactionFilters(searchParams);

      const result = await prisma.transaction.deleteMany({ where });
      return NextResponse.json({ success: true, message: `${result.count} transaksi dihapus`, count: result.count });
    }

    // ── Single delete ─────────────────────────────────────────────────────
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Transaction ID required" },
        { status: 400 },
      );
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: "Transaction not found" },
        { status: 404 },
      );
    }

    await prisma.transaction.delete({
      where: { id },
    });

    // Log activity
    try {
      const session = authCheck.session;
      await logActivity({
        userId: (session?.user as any)?.id,
        username: (session?.user as any)?.username || 'Admin',
        userRole: (session?.user as any)?.role,
        action: 'DELETE_TRANSACTION',
        description: `Deleted ${transaction.type}: ${transaction.description}`,
        module: 'transaction',
        status: 'success',
        request,
        metadata: {
          transactionId: id,
          type: transaction.type,
          amount: transaction.amount,
        },
      });
    } catch (logError) {
      console.error('Activity log error:', logError);
    }

    return NextResponse.json({
      success: true,
      message: "Transaction deleted successfully",
    });
  } catch (error) {
    console.error("Delete transaction error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete transaction" },
      { status: 500 },
    );
  }
}
