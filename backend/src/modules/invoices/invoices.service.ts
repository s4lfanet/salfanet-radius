import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC } from '../../common/utils/timezone';
import { randomBytes } from 'crypto';
import { nanoid } from 'nanoid';

function generatePaymentToken(): string {
  return randomBytes(32).toString('hex');
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List invoices with filters — ported from /api/invoices GET
   */
  async getInvoices(params: { status?: string; userId?: string; limit?: number; month?: string }) {
    const where: Record<string, unknown> = {};

    if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
      const [y, m] = params.month.split('-').map(Number);
      const start = startOfDayWIBtoUTC(new Date(Date.UTC(y, m - 1, 1)));
      const end = endOfDayWIBtoUTC(new Date(Date.UTC(y, m, 0)));
      const isPaidTab = params.status === 'PAID';
      where[isPaidTab ? 'paidAt' : 'createdAt'] = { gte: start, lte: end };
    }

    if (params.status && params.status !== 'all') {
      if (params.status === 'UNPAID' || params.status === 'PENDING') {
        where.status = { in: ['PENDING', 'OVERDUE'] };
      } else {
        where.status = params.status;
      }
    }

    if (params.userId) where.userId = params.userId;

    const limit = params.limit || 100;

    const [invoices, total, unpaid, paid, pending, overdue, totalUnpaidAgg, totalPaidAgg] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          user: {
            select: {
              customerId: true, name: true, phone: true, email: true, username: true,
              profile: { select: { name: true } },
              area: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.invoice.count(),
      this.prisma.invoice.count({ where: { status: { in: ['PENDING', 'OVERDUE'] } } }),
      this.prisma.invoice.count({ where: { status: 'PAID' } }),
      this.prisma.invoice.count({ where: { status: 'PENDING' } }),
      this.prisma.invoice.count({ where: { status: 'OVERDUE' } }),
      this.prisma.invoice.aggregate({ where: { status: { in: ['PENDING', 'OVERDUE'] } }, _sum: { amount: true } }),
      this.prisma.invoice.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
    ]);

    return {
      invoices,
      stats: {
        total, unpaid, paid, pending, overdue,
        totalUnpaidAmount: totalUnpaidAgg._sum.amount || 0,
        totalPaidAmount: totalPaidAgg._sum.amount || 0,
      },
    };
  }

  /**
   * Create invoice manually — ported from /api/invoices POST
   */
  async createInvoice(body: { userId: string; amount: number; dueDate?: string; notes?: string }, baseUrl?: string) {
    if (!body.userId || !body.amount) throw new HttpException('User ID and amount are required', HttpStatus.BAD_REQUEST);

    const user = await this.prisma.pppoeUser.findUnique({
      where: { id: body.userId },
      include: { profile: true },
    });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const count = await this.prisma.invoice.count({
      where: { invoiceNumber: { startsWith: `INV-${year}${month}-` } },
    });
    const invoiceNumber = `INV-${year}${month}-${String(count + 1).padStart(4, '0')}`;

    const calculatedDueDate = body.dueDate ? new Date(body.dueDate) : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const company = await this.prisma.company.findFirst();
    const inferredBase = baseUrl || '';
    const finalBaseUrl = (company?.baseUrl && !company.baseUrl.includes('localhost'))
      ? company.baseUrl
      : (inferredBase && !inferredBase.includes('localhost'))
        ? inferredBase
        : company?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const paymentToken = generatePaymentToken();
    const paymentLink = `${finalBaseUrl}/pay/${paymentToken}`;

    const invoice = await this.prisma.invoice.create({
      data: {
        id: crypto.randomUUID(), invoiceNumber, userId: body.userId,
        customerName: user.name, customerPhone: user.phone, customerUsername: user.username,
        amount: body.amount, baseAmount: body.amount,
        dueDate: calculatedDueDate, status: 'PENDING',
        paymentToken, paymentLink,
      },
      include: { user: { select: { name: true, phone: true, email: true } } },
    });

    return { invoice };
  }

  /**
   * Update invoice (mark as paid, etc) — ported from /api/invoices PUT
   * Note: Side-effects (WhatsApp, Email, Push, RADIUS sync, Keuangan sync)
   * are deferred to integration batch. This port focuses on the core
   * invoice status update + user expiry extension + manual payment approval.
   */
  async updateInvoice(body: { id: string; status?: string; paidAt?: string }) {
    if (!body.id) throw new HttpException('Invoice ID is required', HttpStatus.BAD_REQUEST);

    const existingInvoice = await this.prisma.invoice.findUnique({
      where: { id: body.id },
      include: { user: { include: { profile: true } } },
    });
    if (!existingInvoice) throw new HttpException('Invoice not found', HttpStatus.NOT_FOUND);

    const updateData: Record<string, unknown> = {};
    if (body.status) updateData.status = body.status;
    if (body.status === 'PAID' && !body.paidAt) {
      updateData.paidAt = new Date();
    } else if (body.paidAt) {
      updateData.paidAt = new Date(body.paidAt);
    }

    let invoice;
    let paidUpdateCount = 0;

    if (body.status === 'PAID') {
      paidUpdateCount = (await this.prisma.invoice.updateMany({
        where: { id: body.id, status: { not: 'PAID' } },
        data: updateData,
      })).count;
      invoice = await this.prisma.invoice.findUnique({
        where: { id: body.id },
        include: { user: { select: { name: true, phone: true, email: true } } },
      });
      if (!invoice) throw new HttpException('Invoice not found', HttpStatus.NOT_FOUND);
    } else {
      invoice = await this.prisma.invoice.update({
        where: { id: body.id },
        data: updateData,
        include: { user: { select: { name: true, phone: true, email: true } } },
      });
    }

    // If marking as PAID and this request actually changed the status
    if (body.status === 'PAID' && paidUpdateCount > 0) {
      const user = existingInvoice.user;
      if (!user) return { invoice };

      const profile = user.profile;
      if (profile) {
        // Calculate new expiredAt
        const now = new Date();
        let baseDate = user.expiredAt ? new Date(user.expiredAt) : now;
        if (baseDate < now) baseDate = now;
        let newExpiry = new Date(baseDate);

        switch (profile.validityUnit) {
          case 'DAYS': newExpiry.setDate(newExpiry.getDate() + profile.validityValue); break;
          case 'MONTHS': newExpiry.setMonth(newExpiry.getMonth() + profile.validityValue); break;
          case 'HOURS': newExpiry.setHours(newExpiry.getHours() + profile.validityValue); break;
          case 'MINUTES': newExpiry.setMinutes(newExpiry.getMinutes() + profile.validityValue); break;
        }

        // Check for package change
        let targetProfileId = user.profileId;
        let isPackageChange = false;
        if (existingInvoice.additionalFees && typeof existingInvoice.additionalFees === 'object') {
          const feesObj = existingInvoice.additionalFees as any;
          if (feesObj.items && Array.isArray(feesObj.items)) {
            const pkgItem = feesObj.items.find((item: any) =>
              (item.metadata?.type === 'package_change' || item.metadata?.type === 'package_upgrade') &&
              item.metadata?.newPackageId
            );
            if (pkgItem) {
              isPackageChange = true;
              targetProfileId = pkgItem.metadata.newPackageId;
            }
          }
        }

        const finalExpiry = isPackageChange ? (user.expiredAt || new Date()) : newExpiry;
        const shouldActivate = ['isolated', 'suspended', 'expired'].includes(user.status);

        await this.prisma.pppoeUser.update({
          where: { id: user.id },
          data: {
            expiredAt: finalExpiry,
            status: shouldActivate ? 'active' : user.status,
            ...(targetProfileId !== user.profileId && { profileId: targetProfileId }),
          },
        });

        // Approve manual payments
        try {
          await this.prisma.manualPayment.updateMany({
            where: { invoiceId: body.id, status: 'PENDING' },
            data: { status: 'APPROVED', approvedAt: new Date() },
          });
        } catch (mpError) {
          this.logger.error('Manual Payment update error:', mpError);
        }

        // Sync to Keuangan transactions
        try {
          const pppoeCategory = await this.prisma.transactionCategory.findFirst({
            where: { name: 'Pembayaran PPPoE', type: 'INCOME' },
          });
          if (pppoeCategory) {
            const existingTransaction = await this.prisma.transaction.findFirst({
              where: { reference: `INV-${existingInvoice.invoiceNumber}` },
            });
            if (!existingTransaction) {
              await this.prisma.$executeRaw`
                INSERT INTO transactions (id, categoryId, type, amount, description, date, reference, notes, createdAt, updatedAt)
                VALUES (${nanoid()}, ${pppoeCategory.id}, 'INCOME', ${existingInvoice.amount},
                        ${`Pembayaran ${profile.name} - ${user.name}`}, NOW(),
                        ${`INV-${existingInvoice.invoiceNumber}`}, 'Mark as paid by admin', NOW(), NOW())
              `;
            }
          }
        } catch (keuanganError) {
          this.logger.error('Keuangan sync error:', keuanganError);
        }

        // RADIUS sync if user was isolated/suspended or package changed
        const packageChanged = targetProfileId !== user.profileId;
        if (shouldActivate || packageChanged) {
          try {
            if (shouldActivate) {
              await this.prisma.radcheck.deleteMany({ where: { username: user.username, attribute: 'Auth-Type' } });
              await this.prisma.radcheck.deleteMany({ where: { username: user.username, attribute: 'NAS-IP-Address' } });
            }
            await this.prisma.$executeRaw`
              INSERT INTO radcheck (username, attribute, op, value)
              VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password})
              ON DUPLICATE KEY UPDATE value = ${user.password}
            `;
            const targetProfile = targetProfileId !== user.profileId
              ? await this.prisma.pppoeProfile.findUnique({ where: { id: targetProfileId } })
              : profile;
            const groupName = targetProfile?.groupName || profile.groupName;
            await this.prisma.$executeRaw`DELETE FROM radusergroup WHERE username = ${user.username}`;
            await this.prisma.$executeRaw`
              INSERT INTO radusergroup (username, groupname, priority)
              VALUES (${user.username}, ${groupName}, 1)
            `;
          } catch (radiusError) {
            this.logger.error('RADIUS sync error:', radiusError);
          }
        }
      }
    }

    return { invoice };
  }

  /**
   * Delete invoice(s) — ported from /api/invoices DELETE
   */
  async deleteInvoices(params: { id?: string; ids?: string }) {
    if (params.ids) {
      const idList = params.ids.split(',').map((i) => i.trim()).filter(Boolean);
      if (idList.length === 0) throw new HttpException('No valid IDs provided', HttpStatus.BAD_REQUEST);
      await this.prisma.payment.deleteMany({ where: { invoiceId: { in: idList } } });
      const result = await this.prisma.invoice.deleteMany({ where: { id: { in: idList } } });
      return { success: true, message: `${result.count} invoice(s) deleted`, deletedCount: result.count };
    }

    if (!params.id) throw new HttpException('Invoice ID is required', HttpStatus.BAD_REQUEST);
    const existing = await this.prisma.invoice.findUnique({ where: { id: params.id } });
    if (!existing) throw new HttpException('Invoice not found', HttpStatus.NOT_FOUND);
    await this.prisma.payment.deleteMany({ where: { invoiceId: params.id } });
    await this.prisma.invoice.delete({ where: { id: params.id } });
    return { success: true, message: 'Invoice deleted successfully' };
  }

  /**
   * Get invoice counts by status
   */
  async getInvoiceCounts() {
    const [total, unpaid, paid, pending, overdue] = await Promise.all([
      this.prisma.invoice.count(),
      this.prisma.invoice.count({ where: { status: { in: ['PENDING', 'OVERDUE'] } } }),
      this.prisma.invoice.count({ where: { status: 'PAID' } }),
      this.prisma.invoice.count({ where: { status: 'PENDING' } }),
      this.prisma.invoice.count({ where: { status: 'OVERDUE' } }),
    ]);
    return { total, unpaid, paid, pending, overdue };
  }
}
