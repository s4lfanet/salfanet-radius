/**
 * The Riwayat Transaksi filters, in one place, so the list, its totals and
 * its export select the same rows.
 *
 * Query params: type (INCOME | EXPENSE | all), categoryId,
 * startDate / endDate (YYYY-MM-DD, WIB), search, installerId ('' | all | none | <id>).
 */
import type { Prisma } from '@prisma/client';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC } from '@/lib/timezone';
import { installerTransactionWhere, parseInstallerFilter } from '@/server/services/installer.service';

export interface TransactionFilters {
  /** Every filter: the list and its export. */
  list: Prisma.transactionWhereInput;
  /**
   * Date range + installer only: the totals cards, which show income and
   * expense side by side whatever type, category or search is picked.
   */
  stats: Prisma.transactionWhereInput;
}

export function buildTransactionFilters(sp: URLSearchParams): TransactionFilters {
  const startDate = sp.get('startDate');
  const endDate = sp.get('endDate');
  const dateWhere: Prisma.transactionWhereInput = startDate && endDate
    ? { date: { gte: startOfDayWIBtoUTC(startDate), lte: endOfDayWIBtoUTC(endDate) } }
    : {};
  const installerWhere = installerTransactionWhere(parseInstallerFilter(sp.get('installerId')));

  const and: Prisma.transactionWhereInput[] = [dateWhere, installerWhere];

  const type = sp.get('type');
  if (type === 'INCOME' || type === 'EXPENSE') and.push({ type });

  const categoryId = sp.get('categoryId');
  if (categoryId && categoryId !== 'all') and.push({ categoryId });

  const search = sp.get('search')?.trim();
  if (search) {
    and.push({
      OR: [
        { description: { contains: search } },
        { reference: { contains: search } },
        { notes: { contains: search } },
      ],
    });
  }

  return {
    list: { AND: and },
    stats: { AND: [dateWhere, installerWhere] },
  };
}
