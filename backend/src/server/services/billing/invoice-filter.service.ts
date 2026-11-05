/**
 * The Tagihan list filters, in one place, so the list and its export
 * always select the same invoices.
 *
 * Query params:
 *   status      all | UNPAID | PENDING (= PENDING+OVERDUE) | PAID | OVERDUE | CANCELLED
 *   month       YYYY-MM — PAID by paidAt, others by dueDate
 *   startDate / endDate  YYYY-MM-DD on createdAt (export dialog range)
 *   search      invoice number, customer name / username / phone
 *   userId      one customer
 *   installerId '' | all | none | <id>
 */
import type { Prisma, invoices_status } from '@prisma/client';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC } from '@/lib/timezone';
import { installerInvoiceWhere, parseInstallerFilter } from '@/server/services/installer.service';

const INVOICE_STATUSES: invoices_status[] = ['PENDING', 'PAID', 'OVERDUE', 'CANCELLED'];

export function buildInvoiceListWhere(sp: URLSearchParams): Prisma.invoiceWhereInput {
  const where: Prisma.invoiceWhereInput = {};
  const and: Prisma.invoiceWhereInput[] = [];
  const status = sp.get('status');

  const month = sp.get('month');
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    const range = {
      gte: startOfDayWIBtoUTC(new Date(Date.UTC(y, m - 1, 1))),
      lte: endOfDayWIBtoUTC(new Date(Date.UTC(y, m, 0))),
    };
    if (status === 'PAID') where.paidAt = range;
    else where.dueDate = range;
  }

  const startDate = sp.get('startDate');
  const endDate = sp.get('endDate');
  if (startDate && endDate) {
    where.createdAt = { gte: startOfDayWIBtoUTC(startDate), lte: endOfDayWIBtoUTC(endDate) };
  }

  if (status && status !== 'all') {
    if (status === 'UNPAID' || status === 'PENDING') where.status = { in: ['PENDING', 'OVERDUE'] };
    else if (INVOICE_STATUSES.includes(status as invoices_status)) where.status = status as invoices_status;
  }

  const userId = sp.get('userId');
  if (userId) where.userId = userId;

  // MySQL `contains` is already case-insensitive.
  const search = sp.get('search')?.trim();
  if (search) {
    and.push({
      OR: [
        { invoiceNumber: { contains: search } },
        { customerName: { contains: search } },
        { customerUsername: { contains: search } },
        { customerPhone: { contains: search } },
        { user: { is: { name: { contains: search } } } },
        { user: { is: { username: { contains: search } } } },
        { user: { is: { phone: { contains: search } } } },
      ],
    });
  }

  // AND: "Belum ditentukan" is an OR of its own and must not replace search.
  const installer = installerInvoiceWhere(parseInstallerFilter(sp.get('installerId')));
  if (Object.keys(installer).length) and.push(installer);

  if (and.length) where.AND = and;
  return where;
}
