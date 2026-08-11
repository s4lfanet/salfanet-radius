import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC, nowWIB } from '../../common/utils/timezone';
import { addMonths } from 'date-fns';
import { nanoid } from 'nanoid';

@Injectable()
export class ManualPaymentsService {
  private readonly logger = new Logger(ManualPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  /**
   * List manual payments with filters — ported from /api/manual-payments GET.
   */
  async listManualPayments(params: { userId?: string; status?: string; month?: string }) {
    const where: Record<string, unknown> = {};
    if (params.userId) where.userId = params.userId;
    if (params.status && params.status !== 'ALL') where.status = params.status;
    if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
      const [y, m] = params.month.split('-').map(Number);
      where.createdAt = {
        gte: startOfDayWIBtoUTC(new Date(Date.UTC(y, m - 1, 1))),
        lte: endOfDayWIBtoUTC(new Date(Date.UTC(y, m, 0))),
      };
    }

    const manualPayments = await this.prisma.manualPayment.findMany({
      where: where as never,
      include: {
        invoice: { select: { invoiceNumber: true, amount: true, dueDate: true, status: true } },
        user: { select: { id: true, customerId: true, username: true, name: true, phone: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: manualPayments };
  }

  /**
   * Get single manual payment — ported from /api/manual-payments/[id] GET.
   */
  async getManualPayment(id: string) {
    const manualPayment = await this.prisma.manualPayment.findUnique({
      where: { id },
      include: { invoice: true, user: { include: { profile: true, area: true } } },
    });
    if (!manualPayment) throw new HttpException('Manual payment not found', HttpStatus.NOT_FOUND);
    return { success: true, data: manualPayment };
  }

  /**
   * Submit new manual payment — ported from /api/manual-payments POST.
   */
  async createManualPayment(body: {
    invoiceId: string;
    userId: string;
    amount: number;
    bankName: string;
    accountNumber?: string;
    accountName: string;
    paymentDate: string;
    receiptImage?: string;
    notes?: string;
  }) {
    const { invoiceId, userId, amount, bankName, accountNumber, accountName, paymentDate, receiptImage, notes } = body;

    if (!invoiceId || !userId || !amount || !bankName || !accountName || !paymentDate || !receiptImage) {
      throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
    }

    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new HttpException('Invoice not found', HttpStatus.NOT_FOUND);
    if (invoice.status === 'PAID') throw new HttpException('Invoice already paid', HttpStatus.BAD_REQUEST);

    const existing = await this.prisma.manualPayment.findFirst({ where: { invoiceId, status: 'PENDING' } });
    if (existing) {
      throw new HttpException('You already have a pending manual payment for this invoice', HttpStatus.BAD_REQUEST);
    }

    const manualPayment = await this.prisma.manualPayment.create({
      data: {
        userId, invoiceId, amount,
        bankName, accountNumber: accountNumber || null, accountName,
        paymentDate: new Date(paymentDate), receiptImage, notes,
        status: 'PENDING',
      },
      include: {
        user: { select: { name: true, username: true } },
        invoice: { select: { invoiceNumber: true, amount: true } },
      },
    });

    await this.prisma.notification.create({
      data: {
        type: 'manual_payment_submitted',
        title: 'Pembayaran Manual Baru',
        message: `${manualPayment.user.name} (${manualPayment.user.username}) mengirim bukti pembayaran untuk invoice ${manualPayment.invoice.invoiceNumber}`,
        link: '/admin/manual-payments',
        createdAt: nowWIB(),
      },
    });

    // WhatsApp notification deferred to notification integration batch
    return { success: true, message: 'Manual payment submitted successfully', data: manualPayment };
  }

  /**
   * Approve or reject manual payment — ported from /api/manual-payments/[id] PATCH.
   * Atomic transaction: update manual payment + invoice + user + payment record.
   */
  async processManualPayment(id: string, body: { action: string; rejectionReason?: string }, approvedBy: string) {
    const action = typeof body.action === 'string' ? body.action.toUpperCase() : body.action;
    if (!action || (action !== 'APPROVE' && action !== 'REJECT')) {
      throw new HttpException('Invalid action', HttpStatus.BAD_REQUEST);
    }
    if (action === 'REJECT' && !body.rejectionReason) {
      throw new HttpException('Rejection reason is required', HttpStatus.BAD_REQUEST);
    }

    const manualPayment = await this.prisma.manualPayment.findUnique({
      where: { id },
      include: { invoice: true, user: { include: { profile: true, area: true } } },
    });
    if (!manualPayment) throw new HttpException('Manual payment not found', HttpStatus.NOT_FOUND);
    if (manualPayment.status !== 'PENDING') {
      throw new HttpException('Manual payment already processed', HttpStatus.BAD_REQUEST);
    }

    if (action === 'APPROVE') {
      return this.approveManualPayment(manualPayment, approvedBy);
    } else {
      return this.rejectManualPayment(manualPayment, body.rejectionReason!, approvedBy);
    }
  }

  private async approveManualPayment(manualPayment: any, approvedBy: string) {
    const user = manualPayment.user;
    const profile = user.profile;
    const currentExpiry = user.expiredAt || new Date();
    let newExpiry = new Date(currentExpiry);

    switch (profile.validityUnit) {
      case 'MONTHS': newExpiry = addMonths(newExpiry, profile.validityValue); break;
      case 'DAYS': newExpiry.setDate(newExpiry.getDate() + profile.validityValue); break;
      case 'HOURS': newExpiry.setHours(newExpiry.getHours() + profile.validityValue); break;
      case 'MINUTES': newExpiry.setMinutes(newExpiry.getMinutes() + profile.validityValue); break;
    }

    // Package change detection
    let newProfileId = user.profileId;
    let isPackageChange = false;
    if (manualPayment.invoice?.additionalFees) {
      try {
        const fees = manualPayment.invoice.additionalFees as any;
        if (fees.items && Array.isArray(fees.items)) {
          const pkgItem = fees.items.find((item: any) =>
            (item.metadata?.type === 'package_change' || item.metadata?.type === 'package_upgrade') && item.metadata?.newPackageId
          );
          if (pkgItem) {
            isPackageChange = true;
            newProfileId = pkgItem.metadata.newPackageId;
          }
        }
      } catch {}
    }

    const finalExpiry = isPackageChange ? currentExpiry : newExpiry;
    const approvedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.manualPayment.update({ where: { id: manualPayment.id }, data: { status: 'APPROVED', approvedBy, approvedAt } });
      await tx.invoice.update({ where: { id: manualPayment.invoiceId }, data: { status: 'PAID', paidAt: approvedAt } });
      await tx.pppoeUser.update({
        where: { id: manualPayment.userId },
        data: {
          expiredAt: finalExpiry, status: 'active', lastPaymentDate: approvedAt,
          ...(newProfileId !== user.profileId && { profileId: newProfileId }),
        },
      });
      await tx.payment.create({
        data: {
          id: nanoid(), invoiceId: manualPayment.invoiceId,
          amount: manualPayment.invoice.amount, method: 'manual_transfer',
          status: 'success', paidAt: approvedAt,
        },
      });
    });

    // RADIUS sync
    try {
      const activeProfile = newProfileId !== user.profileId
        ? await this.prisma.pppoeProfile.findUnique({ where: { id: newProfileId } })
        : profile;
      if (activeProfile && 'groupName' in activeProfile) {
        await this.prisma.$executeRaw`INSERT INTO radcheck (username, attribute, op, value) VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}) ON DUPLICATE KEY UPDATE value = ${user.password}`;
        await this.prisma.$executeRaw`DELETE FROM radusergroup WHERE username = ${user.username}`;
        await this.prisma.$executeRaw`INSERT INTO radusergroup (username, groupname, priority) VALUES (${user.username}, ${(activeProfile as any).groupName}, 1)`;
        await this.prisma.radcheck.deleteMany({ where: { username: user.username, attribute: 'Auth-Type' } });
        await this.prisma.radreply.deleteMany({ where: { username: user.username, attribute: 'Reply-Message' } });
      }
    } catch (radiusErr) {
      this.logger.error('[Manual Payment APPROVE] RADIUS sync error:', radiusErr);
    }

    await this.prisma.notification.create({
      data: {
        type: 'manual_payment_approved',
        title: 'Pembayaran Disetujui',
        message: `Pembayaran manual untuk ${user.name} (${manualPayment.invoice.invoiceNumber}) telah disetujui`,
        link: '/admin/manual-payments', createdAt: nowWIB(),
      },
    });

    // WhatsApp/Email/Push notifications deferred

    return {
      success: true,
      message: 'Manual payment approved successfully',
      packageChanged: newProfileId !== user.profileId,
      newProfileId: newProfileId !== user.profileId ? newProfileId : undefined,
    };
  }

  private async rejectManualPayment(manualPayment: any, rejectionReason: string, approvedBy: string) {
    await this.prisma.manualPayment.update({
      where: { id: manualPayment.id },
      data: { status: 'REJECTED', rejectionReason, approvedBy, approvedAt: new Date() },
    });

    await this.prisma.notification.create({
      data: {
        type: 'manual_payment_rejected',
        title: 'Pembayaran Ditolak',
        message: `Pembayaran manual untuk ${manualPayment.user.name} (${manualPayment.invoice.invoiceNumber}) ditolak: ${rejectionReason}`,
        link: '/admin/manual-payments', createdAt: nowWIB(),
      },
    });

    return { success: true, message: 'Manual payment rejected' };
  }

  /**
   * Delete manual payment — ported from /api/manual-payments/[id] DELETE.
   */
  async deleteManualPayment(id: string) {
    await this.prisma.manualPayment.delete({ where: { id } });
    return { success: true, message: 'Manual payment deleted successfully' };
  }
}
