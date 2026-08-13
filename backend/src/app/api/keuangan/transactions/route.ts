import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC } from "@/lib/timezone";
import { logActivity } from "@/server/services/activity-log.service";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/config";
import { prisma } from '@/server/db/client';

// GET - List transactions with filters & stats
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // INCOME, EXPENSE, or all
    const categoryId = searchParams.get("categoryId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    // Prepare date filters
    // User input is in WIB (YYYY-MM-DD format), convert to UTC for DB query
    let startFilter: Date | undefined;
    let endFilter: Date | undefined;
    if (startDate && endDate) {
      // Convert WIB date string to WIB-as-UTC Date for database query
      startFilter = startOfDayWIBtoUTC(startDate);
      endFilter = endOfDayWIBtoUTC(endDate);
    }

    // Build where clause
    const where: any = {};
    if (type && type !== "all") {
      where.type = type;
    }
    if (categoryId) {
      where.categoryId = categoryId;
    }
    if (startFilter && endFilter) {
      where.date = {
        gte: startFilter,
        lte: endFilter,
      };
    }
    if (search) {
      where.OR = [
        { description: { contains: search } },
        { reference: { contains: search } },
        { notes: { contains: search } }
      ];
    }

    // Get transactions
    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        category: true,
      },
      orderBy: {
        date: "desc",
      },
      skip,
      take: limit,
    });

    const total = await prisma.transaction.count({ where });

    // Get stats - Total Income & Expense
    const incomeTotal = await prisma.transaction.aggregate({
      where: {
        type: "INCOME",
        ...(startFilter && endFilter
          ? {
              date: {
                gte: startFilter,
                lte: endFilter,
              },
            }
          : {}),
      },
      _sum: {
        amount: true,
      },
    });

    const expenseTotal = await prisma.transaction.aggregate({
      where: {
        type: "EXPENSE",
        ...(startFilter && endFilter
          ? {
              date: {
                gte: startFilter,
                lte: endFilter,
              },
            }
          : {}),
      },
      _sum: {
        amount: true,
      },
    });

    const totalIncome = incomeTotal._sum.amount || 0;
    const totalExpense = expenseTotal._sum.amount || 0;
    const balance = Number(totalIncome) - Number(totalExpense);

    // Get count by type — scoped to current date filter
    const incomeCount = await prisma.transaction.count({
      where: {
        type: "INCOME",
        ...(startFilter && endFilter ? { date: { gte: startFilter, lte: endFilter } } : {}),
      },
    });
    const expenseCount = await prisma.transaction.count({
      where: {
        type: "EXPENSE",
        ...(startFilter && endFilter ? { date: { gte: startFilter, lte: endFilter } } : {}),
      },
    });

    // Get income breakdown by category
    const pppoeCategory = await prisma.transactionCategory.findFirst({
      where: { name: "Pembayaran PPPoE", type: "INCOME" },
    });
    const hotspotCategory = await prisma.transactionCategory.findFirst({
      where: { name: "Pembayaran Hotspot", type: "INCOME" },
    });
    const installCategory = await prisma.transactionCategory.findFirst({
      where: { name: "Biaya Instalasi", type: "INCOME" },
    });

    const pppoeIncome = await prisma.transaction.aggregate({
      where: {
        type: "INCOME",
        categoryId: pppoeCategory?.id,
        ...(startFilter && endFilter
          ? {
              date: {
                gte: startFilter,
                lte: endFilter,
              },
            }
          : {}),
      },
      _sum: { amount: true },
      _count: true,
    });

    const hotspotIncome = await prisma.transaction.aggregate({
      where: {
        type: "INCOME",
        categoryId: hotspotCategory?.id,
        ...(startFilter && endFilter
          ? {
              date: {
                gte: startFilter,
                lte: endFilter,
              },
            }
          : {}),
      },
      _sum: { amount: true },
      _count: true,
    });

    const installIncome = await prisma.transaction.aggregate({
      where: {
        type: "INCOME",
        categoryId: installCategory?.id,
        ...(startFilter && endFilter
          ? {
              date: {
                gte: startFilter,
                lte: endFilter,
              },
            }
          : {}),
      },
      _sum: { amount: true },
      _count: true,
    });

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
  try {
    const body = await request.json();
    const { categoryId, type, amount, description, date, reference, notes } =
      body;

    if (!categoryId || !type || !amount || !description) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

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

    // Create transaction
    const transaction = await prisma.transaction.create({
      data: {
        id: nanoid(),
        categoryId,
        type,
        amount: parseInt(amount),
        description,
        date: date ? new Date(date) : new Date(),
        reference: reference || null,
        notes: notes || null,
      },
      include: {
        category: true,
      },
    });

    // Log activity
    try {
      const session = await getServerSession(authOptions);
      await logActivity({
        userId: (session?.user as any)?.id,
        username: (session?.user as any)?.username || 'Admin',
        userRole: (session?.user as any)?.role,
        action: type === 'INCOME' ? 'ADD_INCOME' : 'ADD_EXPENSE',
        description: `${type}: ${description} - Rp ${parseInt(amount).toLocaleString('id-ID')}`,
        module: 'transaction',
        status: 'success',
        request,
        metadata: {
          transactionId: transaction.id,
          type,
          amount: parseInt(amount),
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

    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        ...(categoryId && { categoryId }),
        ...(type && { type }),
        ...(amount && { amount: parseInt(amount) }),
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
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

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
      const type = searchParams.get("type");
      const categoryId = searchParams.get("categoryId");
      const startDate = searchParams.get("startDate");
      const endDate = searchParams.get("endDate");
      const search = searchParams.get("search");

      const where: any = {};
      if (type && type !== "all") where.type = type;
      if (categoryId && categoryId !== "all") where.categoryId = categoryId;
      if (startDate && endDate) {
        where.date = {
          gte: startOfDayWIBtoUTC(startDate),
          lte: endOfDayWIBtoUTC(endDate),
        };
      }
      if (search) {
        where.OR = [
          { description: { contains: search } },
          { reference: { contains: search } },
          { notes: { contains: search } },
        ];
      }

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
