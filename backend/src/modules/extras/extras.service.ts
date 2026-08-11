import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { nowWIB } from '../../common/utils/timezone';
import * as crypto from 'crypto';

@Injectable()
export class ExtrasService {
  private readonly logger = new Logger(ExtrasService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== PPPOE EXTRAS ====================

  async pppoeUsersBulk(body: { action: string; userIds: string[]; data?: Record<string, unknown> }) {
    if (body.action === 'delete') {
      const result = await this.prisma.pppoeUser.deleteMany({ where: { id: { in: body.userIds } } });
      return { success: true, deleted: result.count };
    }
    if (body.action === 'update' && body.data) {
      const result = await this.prisma.pppoeUser.updateMany({ where: { id: { in: body.userIds } }, data: body.data as never });
      return { success: true, updated: result.count };
    }
    throw new HttpException('Invalid action', HttpStatus.BAD_REQUEST);
  }

  async pppoeUsersBulkStatus(body: { userIds: string[]; status: string }) {
    const result = await this.prisma.pppoeUser.updateMany({
      where: { id: { in: body.userIds } },
      data: { status: body.status as never },
    });
    return { success: true, updated: result.count };
  }

  async pppoeUsersExport(params: { status?: string; areaId?: string; profileId?: string }) {
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    if (params.areaId) where.areaId = params.areaId;
    if (params.profileId) where.profileId = params.profileId;
    const users = await this.prisma.pppoeUser.findMany({
      where: where as never,
      include: { profile: { select: { name: true } }, area: { select: { name: true } } },
      take: 5000,
    });
    return { users, count: users.length };
  }

  async pppoeUsersStatus() {
    const [total, active, isolated, expired, suspended] = await Promise.all([
      this.prisma.pppoeUser.count(),
      this.prisma.pppoeUser.count({ where: { status: 'ACTIVE' } }),
      this.prisma.pppoeUser.count({ where: { status: 'ISOLATED' } }),
      this.prisma.pppoeUser.count({ where: { status: 'EXPIRED' } }),
      this.prisma.pppoeUser.count({ where: { status: 'SUSPENDED' } }),
    ]);
    return { total, active, isolated, expired, suspended };
  }

  async pppoeUsersCheckIsolation(body: { userId?: string }) {
    if (body.userId) {
      const user = await this.prisma.pppoeUser.findUnique({ where: { id: body.userId }, select: { id: true, username: true, status: true } });
      if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      const radacct = await this.prisma.radacct.findFirst({ where: { username: user.username, acctstoptime: null } });
      return { user, hasActiveSession: !!radacct, session: radacct };
    }
    // Check all isolated users
    const isolated = await this.prisma.pppoeUser.findMany({ where: { status: 'ISOLATED' }, select: { username: true } });
    const usernames = isolated.map((u) => u.username);
    const sessions = usernames.length > 0 ? await this.prisma.radacct.findMany({ where: { username: { in: usernames }, acctstoptime: null } }) : [];
    return { isolatedCount: isolated.length, activeSessions: sessions.length, sessions };
  }

  async pppoeUsersSendNotification(body: { userIds: string[]; type: string; message: string }) {
    // Notification sending deferred to whatsapp/email integration
    return { success: true, sent: body.userIds.length, message: 'Notification sending deferred to whatsapp/email integration' };
  }

  async pppoeUsersSyncMikrotik(body: { userIds: string[] }) {
    // MikroTik sync deferred
    return { success: true, synced: body.userIds.length, message: 'MikroTik sync deferred to mikrotik integration' };
  }

  async pppoeUserActivity(userId: string) {
    const [radacct, invoices, payments] = await Promise.all([
      this.prisma.radacct.findMany({ where: { username: (await this.prisma.pppoeUser.findUnique({ where: { id: userId }, select: { username: true } }))?.username || '' }, orderBy: { acctstarttime: 'desc' }, take: 20 }),
      this.prisma.invoice.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.prisma.payment.findMany({ where: { invoice: { userId } }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);
    return { sessions: radacct, invoices, payments };
  }

  async pppoeUserExtend(userId: string, body: { days: number }) {
    const user = await this.prisma.pppoeUser.findUnique({ where: { id: userId } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    const newExpiry = new Date(user.expiredAt || nowWIB());
    newExpiry.setDate(newExpiry.getDate() + body.days);
    await this.prisma.pppoeUser.update({ where: { id: userId }, data: { expiredAt: newExpiry } });
    return { success: true, newExpiredAt: newExpiry };
  }

  async pppoeUserMarkPaid(userId: string) {
    const invoices = await this.prisma.invoice.findMany({ where: { userId, status: { in: ['PENDING', 'OVERDUE'] } } });
    let paid = 0;
    for (const inv of invoices) {
      await this.prisma.invoice.update({ where: { id: inv.id }, data: { status: 'PAID' as never, paidAt: nowWIB() } });
      paid++;
    }
    await this.prisma.pppoeUser.update({ where: { id: userId }, data: { status: 'ACTIVE' as never } });
    return { success: true, paid };
  }

  async pppoeUserSyncRadius(userId: string) {
    const user = await this.prisma.pppoeUser.findUnique({ where: { id: userId }, include: { profile: true } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    await this.prisma.radcheck.upsert({
      where: { username_attribute: { username: user.username, attribute: 'Cleartext-Password' } },
      create: { username: user.username, attribute: 'Cleartext-Password', op: ':=', value: user.password },
      update: { value: user.password },
    });

    if (user.profile) {
      await this.prisma.radusergroup.upsert({
        where: { username_groupname: { username: user.username, groupname: user.profile.name } },
        create: { username: user.username, groupname: user.profile.name, priority: 1 },
        update: {},
      });
    }

    return { success: true, username: user.username };
  }

  async pppoeProfilesSyncMikrotik() {
    return { success: true, message: 'MikroTik profile sync deferred to mikrotik integration' };
  }

  async pppoeProfilesSyncRadius() {
    const profiles = await this.prisma.pppoeProfile.findMany();
    let synced = 0;
    for (const profile of profiles) {
      const existing = await this.prisma.radgroupreply.findFirst({
        where: { groupname: profile.name, attribute: 'Mikrotik-Rate-Limit' },
      });
      const value = `${profile.downloadSpeed}/${profile.uploadSpeed}`;
      if (existing) {
        await this.prisma.radgroupreply.update({ where: { id: existing.id }, data: { value } });
      } else {
        await this.prisma.radgroupreply.create({
          data: { groupname: profile.name, attribute: 'Mikrotik-Rate-Limit', op: ':=', value },
        });
      }
      synced++;
    }
    return { success: true, synced };
  }

  // ==================== HOTSPOT EXTRAS ====================

  async hotspotAgents(params: { routerId?: string }) {
    const where: Record<string, unknown> = {};
    if (params.routerId) where.routers = { some: { id: params.routerId } };
    return this.prisma.agent.findMany({
      where,
      include: { _count: { select: { vouchers: true, sales: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async hotspotAgentBalance(agentId: string) {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId }, select: { id: true, name: true, balance: true } });
    if (!agent) throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    return agent;
  }

  async hotspotAgentHistory(agentId: string) {
    const [sales, deposits] = await Promise.all([
      this.prisma.agentSale.findMany({ where: { agentId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.agentDeposit.findMany({ where: { agentId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    return { sales, deposits };
  }

  async hotspotRekapVoucher(params: { startDate?: string; endDate?: string; agentId?: string }) {
    const where: Record<string, unknown> = {};
    if (params.agentId) where.agentId = params.agentId;
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) (where.createdAt as any).gte = new Date(params.startDate);
      if (params.endDate) (where.createdAt as any).lt = new Date(params.endDate);
    }
    const vouchers = await this.prisma.hotspotVoucher.findMany({
      where: where as never,
      include: { profile: { select: { name: true, sellingPrice: true } }, agent: { select: { name: true } } },
      take: 5000,
    });
    const summary = {
      total: vouchers.length,
      active: vouchers.filter((v) => v.status === 'ACTIVE').length,
      expired: vouchers.filter((v) => v.status === 'EXPIRED').length,
      sold: vouchers.filter((v) => v.status === 'SOLD').length,
      totalRevenue: vouchers.filter((v) => v.status === 'SOLD' || v.status === 'ACTIVE').reduce((s, v) => s + (v.profile?.sellingPrice || 0), 0),
    };
    return { vouchers, summary };
  }

  async hotspotRekapVoucherExport(params: { startDate?: string; endDate?: string; agentId?: string }) {
    const data = await this.hotspotRekapVoucher(params);
    return data;
  }

  async hotspotVoucherResync(body: { voucherIds: string[] }) {
    // RADIUS resync deferred
    return { success: true, synced: body.voucherIds.length, message: 'RADIUS resync deferred' };
  }

  async hotspotVoucherSendWhatsapp(body: { voucherIds: string[] }) {
    // WhatsApp sending deferred
    return { success: true, sent: body.voucherIds.length, message: 'WhatsApp sending deferred to whatsapp integration' };
  }

  async hotspotVoucherBulk(body: { action: string; voucherIds: string[]; data?: Record<string, unknown> }) {
    if (body.action === 'delete') {
      const result = await this.prisma.hotspotVoucher.deleteMany({ where: { id: { in: body.voucherIds } } });
      return { success: true, deleted: result.count };
    }
    if (body.action === 'update' && body.data) {
      const result = await this.prisma.hotspotVoucher.updateMany({ where: { id: { in: body.voucherIds } }, data: body.data as never });
      return { success: true, updated: result.count };
    }
    throw new HttpException('Invalid action', HttpStatus.BAD_REQUEST);
  }

  async hotspotVoucherBulkDelete(body: { voucherIds: string[] }) {
    const result = await this.prisma.hotspotVoucher.deleteMany({ where: { id: { in: body.voucherIds } } });
    return { success: true, deleted: result.count };
  }

  async hotspotVoucherDeleteMultiple(body: { ids: string[] }) {
    return this.hotspotVoucherBulkDelete({ voucherIds: body.ids });
  }

  async hotspotVoucherDeleteExpired() {
    const result = await this.prisma.hotspotVoucher.deleteMany({ where: { status: 'EXPIRED', expiresAt: { lt: nowWIB() } } });
    return { success: true, deleted: result.count };
  }

  async hotspotVoucherExport(params: { status?: string; profileId?: string }) {
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    if (params.profileId) where.profileId = params.profileId;
    const vouchers = await this.prisma.hotspotVoucher.findMany({
      where: where as never,
      include: { profile: { select: { name: true } } },
      take: 5000,
    });
    return { vouchers, count: vouchers.length };
  }

  async hotspotVouchersValidate(body: { code: string }) {
    const voucher = await this.prisma.hotspotVoucher.findUnique({
      where: { code: body.code },
      include: { profile: { select: { name: true, validityValue: true, validityUnit: true } } },
    });
    if (!voucher) return { valid: false, message: 'Voucher not found' };
    return {
      valid: voucher.status === 'ACTIVE',
      status: voucher.status,
      profile: voucher.profile,
      expiresAt: voucher.expiresAt,
    };
  }

  // ==================== INVOICES EXTRAS ====================

  async invoicesGenerate(body: { userIds?: string[]; month?: number; year?: number }) {
    const now = nowWIB();
    const year = body.year || now.getFullYear();
    const month = body.month || now.getMonth() + 1;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const where: Record<string, unknown> = { status: 'ACTIVE', autoRenewal: true };
    if (body.userIds) where.id = { in: body.userIds };
    const users = await this.prisma.pppoeUser.findMany({
      where: where as never,
      include: { profile: true },
    });

    let generated = 0;
    const errors: string[] = [];
    for (const user of users) {
      if (!user.profile) continue;
      const existing = await this.prisma.invoice.findFirst({
        where: { userId: user.id, invoiceType: 'MONTHLY', createdAt: { gte: startDate, lt: endDate } },
      });
      if (existing) continue;

      const count = await this.prisma.invoice.count({ where: { invoiceNumber: { startsWith: `INV-${year}${String(month).padStart(2, '0')}-` } } });
      const invoiceNumber = `INV-${year}${String(month).padStart(2, '0')}-${String(count + 1).padStart(4, '0')}`;

      try {
        await this.prisma.invoice.create({
          data: {
            id: `inv_${Date.now()}_${generated}_${Math.random().toString(36).slice(2, 6)}`,
            userId: user.id, invoiceNumber, amount: user.profile.price,
            status: 'PENDING', dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            invoiceType: 'MONTHLY' as never,
          },
        });
        generated++;
      } catch (err: any) {
        errors.push(`${user.username}: ${err.message}`);
      }
    }

    return { generated, total: users.length, errors: errors.slice(0, 20) };
  }

  async invoicesByToken(token: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { paymentToken: token },
      include: { user: { select: { username: true, name: true, phone: true } } },
    });
    if (!invoice) throw new HttpException('Invoice not found', HttpStatus.NOT_FOUND);
    return invoice;
  }

  async invoicesCheck(body: { invoiceNumbers: string[] }) {
    const invoices = await this.prisma.invoice.findMany({
      where: { invoiceNumber: { in: body.invoiceNumbers } },
      select: { invoiceNumber: true, status: true, amount: true },
    });
    return { invoices };
  }

  async invoicesExport(params: { status?: string; startDate?: string; endDate?: string }) {
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) (where.createdAt as any).gte = new Date(params.startDate);
      if (params.endDate) (where.createdAt as any).lt = new Date(params.endDate);
    }
    const invoices = await this.prisma.invoice.findMany({
      where: where as never,
      include: { user: { select: { username: true, name: true } } },
      take: 5000,
    });
    return { invoices, count: invoices.length };
  }

  async invoicesSendReminder(body: { invoiceId: string }) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: body.invoiceId } });
    if (!invoice) throw new HttpException('Invoice not found', HttpStatus.NOT_FOUND);
    // WhatsApp/email reminder deferred
    return { success: true, message: 'Reminder sending deferred to whatsapp/email integration' };
  }

  async invoicesSendRemindersBulk(body: { invoiceIds: string[] }) {
    // Bulk reminder deferred
    return { success: true, sent: body.invoiceIds.length, message: 'Bulk reminders deferred to whatsapp/email integration' };
  }

  async invoicesPdf(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { user: { select: { username: true, name: true, phone: true, address: true } } },
    });
    if (!invoice) throw new HttpException('Invoice not found', HttpStatus.NOT_FOUND);
    // PDF generation deferred
    return { invoice, message: 'PDF generation deferred to PDF library integration' };
  }

  // ==================== FREERADIUS EXTRAS ====================

  async freeradiusConfigList() {
    // Config list deferred — would read from filesystem
    return { configs: [], message: 'FreeRADIUS config list deferred to filesystem integration' };
  }

  async freeradiusConfigRead(body: { filename: string }) {
    return { filename: body.filename, content: null, message: 'Config read deferred to filesystem integration' };
  }

  async freeradiusConfigSave(body: { filename: string; content: string }) {
    return { success: true, filename: body.filename, message: 'Config save deferred to filesystem integration' };
  }

  async freeradiusLogs(params: { lines?: number }) {
    return { logs: [], message: 'FreeRADIUS logs deferred to filesystem integration' };
  }

  async freeradiusRadcheck(params: { username?: string }) {
    const where: Record<string, unknown> = {};
    if (params.username) where.username = params.username;
    return this.prisma.radcheck.findMany({ where: where as never, take: 100 });
  }

  async freeradiusRadtest(body: { username: string; password: string; nasIp: string; secret: string }) {
    // RADIUS test deferred — requires radclient
    return { success: true, message: 'RADIUS test deferred to radclient integration', ...body };
  }

  async freeradiusStatus() {
    return { running: true, message: 'FreeRADIUS status deferred to system integration' };
  }

  async freeradiusStart() { return { success: true, message: 'FreeRADIUS start deferred to system integration' }; }
  async freeradiusStop() { return { success: true, message: 'FreeRADIUS stop deferred to system integration' }; }
  async freeradiusRestart() { return { success: true, message: 'FreeRADIUS restart deferred to system integration' }; }

  // ==================== TICKETS EXTRAS ====================

  async ticketsDispatch() {
    const openTickets = await this.prisma.ticket.findMany({
      where: { status: 'OPEN' },
      include: { category: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const technicians = await this.prisma.technician.findMany({ where: { isActive: true }, select: { id: true, name: true } });
    return { openTickets, technicians };
  }

  async ticketsDispatchData() {
    const [byCategory, byPriority, byStatus] = await Promise.all([
      this.prisma.ticket.groupBy({ by: ['categoryId'], _count: true }),
      this.prisma.ticket.groupBy({ by: ['priority'], _count: true }),
      this.prisma.ticket.groupBy({ by: ['status'], _count: true }),
    ]);
    return { byCategory, byPriority, byStatus };
  }

  async ticketsStats() {
    const [open, inProgress, resolved, closed, total] = await Promise.all([
      this.prisma.ticket.count({ where: { status: 'OPEN' } }),
      this.prisma.ticket.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.ticket.count({ where: { status: 'RESOLVED' } }),
      this.prisma.ticket.count({ where: { status: 'CLOSED' } }),
      this.prisma.ticket.count(),
    ]);
    return { open, inProgress, resolved, closed, total };
  }

  // ==================== CUSTOMER EXTRAS ====================

  async customerBypassLogin(body: { phone: string }) {
    const user = await this.prisma.pppoeUser.findFirst({ where: { phone: body.phone }, select: { id: true, username: true, name: true, phone: true } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.prisma.customerSession.create({
      data: { id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, userId: user.id, phone: user.phone, token, expiresAt, verified: true },
    });
    return { token, user: { id: user.id, username: user.username, name: user.name } };
  }

  async customerMobileLogin(body: { phone: string; password?: string }) {
    const user = await this.prisma.pppoeUser.findFirst({ where: { phone: body.phone } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.prisma.customerSession.create({
      data: { id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, userId: user.id, phone: user.phone, token, expiresAt, verified: true },
    });
    return { token, user: { id: user.id, username: user.username, name: user.name, phone: user.phone } };
  }

  async customerRegeneratePayment(userId: string, body: { invoiceId: string }) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: body.invoiceId, userId } });
    if (!invoice) throw new HttpException('Invoice not found', HttpStatus.NOT_FOUND);
    if (invoice.status === 'PAID') throw new HttpException('Invoice already paid', HttpStatus.BAD_REQUEST);
    // Payment link regeneration deferred
    return { invoice, paymentLink: null, message: 'Payment link regeneration deferred to payment-gateway integration' };
  }

  async customerManualPayment(userId: string, body: { invoiceId: string; amount: number; bankName?: string; senderAccount?: string; receiptImage?: string }) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: body.invoiceId, userId } });
    if (!invoice) throw new HttpException('Invoice not found', HttpStatus.NOT_FOUND);
    const mp = await this.prisma.manualPayment.create({
      data: {
        id: `mp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        userId, invoiceId: invoice.id, amount: body.amount,
        paymentDate: nowWIB(),
        bankName: body.bankName || 'UNKNOWN',
        accountNumber: body.senderAccount || '',
        accountName: 'Customer',
        receiptImage: body.receiptImage || null,
        status: 'PENDING',
      },
    });
    return { success: true, manualPayment: mp };
  }

  async customerOntReboot(userId: string) {
    // GenieACS reboot deferred
    return { success: true, message: 'ONT reboot deferred to GenieACS integration' };
  }

  async customerPaymentHistory(userId: string) {
    const [payments, manualPayments] = await Promise.all([
      this.prisma.payment.findMany({ where: { invoice: { userId } }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.manualPayment.findMany({ where: { invoice: { userId } }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    return { payments, manualPayments };
  }

  async customerPaymentMethods() {
    const gateways = await this.prisma.paymentGateway.findMany({ where: { isActive: true } });
    return { methods: gateways.map((g) => ({ id: g.id, name: g.name, provider: g.provider })) };
  }

  async customerPaymentProof(userId: string, body: { paymentId: string; receiptImage: string }) {
    const mp = await this.prisma.manualPayment.findFirst({ where: { id: body.paymentId, invoice: { userId } } });
    if (!mp) throw new HttpException('Payment not found', HttpStatus.NOT_FOUND);
    await this.prisma.manualPayment.update({ where: { id: mp.id }, data: { receiptImage: body.receiptImage } });
    return { success: true };
  }

  async customerTopupRequest(userId: string, body: { amount: number; note?: string }) {
    if (!body.amount || body.amount < 10000) throw new HttpException('Minimum topup is 10000', HttpStatus.BAD_REQUEST);
    const now = nowWIB();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const count = await this.prisma.invoice.count({ where: { invoiceNumber: { startsWith: `TOP-${year}${month}-` } } });
    const invoiceNumber = `TOP-${year}${month}-${String(count + 1).padStart(4, '0')}`;
    const invoice = await this.prisma.invoice.create({
      data: {
        id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        userId, invoiceNumber, amount: body.amount,
        status: 'PENDING', dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        invoiceType: 'TOPUP' as never, notes: body.note,
      },
    });
    return { success: true, invoice };
  }

  async customerUpgradePackage(userId: string, body: { newProfileId: string }) {
    // Same as upgrade but different route name
    const user = await this.prisma.pppoeUser.findUnique({ where: { id: userId }, include: { profile: true } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    const newProfile = await this.prisma.pppoeProfile.findUnique({ where: { id: body.newProfileId } });
    if (!newProfile) throw new HttpException('Profile not found', HttpStatus.NOT_FOUND);
    const upgradeFee = Math.max(0, newProfile.price - (user.profile?.price || 0));
    const now = nowWIB();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const count = await this.prisma.invoice.count({ where: { invoiceNumber: { startsWith: `UPG-${year}${month}-` } } });
    const invoiceNumber = `UPG-${year}${month}-${String(count + 1).padStart(4, '0')}`;
    const invoice = await this.prisma.invoice.create({
      data: {
        id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        userId, invoiceNumber, amount: upgradeFee,
        status: 'PENDING', dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        invoiceType: 'ADDON' as never, notes: `Upgrade to ${newProfile.name}`,
      },
    });
    return { success: true, invoice, newProfile: { id: newProfile.id, name: newProfile.name, price: newProfile.price } };
  }

  async customerReferralRewards(userId: string) {
    return this.prisma.referralReward.findMany({
      where: { referrerId: userId },
      include: { referred: { select: { username: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async customerNotificationRead(userId: string, notificationId: string) {
    // No-op — notifications are computed, not stored per customer
    return { success: true };
  }

  // ==================== AGENT TICKETS ====================

  async agentTickets(agentId: string) {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId }, select: { id: true, name: true } });
    if (!agent) throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    return this.prisma.ticket.findMany({
      where: { OR: [{ subject: { contains: agent.name } }, { description: { contains: agent.name } }] },
      include: { category: { select: { name: true } }, _count: { select: { messages: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async agentTicketDetail(agentId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { messages: { orderBy: { createdAt: 'asc' } }, category: true },
    });
    if (!ticket) throw new HttpException('Ticket not found', HttpStatus.NOT_FOUND);
    return ticket;
  }

  async agentTicketReply(agentId: string, ticketId: string, body: { message: string }) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new HttpException('Ticket not found', HttpStatus.NOT_FOUND);
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId }, select: { name: true } });
    const msg = await this.prisma.ticketMessage.create({
      data: {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        ticketId, message: body.message,
        senderType: 'AGENT', senderId: agentId, senderName: agent?.name || 'Agent',
      },
    });
    await this.prisma.ticket.update({ where: { id: ticketId }, data: { lastResponseAt: nowWIB(), status: 'IN_PROGRESS' as never } });
    return { success: true, message: msg };
  }

  // ==================== MISC ====================

  async pwaIcon() {
    // PWA icon serving deferred
    return { message: 'PWA icon serving deferred to static file integration' };
  }

  async sseVoucherUpdates() {
    // SSE deferred — requires long-lived connection
    return { message: 'SSE voucher updates deferred to SSE integration' };
  }

  async systemRadius() {
    return { status: 'active', message: 'System RADIUS info deferred to system integration' };
  }

  async authLogoutLog(body: { userId: string; username: string }) {
    await this.prisma.activityLog.create({
      data: {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        userId: body.userId, username: body.username,
        action: 'LOGOUT', module: 'session', status: 'success',
        description: `User ${body.username} logged out`,
      },
    });
    return { success: true };
  }

  async payByToken(token: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { paymentToken: token } });
    if (!invoice) throw new HttpException('Invalid payment token', HttpStatus.NOT_FOUND);
    // Payment page rendering deferred
    return { invoice, message: 'Payment page rendering deferred to frontend integration' };
  }

  async payManual(body: { invoiceId: string; amount: number }) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: body.invoiceId } });
    if (!invoice) throw new HttpException('Invoice not found', HttpStatus.NOT_FOUND);
    if (!invoice.userId) throw new HttpException('Invoice has no associated user', HttpStatus.BAD_REQUEST);
    const mp = await this.prisma.manualPayment.create({
      data: {
        id: `mp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        userId: invoice.userId, invoiceId: invoice.id, amount: body.amount,
        paymentDate: nowWIB(),
        bankName: 'UNKNOWN', accountNumber: '', accountName: 'Customer',
        status: 'PENDING',
      },
    });
    return { success: true, manualPayment: mp };
  }

  async paymentCheckOrder(body: { orderId?: string; token?: string }) {
    if (body.token) {
      const invoice = await this.prisma.invoice.findUnique({ where: { paymentToken: body.token } });
      if (invoice) return { status: invoice.status, invoice };
    }
    if (body.orderId) {
      // Check payment gateway order — deferred
      return { orderId: body.orderId, status: 'unknown', message: 'Order check deferred to payment-gateway integration' };
    }
    throw new HttpException('Order ID or token required', HttpStatus.BAD_REQUEST);
  }

  async paymentCreate(body: { invoiceId: string; gateway: string; paymentMethod?: string }) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: body.invoiceId } });
    if (!invoice) throw new HttpException('Invoice not found', HttpStatus.NOT_FOUND);
    // Payment creation deferred to payment-gateway integration
    return { invoice, paymentUrl: null, message: 'Payment creation deferred to payment-gateway integration' };
  }

  async paymentDuitkuMethods(body: { amount: number }) {
    // Duitku methods deferred
    return { methods: [], message: 'Duitku methods deferred to payment-gateway integration' };
  }

  async paymentWebhook(body: any) {
    // Payment webhook deferred to payment-gateway integration
    this.logger.log(`Payment webhook received: ${JSON.stringify(body).slice(0, 200)}`);
    return { success: true, message: 'Payment webhook deferred to payment-gateway integration' };
  }
}
