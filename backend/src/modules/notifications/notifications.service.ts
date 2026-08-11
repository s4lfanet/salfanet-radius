import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { nowWIB } from '../../common/utils/timezone';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a notification
   */
  async create(data: { type: string; title: string; message: string; link?: string }) {
    try {
      return await this.prisma.notification.create({
        data: {
          id: Math.random().toString(36).substring(2, 15),
          ...data,
          createdAt: nowWIB(),
        },
      });
    } catch (error) {
      this.logger.error('Create notification error:', error);
      return null;
    }
  }

  /**
   * Get notifications with filters — ported from /api/notifications GET
   */
  async getNotifications(params: {
    unreadOnly?: boolean; type?: string; limit?: number; since?: string;
  }) {
    const where: Record<string, unknown> = {};
    if (params.unreadOnly) where.isRead = false;
    if (params.type) where.type = params.type;
    if (params.since) where.createdAt = { gte: new Date(params.since) };

    const limit = params.limit || 10;

    const [notifications, unreadCount, allNotifications] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.notification.count({ where: { isRead: false } }),
      this.prisma.notification.groupBy({ by: ['type'], _count: { id: true } }),
    ]);

    const categoryCounts: Record<string, number> = {};
    for (const item of allNotifications) {
      categoryCounts[item.type] = item._count.id;
    }

    return { success: true, notifications, unreadCount, categoryCounts };
  }

  /**
   * Mark notifications as read — ported from /api/notifications PUT
   */
  async markAsRead(body: { notificationIds?: string[]; markAll?: boolean }) {
    if (body.markAll) {
      await this.prisma.notification.updateMany({
        where: { isRead: false },
        data: { isRead: true },
      });
    } else if (body.notificationIds && Array.isArray(body.notificationIds)) {
      await this.prisma.notification.updateMany({
        where: { id: { in: body.notificationIds } },
        data: { isRead: true },
      });
    } else {
      throw new HttpException('Invalid request: supply notificationIds[] or markAll', HttpStatus.BAD_REQUEST);
    }
    return { message: 'Notifications marked as read' };
  }

  /**
   * Delete notification(s) — ported from /api/notifications DELETE
   */
  async deleteNotifications(params: { id?: string; ids?: string }) {
    if (params.ids) {
      const idArray = params.ids.split(',').filter(Boolean);
      if (idArray.length === 0) throw new HttpException('No IDs provided', HttpStatus.BAD_REQUEST);
      await this.prisma.notification.deleteMany({ where: { id: { in: idArray } } });
      return { message: `${idArray.length} notifications deleted`, count: idArray.length };
    }

    if (!params.id) throw new HttpException('Notification ID required', HttpStatus.BAD_REQUEST);
    await this.prisma.notification.delete({ where: { id: params.id } });
    return { message: 'Notification deleted' };
  }

  /**
   * Generate notifications — ported from /api/notifications/generate POST
   */
  async generateNotifications(type: string = 'all'): Promise<{ count: number }> {
    let count = 0;

    if (type === 'overdue_invoices' || type === 'all') {
      count += await this.checkOverdueInvoices();
    }
    if (type === 'expired_users' || type === 'all') {
      count += await this.checkExpiredUsers();
    }
    if (type === 'pending_registrations' || type === 'all') {
      count += await this.checkPendingRegistrations();
    }
    if (type === 'test') {
      await this.create({
        type: 'system_alert',
        title: 'Test Notification',
        message: 'This is a test notification to verify the system is working',
        link: '/admin',
      });
      count = 1;
    }

    return { count };
  }

  async checkOverdueInvoices(): Promise<number> {
    try {
      const overdueInvoices = await this.prisma.invoice.findMany({
        where: { status: 'PENDING', dueDate: { lt: new Date() } },
        select: { id: true, invoiceNumber: true, customerName: true, customerUsername: true, dueDate: true },
      });

      for (const invoice of overdueInvoices) {
        const existing = await this.prisma.notification.findFirst({
          where: {
            type: 'invoice_overdue',
            link: `/admin/invoices?id=${invoice.id}`,
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        });
        if (!existing) {
          await this.create({
            type: 'invoice_overdue',
            title: 'Invoice Overdue',
            message: `Invoice ${invoice.invoiceNumber} for ${invoice.customerName || invoice.customerUsername} is overdue`,
            link: `/admin/invoices?id=${invoice.id}`,
          });
        }
      }
      return overdueInvoices.length;
    } catch (error) {
      this.logger.error('Check overdue invoices error:', error);
      return 0;
    }
  }

  async checkExpiredUsers(): Promise<number> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const expiredUsers = await this.prisma.pppoeUser.findMany({
        where: { expiredAt: { gte: today, lt: tomorrow }, status: 'active' },
        select: { id: true, username: true, name: true, expiredAt: true },
      });

      for (const user of expiredUsers) {
        const existing = await this.prisma.notification.findFirst({
          where: { type: 'user_expired', link: `/admin/pppoe/users?id=${user.id}`, createdAt: { gte: today } },
        });
        if (!existing) {
          await this.create({
            type: 'user_expired',
            title: 'User Expiring Today',
            message: `User ${user.username} (${user.name}) is expiring today`,
            link: `/admin/pppoe/users?id=${user.id}`,
          });
        }
      }
      return expiredUsers.length;
    } catch (error) {
      this.logger.error('Check expired users error:', error);
      return 0;
    }
  }

  async checkPendingRegistrations(): Promise<number> {
    try {
      const pendingRegistrations = await this.prisma.registrationRequest.findMany({
        where: { status: 'PENDING' },
        select: { id: true, name: true, phone: true, createdAt: true },
      });

      let count = 0;
      for (const registration of pendingRegistrations) {
        const existing = await this.prisma.notification.findFirst({
          where: { type: 'new_registration', message: { contains: registration.phone } },
        });
        if (!existing) {
          await this.create({
            type: 'new_registration',
            title: 'New Registration Request',
            message: `${registration.name} (${registration.phone}) requested service registration`,
            link: '/admin/pppoe/registrations',
          });
          count++;
        }
      }
      return count;
    } catch (error) {
      this.logger.error('Check pending registrations error:', error);
      return 0;
    }
  }
}
