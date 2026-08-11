import 'server-only'
import { prisma } from '@/server/db/client';
import { nowWIB } from '@/lib/timezone';

export const NotificationService = {
  /**
   * Create a notification
   */
  async create(data: {
    type: string;
    title: string;
    message: string;
    link?: string;
  }) {
    try {
      return await prisma.notification.create({
        data: {
          id: Math.random().toString(36).substring(2, 15),
          ...data,
          createdAt: nowWIB(), // Explicitly set WIB time to avoid MySQL UTC default issue
        },
      });
    } catch (error) {
      console.error('Create notification error:', error);
      return null;
    }
  },

  /**
   * Check and create notifications for overdue invoices
   */
  async checkOverdueInvoices() {
    try {
      const now = new Date();
      const overdueInvoices = await prisma.invoice.findMany({
        where: {
          status: 'PENDING',
          dueDate: {
            lt: now,
          },
        },
        select: {
          id: true,
          invoiceNumber: true,
          customerName: true,
          customerUsername: true,
          dueDate: true,
        },
      });

      for (const invoice of overdueInvoices) {
        // Check if notification already exists for this invoice
        const existing = await prisma.notification.findFirst({
          where: {
            type: 'invoice_overdue',
            link: `/admin/invoices?id=${invoice.id}`,
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
          },
        });

        if (!existing) {
          await this.create({
            type: 'invoice_overdue',
            title: 'Invoice Overdue',
            message: `Invoice ${invoice.invoiceNumber} for ${
              invoice.customerName || invoice.customerUsername
            } is overdue`,
            link: `/admin/invoices?id=${invoice.id}`,
          });
        }
      }

      return overdueInvoices.length;
    } catch (error) {
      console.error('Check overdue invoices error:', error);
      return 0;
    }
  },

  /**
   * Check and create notifications for expired users
   */
  async checkExpiredUsers() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const expiredUsers = await prisma.pppoeUser.findMany({
        where: {
          expiredAt: {
            gte: today,
            lt: tomorrow,
          },
          status: 'active',
        },
        select: {
          id: true,
          username: true,
          name: true,
          expiredAt: true,
        },
      });

      for (const user of expiredUsers) {
        // Check if notification already exists
        const existing = await prisma.notification.findFirst({
          where: {
            type: 'user_expired',
            link: `/admin/pppoe/users?id=${user.id}`,
            createdAt: {
              gte: today,
            },
          },
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
      console.error('Check expired users error:', error);
      return 0;
    }
  },

  /**
   * Check and create notifications for pending registrations
   */
  async checkPendingRegistrations() {
    try {
      const pendingRegistrations = await prisma.registrationRequest.findMany({
        where: {
          status: 'PENDING',
        },
        select: {
          id: true,
          name: true,
          phone: true,
          createdAt: true,
        },
      });

      let count = 0;
      for (const registration of pendingRegistrations) {
        // Check if notification already exists for this registration
        const existing = await prisma.notification.findFirst({
          where: {
            type: 'new_registration',
            message: {
              contains: registration.phone,
            },
          },
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
      console.error('Check pending registrations error:', error);
      return 0;
    }
  },

  /**
   * Create notification for new registration request
   */
  async notifyNewRegistration(registration: any) {
    return await this.create({
      type: 'new_registration',
      title: 'New Registration Request',
      message: `${registration.name} (${registration.phone}) requested service registration`,
      link: '/admin/pppoe/registrations',
    });
  },

  /**
   * Create notification for payment received
   */
  async notifyPaymentReceived(payment: { 
    amount: number; 
    invoiceId?: string;
    customerName?: string;
    customerUsername?: string;
    gateway?: string;
  }) {
    const messagePrefix = payment.customerName || payment.customerUsername 
      ? `${payment.customerName || payment.customerUsername} - ` 
      : '';
    const gatewayInfo = payment.gateway ? ` via ${payment.gateway}` : '';
    
    return await this.create({
      type: 'payment_received',
      title: 'Payment Received',
      message: `${messagePrefix}Payment of Rp ${payment.amount.toLocaleString('id-ID')} received${gatewayInfo}`,
      link: payment.invoiceId ? `/admin/invoices?id=${payment.invoiceId}` : '/admin/invoices',
    });
  },

  /**
   * Create notification for user isolation
   */
  async notifyUserIsolated(user: { username: string; name?: string; reason?: string }) {
    return await this.create({
      type: 'user_isolated',
      title: 'User Diisolir',
      message: `User ${user.username}${user.name ? ` (${user.name})` : ''} telah diisolir${user.reason ? ` - ${user.reason}` : ' karena expired'}`,
      link: '/admin/isolated-users',
    });
  },

  /**
   * Create notification for user reactivation
   */
  async notifyUserReactivated(user: { username: string; name?: string }) {
    return await this.create({
      type: 'user_reactivated',
      title: 'User Direaktivasi',
      message: `User ${user.username}${user.name ? ` (${user.name})` : ''} telah direaktivasi`,
      link: `/admin/pppoe/users?search=${user.username}`,
    });
  },

  /**
   * Create notification for session disconnect
   */
  async notifySessionDisconnected(data: { username: string; reason?: string; count?: number }) {
    if (data.count && data.count > 1) {
      return await this.create({
        type: 'session_disconnect',
        title: 'Session Terputus',
        message: `${data.count} session telah diputus${data.reason ? ` - ${data.reason}` : ''}`,
        link: '/admin/session',
      });
    } else {
      return await this.create({
        type: 'session_disconnect',
        title: 'Session Terputus',
        message: `Session ${data.username} telah diputus${data.reason ? ` - ${data.reason}` : ''}`,
        link: '/admin/session',
      });
    }
  },

  /**
   * Create notification for suspicious activity
   */
  async notifySuspiciousActivity(data: { username: string; activity: string; ipAddress?: string }) {
    return await this.create({
      type: 'security_alert',
      title: 'Aktivitas Mencurigakan',
      message: `${data.activity} untuk user ${data.username}${data.ipAddress ? ` dari IP ${data.ipAddress}` : ''}`,
      link: '/admin/logs/activity',
    });
  },

  /**
   * Create notification for user status change
   */
  async notifyUserStatusChange(user: { username: string; name?: string; oldStatus: string; newStatus: string }) {
    return await this.create({
      type: 'user_status_change',
      title: 'Status User Berubah',
      message: `Status user ${user.username}${user.name ? ` (${user.name})` : ''} berubah dari ${user.oldStatus} ke ${user.newStatus}`,
      link: `/admin/pppoe/users?search=${user.username}`,
    });
  },

  /**
   * Create system alert notification
   */
  async notifySystemAlert(title: string, message: string, link?: string) {
    return await this.create({
      type: 'system_alert',
      title,
      message,
      link,
    });
  },

  /**
   * Create notification for bulk user isolation (from cron)
   */
  async notifyBulkUserIsolation(count: number) {
    if (count > 0) {
      return await this.create({
        type: 'bulk_isolation',
        title: 'Auto Isolasi Users',
        message: `${count} user expired telah diisolir secara otomatis`,
        link: '/admin/isolated-users',
      });
    }
    return null;
  },

  /**
   * Create notification for bulk session disconnect
   */
  async notifyBulkSessionDisconnect(count: number) {
    if (count > 0) {
      return await this.create({
        type: 'bulk_disconnect',
        title: 'Session Terputus Massal',
        message: `${count} session expired telah diputus secara otomatis`,
        link: '/admin/session',
      });
    }
    return null;
  },

  /**
   * Run notification check with DB logging (for cron job)
   */
  async runNotificationCheck() {
    const startedAt = new Date();
    const historyId = Math.random().toString(36).substring(2, 15);

    // Create history record
    const history = await prisma.cronHistory.create({
      data: {
        id: historyId,
        jobType: 'notification_check',
        status: 'running',
        startedAt,
      },
    });

    try {
      const overdue = await this.checkOverdueInvoices();
      const expired = await this.checkExpiredUsers();
      const pending = await this.checkPendingRegistrations();
      const total = overdue + expired + pending;

      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();

      await prisma.cronHistory.update({
        where: { id: historyId },
        data: {
          status: 'success',
          completedAt,
          duration,
          result: JSON.stringify({
            overdueInvoices: overdue,
            expiredUsers: expired,
            pendingRegistrations: pending,
            total,
          }),
        },
      });

      return {
        success: true,
        overdueInvoices: overdue,
        expiredUsers: expired,
        pendingRegistrations: pending,
        total,
      };
    } catch (error: any) {
      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();

      await prisma.cronHistory.update({
        where: { id: historyId },
        data: {
          status: 'error',
          completedAt,
          duration,
          error: error.message,
        },
      });

      console.error('Notification check error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  },
};
