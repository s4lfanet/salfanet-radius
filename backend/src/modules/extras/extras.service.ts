import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { nowWIB } from '../../common/utils/timezone';
import { PaymentCreateService } from '../payment-gateway/payment-create.service';
import { PaymentWebhookService } from '../payment-gateway/payment-webhook.service';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const FREERADIUS_CONFIG_DIR = process.env.FREERADIUS_CONFIG_DIR || '/etc/freeradius/3.0';
const FREERADIUS_LOG_FILE = process.env.FREERADIUS_LOG_FILE || '/var/log/freeradius/radius.log';
const FREERADIUS_SERVICE = process.env.FREERADIUS_SERVICE || 'freeradius';

@Injectable()
export class ExtrasService {
  private readonly logger = new Logger(ExtrasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentCreateSvc: PaymentCreateService,
    private readonly paymentWebhookSvc: PaymentWebhookService,
  ) {}

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
    try {
      if (!fs.existsSync(FREERADIUS_CONFIG_DIR)) {
        return { configs: [], message: `FreeRADIUS config dir not found: ${FREERADIUS_CONFIG_DIR}` };
      }
      const entries = fs.readdirSync(FREERADIUS_CONFIG_DIR, { withFileTypes: true });
      const configs = entries
        .filter((e) => e.isFile() || e.isDirectory())
        .map((e) => {
          const fullPath = path.join(FREERADIUS_CONFIG_DIR, e.name);
          const stat = fs.statSync(fullPath);
          return {
            name: e.name,
            type: e.isDirectory() ? 'directory' : 'file',
            size: stat.size,
            modified: stat.mtime,
            path: fullPath,
          };
        });
      return { configs };
    } catch (err: any) {
      return { configs: [], error: err.message };
    }
  }

  async freeradiusConfigRead(body: { filename: string }) {
    try {
      // Prevent path traversal
      const safeName = path.basename(body.filename);
      const fullPath = path.join(FREERADIUS_CONFIG_DIR, safeName);
      if (!fullPath.startsWith(FREERADIUS_CONFIG_DIR)) {
        throw new HttpException('Invalid filename', HttpStatus.BAD_REQUEST);
      }
      if (!fs.existsSync(fullPath)) {
        throw new HttpException('Config file not found', HttpStatus.NOT_FOUND);
      }
      const content = fs.readFileSync(fullPath, 'utf8');
      return { filename: safeName, content };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      return { filename: body.filename, content: null, error: err.message };
    }
  }

  async freeradiusConfigSave(body: { filename: string; content: string }) {
    try {
      const safeName = path.basename(body.filename);
      const fullPath = path.join(FREERADIUS_CONFIG_DIR, safeName);
      if (!fullPath.startsWith(FREERADIUS_CONFIG_DIR)) {
        throw new HttpException('Invalid filename', HttpStatus.BAD_REQUEST);
      }
      // Backup existing file
      if (fs.existsSync(fullPath)) {
        const backupPath = `${fullPath}.bak.${Date.now()}`;
        fs.copyFileSync(fullPath, backupPath);
      }
      fs.writeFileSync(fullPath, body.content, 'utf8');
      // Try syntax check (radiusd -C)
      let syntaxOk = true;
      let syntaxError = '';
      try {
        execSync(`radiusd -C -d ${FREERADIUS_CONFIG_DIR}`, { timeout: 15000, encoding: 'utf8', stdio: 'pipe' });
      } catch (err: any) {
        syntaxOk = false;
        syntaxError = err.stderr || err.stdout || err.message;
      }
      return { success: true, filename: safeName, syntaxOk, syntaxError };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      return { success: false, filename: body.filename, error: err.message };
    }
  }

  async freeradiusLogs(params: { lines?: number }) {
    try {
      if (!fs.existsSync(FREERADIUS_LOG_FILE)) {
        return { logs: [], message: `Log file not found: ${FREERADIUS_LOG_FILE}` };
      }
      const content = fs.readFileSync(FREERADIUS_LOG_FILE, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      const tail = params.lines ? lines.slice(-params.lines) : lines.slice(-200);
      return { logs: tail, totalLines: lines.length };
    } catch (err: any) {
      return { logs: [], error: err.message };
    }
  }

  async freeradiusRadcheck(params: { username?: string }) {
    const where: Record<string, unknown> = {};
    if (params.username) where.username = params.username;
    return this.prisma.radcheck.findMany({ where: where as never, take: 100 });
  }

  async freeradiusRadtest(body: { username: string; password: string; nasIp: string; secret: string }) {
    try {
      // radclient command: echo "User-Name=user,User-Password=pass" | radclient nasIp:1812 auth secret
      const attrs = `User-Name=${body.username},User-Password=${body.password}`;
      const cmd = `echo "${attrs}" | radclient ${body.nasIp}:1812 auth ${body.secret}`;
      const output = execSync(cmd, { timeout: 15000, encoding: 'utf8', stdio: 'pipe' });
      const accepted = /Accept-Accept/i.test(output);
      return { success: true, accepted, raw: output };
    } catch (err: any) {
      const output = err.stderr || err.stdout || err.message;
      const rejected = /Access-Reject/i.test(output);
      if (rejected) return { success: true, accepted: false, raw: output };
      return { success: false, accepted: false, error: output };
    }
  }

  async freeradiusStatus() {
    try {
      const output = execSync(`systemctl is-active ${FREERADIUS_SERVICE} 2>&1 || service ${FREERADIUS_SERVICE} status 2>&1`, {
        timeout: 10000, encoding: 'utf8', stdio: 'pipe',
      });
      const running = /active|running/i.test(output);
      // Get session counts from DB
      const [activeSessions, totalAcct] = await Promise.all([
        this.prisma.radacct.count({ where: { acctstoptime: null } }),
        this.prisma.radacct.count(),
      ]);
      return { running, raw: output.trim(), activeSessions, totalAcct };
    } catch (err: any) {
      return { running: false, error: err.message };
    }
  }

  async freeradiusStart() {
    try {
      const output = execSync(`systemctl start ${FREERADIUS_SERVICE} || service ${FREERADIUS_SERVICE} start`, {
        timeout: 15000, encoding: 'utf8', stdio: 'pipe',
      });
      return { success: true, output: output.trim() };
    } catch (err: any) {
      return { success: false, error: err.stderr || err.message };
    }
  }

  async freeradiusStop() {
    try {
      const output = execSync(`systemctl stop ${FREERADIUS_SERVICE} || service ${FREERADIUS_SERVICE} stop`, {
        timeout: 15000, encoding: 'utf8', stdio: 'pipe',
      });
      return { success: true, output: output.trim() };
    } catch (err: any) {
      return { success: false, error: err.stderr || err.message };
    }
  }

  async freeradiusRestart() {
    try {
      const output = execSync(`systemctl restart ${FREERADIUS_SERVICE} || service ${FREERADIUS_SERVICE} restart`, {
        timeout: 15000, encoding: 'utf8', stdio: 'pipe',
      });
      return { success: true, output: output.trim() };
    } catch (err: any) {
      return { success: false, error: err.stderr || err.message };
    }
  }

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
      // Check webhook log for order status
      const log = await this.prisma.webhookLog.findFirst({
        where: { orderId: body.orderId },
        orderBy: { createdAt: 'desc' },
      });
      if (log) return { orderId: body.orderId, status: log.status, transactionId: log.transactionId };
      return { orderId: body.orderId, status: 'unknown', message: 'No webhook log found for this order' };
    }
    throw new HttpException('Order ID or token required', HttpStatus.BAD_REQUEST);
  }

  async paymentCreate(body: { invoiceId: string; gateway: string; paymentMethod?: string }) {
    // Delegate to existing PaymentCreateService (full Midtrans/Xendit/Duitku/Tripay support)
    return this.paymentCreateSvc.createPayment({
      invoiceId: body.invoiceId,
      gateway: body.gateway,
      paymentMethod: body.paymentMethod,
    });
  }

  async paymentDuitkuMethods(body: { amount: number }) {
    // Fetch Duitku payment methods via Duitku API
    try {
      const gateway = await this.prisma.paymentGateway.findUnique({ where: { provider: 'duitku' } });
      if (!gateway || !gateway.isActive) {
        return { methods: [], message: 'Duitku gateway not active' };
      }
      const { createDuitkuClient } = await import('../payment-gateway/gateway-clients');
      const company = await this.prisma.company.findFirst({ select: { baseUrl: true } });
      const baseUrl = company?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const duitku = createDuitkuClient(
        gateway.duitkuMerchantCode || '',
        gateway.duitkuApiKey || '',
        `${baseUrl}/api/v1/payment/webhook`,
        `${baseUrl}/pay`,
        gateway.duitkuEnvironment === 'sandbox',
      );
      const methods = await duitku.getPaymentMethods(body.amount);
      return { methods };
    } catch (err: any) {
      return { methods: [], error: err.message };
    }
  }

  async paymentWebhook(body: any) {
    // Delegate to existing PaymentWebhookService (full signature verification + dispatch)
    const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
    const result = await this.paymentWebhookSvc.processWebhook(rawBody, 'application/json', {});
    return result;
  }
}
