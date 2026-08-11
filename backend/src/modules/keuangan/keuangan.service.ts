import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC } from '../../common/utils/timezone';
import { nanoid } from 'nanoid';

@Injectable()
export class KeuanganService {
  private readonly logger = new Logger(KeuanganService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  // ==================== Transactions ====================

  async getTransactions(params: {
    type?: string; categoryId?: string; startDate?: string; endDate?: string;
    search?: string; page?: number; limit?: number;
  }) {
    let startFilter: Date | undefined;
    let endFilter: Date | undefined;
    if (params.startDate && params.endDate) {
      startFilter = startOfDayWIBtoUTC(params.startDate);
      endFilter = endOfDayWIBtoUTC(params.endDate);
    }

    const where: Record<string, unknown> = {};
    if (params.type && params.type !== 'all') where.type = params.type;
    if (params.categoryId) where.categoryId = params.categoryId;
    if (startFilter && endFilter) where.date = { gte: startFilter, lte: endFilter };
    if (params.search) {
      where.OR = [
        { description: { contains: params.search } },
        { reference: { contains: params.search } },
        { notes: { contains: params.search } },
      ];
    }

    const page = params.page || 1;
    const limit = params.limit || 50;
    const skip = (page - 1) * limit;

    const [transactions, total, incomeTotal, expenseTotal, incomeCount, expenseCount] = await Promise.all([
      this.prisma.transaction.findMany({
        where, include: { category: true }, orderBy: { date: 'desc' }, skip, take: limit,
      }),
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.aggregate({
        where: { type: 'INCOME', ...(startFilter && endFilter ? { date: { gte: startFilter, lte: endFilter } } : {}) },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { type: 'EXPENSE', ...(startFilter && endFilter ? { date: { gte: startFilter, lte: endFilter } } : {}) },
        _sum: { amount: true },
      }),
      this.prisma.transaction.count({
        where: { type: 'INCOME', ...(startFilter && endFilter ? { date: { gte: startFilter, lte: endFilter } } : {}) },
      }),
      this.prisma.transaction.count({
        where: { type: 'EXPENSE', ...(startFilter && endFilter ? { date: { gte: startFilter, lte: endFilter } } : {}) },
      }),
    ]);

    // Income breakdown by category
    const dateFilter = startFilter && endFilter ? { date: { gte: startFilter, lte: endFilter } } : {};
    const [pppoeCategory, hotspotCategory, installCategory] = await Promise.all([
      this.prisma.transactionCategory.findFirst({ where: { name: 'Pembayaran PPPoE', type: 'INCOME' } }),
      this.prisma.transactionCategory.findFirst({ where: { name: 'Pembayaran Hotspot', type: 'INCOME' } }),
      this.prisma.transactionCategory.findFirst({ where: { name: 'Biaya Instalasi', type: 'INCOME' } }),
    ]);

    const [pppoeIncome, hotspotIncome, installIncome] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { type: 'INCOME', categoryId: pppoeCategory?.id, ...dateFilter },
        _sum: { amount: true }, _count: true,
      }),
      this.prisma.transaction.aggregate({
        where: { type: 'INCOME', categoryId: hotspotCategory?.id, ...dateFilter },
        _sum: { amount: true }, _count: true,
      }),
      this.prisma.transaction.aggregate({
        where: { type: 'INCOME', categoryId: installCategory?.id, ...dateFilter },
        _sum: { amount: true }, _count: true,
      }),
    ]);

    const totalIncome = Number(incomeTotal._sum.amount || 0);
    const totalExpense = Number(expenseTotal._sum.amount || 0);

    return {
      success: true, transactions, total,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      stats: {
        totalIncome, totalExpense, balance: totalIncome - totalExpense,
        incomeCount, expenseCount,
        pppoeIncome: Number(pppoeIncome._sum.amount || 0), pppoeCount: pppoeIncome._count,
        hotspotIncome: Number(hotspotIncome._sum.amount || 0), hotspotCount: hotspotIncome._count,
        installIncome: Number(installIncome._sum.amount || 0), installCount: installIncome._count,
      },
    };
  }

  async createTransaction(body: {
    categoryId: string; type: string; amount: number; description: string;
    date?: string; reference?: string; notes?: string;
  }, user?: { id?: string; username?: string; role?: string }) {
    if (!body.categoryId || !body.type || !body.amount || !body.description) {
      throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
    }

    const category = await this.prisma.transactionCategory.findUnique({ where: { id: body.categoryId } });
    if (!category) throw new HttpException('Category not found', HttpStatus.NOT_FOUND);

    const transaction = await this.prisma.transaction.create({
      data: {
        id: nanoid(), categoryId: body.categoryId, type: body.type as never,
        amount: parseInt(String(body.amount)), description: body.description,
        date: body.date ? new Date(body.date) : new Date(),
        reference: body.reference || null, notes: body.notes || null,
      },
      include: { category: true },
    });

    await this.activityLog.logActivity({
      userId: user?.id, username: user?.username || 'Admin', userRole: user?.role,
      action: body.type === 'INCOME' ? 'ADD_INCOME' : 'ADD_EXPENSE',
      description: `${body.type}: ${body.description} - Rp ${parseInt(String(body.amount)).toLocaleString('id-ID')}`,
      module: 'transaction', status: 'success',
      metadata: { transactionId: transaction.id, type: body.type, amount: parseInt(String(body.amount)), categoryId: body.categoryId, categoryName: category.name },
    });

    return { success: true, message: 'Transaction created successfully', transaction };
  }

  async updateTransaction(body: {
    id: string; categoryId?: string; type?: string; amount?: number;
    description?: string; date?: string; reference?: string; notes?: string;
  }) {
    if (!body.id) throw new HttpException('Transaction ID required', HttpStatus.BAD_REQUEST);
    const transaction = await this.prisma.transaction.update({
      where: { id: body.id },
      data: {
        ...(body.categoryId && { categoryId: body.categoryId }),
        ...(body.type && { type: body.type as never }),
        ...(body.amount && { amount: parseInt(String(body.amount)) }),
        ...(body.description && { description: body.description }),
        ...(body.date && { date: new Date(body.date) }),
        ...(body.reference !== undefined && { reference: body.reference }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
      include: { category: true },
    });
    return { success: true, message: 'Transaction updated successfully', transaction };
  }

  async deleteTransactions(params: {
    id?: string; ids?: string; filterDelete?: boolean;
    type?: string; categoryId?: string; startDate?: string; endDate?: string; search?: string;
  }) {
    // Bulk delete by IDs
    if (params.ids) {
      const ids = params.ids.split(',').filter(Boolean);
      if (ids.length === 0) throw new HttpException('No IDs provided', HttpStatus.BAD_REQUEST);
      const result = await this.prisma.transaction.deleteMany({ where: { id: { in: ids } } });
      return { success: true, message: `${result.count} transaksi dihapus`, count: result.count };
    }

    // Delete by filter
    if (params.filterDelete) {
      const where: Record<string, unknown> = {};
      if (params.type && params.type !== 'all') where.type = params.type;
      if (params.categoryId && params.categoryId !== 'all') where.categoryId = params.categoryId;
      if (params.startDate && params.endDate) {
        where.date = { gte: startOfDayWIBtoUTC(params.startDate), lte: endOfDayWIBtoUTC(params.endDate) };
      }
      if (params.search) {
        where.OR = [
          { description: { contains: params.search } },
          { reference: { contains: params.search } },
          { notes: { contains: params.search } },
        ];
      }
      const result = await this.prisma.transaction.deleteMany({ where });
      return { success: true, message: `${result.count} transaksi dihapus`, count: result.count };
    }

    // Single delete
    if (!params.id) throw new HttpException('Transaction ID required', HttpStatus.BAD_REQUEST);
    const transaction = await this.prisma.transaction.findUnique({ where: { id: params.id }, include: { category: true } });
    if (!transaction) throw new HttpException('Transaction not found', HttpStatus.NOT_FOUND);
    await this.prisma.transaction.delete({ where: { id: params.id } });
    return { success: true, message: 'Transaction deleted successfully' };
  }

  // ==================== Categories ====================

  async getCategories(type?: string) {
    const where: Record<string, unknown> = { isActive: true };
    if (type && type !== 'all') where.type = type;

    const categories = await this.prisma.transactionCategory.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { transactions: true } } },
    });

    return { success: true, categories };
  }

  async createCategory(body: { name: string; type: string; description?: string }) {
    if (!body.name || !body.type) throw new HttpException('Name and type are required', HttpStatus.BAD_REQUEST);
    const existing = await this.prisma.transactionCategory.findUnique({ where: { name: body.name } });
    if (existing) throw new HttpException('Category name already exists', HttpStatus.BAD_REQUEST);

    const category = await this.prisma.transactionCategory.create({
      data: { id: nanoid(), name: body.name, type: body.type as never, description: body.description || null },
    });
    return { success: true, message: 'Category created successfully', category };
  }

  async updateCategory(body: { id: string; name?: string; type?: string; description?: string; isActive?: boolean }) {
    if (!body.id) throw new HttpException('Category ID required', HttpStatus.BAD_REQUEST);
    const category = await this.prisma.transactionCategory.update({
      where: { id: body.id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.type && { type: body.type as never }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });
    return { success: true, message: 'Category updated successfully', category };
  }

  async deleteCategory(id: string) {
    if (!id) throw new HttpException('Category ID required', HttpStatus.BAD_REQUEST);
    const transactionCount = await this.prisma.transaction.count({ where: { categoryId: id } });
    if (transactionCount > 0) throw new HttpException('Cannot delete category with existing transactions', HttpStatus.BAD_REQUEST);
    await this.prisma.transactionCategory.delete({ where: { id } });
    return { success: true, message: 'Category deleted successfully' };
  }
}
