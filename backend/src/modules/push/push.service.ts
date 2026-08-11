import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== VAPID ====================

  getVapidPublicKey() {
    const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) throw new HttpException('VAPID public key not configured', HttpStatus.INTERNAL_SERVER_ERROR);
    return { success: true, publicKey };
  }

  // ==================== SUBSCRIBE (CUSTOMER) ====================

  async subscribeCustomer(userId: string, subscription: any) {
    if (!subscription?.endpoint) throw new HttpException('Invalid subscription', HttpStatus.BAD_REQUEST);

    const existing = await this.prisma.pushSubscription.findUnique({ where: { endpoint: subscription.endpoint } });
    if (existing) {
      const updated = await this.prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          userId,
          p256dh: subscription.keys?.p256dh,
          auth: subscription.keys?.auth,
          expirationTime: subscription.expirationTime ? new Date(subscription.expirationTime) : null,
          isActive: true,
          lastUsedAt: new Date(),
        },
      });
      return { success: true, subscriptionId: updated.id };
    }

    const created = await this.prisma.pushSubscription.create({
      data: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys?.p256dh,
        auth: subscription.keys?.auth,
        expirationTime: subscription.expirationTime ? new Date(subscription.expirationTime) : null,
      },
    });
    return { success: true, subscriptionId: created.id };
  }

  async unsubscribeCustomer(userId: string, body: { endpoint?: string; subscription?: any }) {
    const endpoint = body.endpoint || body.subscription?.endpoint;
    if (!endpoint) throw new HttpException('Endpoint required', HttpStatus.BAD_REQUEST);

    try {
      await this.prisma.pushSubscription.delete({ where: { endpoint } });
      return { success: true, deleted: true };
    } catch {
      // Try by userId + endpoint
      const sub = await this.prisma.pushSubscription.findFirst({ where: { userId, endpoint } });
      if (sub) {
        await this.prisma.pushSubscription.delete({ where: { id: sub.id } });
        return { success: true, deleted: true };
      }
      return { success: true, deleted: false };
    }
  }

  // ==================== SUBSCRIBE (AGENT) ====================

  async subscribeAgent(agentId: string, subscription: any) {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);

    // Agent subscriptions stored in agentPushSubscription model if exists,
    // otherwise reuse pushSubscription with agent's userId mapping
    // For now, store using a synthetic userId prefix
    const syntheticUserId = `agent_${agentId}`;
    return this.subscribeCustomer(syntheticUserId, subscription);
  }

  async unsubscribeAgent(agentId: string, body: { endpoint?: string; subscription?: any }) {
    const syntheticUserId = `agent_${agentId}`;
    return this.unsubscribeCustomer(syntheticUserId, body);
  }

  // ==================== SUBSCRIBE (TECHNICIAN) ====================

  async subscribeTechnician(technicianId: string, subscription: any) {
    const syntheticUserId = `tech_${technicianId}`;
    return this.subscribeCustomer(syntheticUserId, subscription);
  }

  async unsubscribeTechnician(technicianId: string, body: { endpoint?: string; subscription?: any }) {
    const syntheticUserId = `tech_${technicianId}`;
    return this.unsubscribeCustomer(syntheticUserId, body);
  }

  // ==================== SEND / BROADCAST ====================

  async getBroadcastHistory() {
    const broadcasts = await this.prisma.pushBroadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { success: true, broadcasts };
  }

  async getStats() {
    const [totalSubs, activeSubs, totalBroadcasts] = await Promise.all([
      this.prisma.pushSubscription.count(),
      this.prisma.pushSubscription.count({ where: { isActive: true } }),
      this.prisma.pushBroadcast.count(),
    ]);
    return { success: true, stats: { totalSubs, activeSubs, totalBroadcasts } };
  }

  async sendBroadcast(body: {
    title: string; message: string; type?: string;
    recipientRole?: string; targetType?: string; targetIds?: string[];
    data?: Record<string, unknown>;
  }, sentBy?: string) {
    if (!body.title || !body.message) throw new HttpException('Title and message required', HttpStatus.BAD_REQUEST);

    // Determine target subscriptions
    let subscriptions;
    if (body.targetType === 'selected' && body.targetIds?.length) {
      subscriptions = await this.prisma.pushSubscription.findMany({
        where: { userId: { in: body.targetIds }, isActive: true },
      });
    } else {
      subscriptions = await this.prisma.pushSubscription.findMany({ where: { isActive: true } });
    }

    let sentCount = 0;
    let failedCount = 0;

    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@salfanet.com';

    if (!vapidPrivateKey || !vapidPublicKey) {
      throw new HttpException('VAPID keys not configured', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // Use web-push library if available
    let webPush: any;
    try {
      webPush = require('web-push');
      webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    } catch {
      this.logger.warn('web-push library not available, skipping actual push');
      // Record broadcast without sending
      const broadcast = await this.prisma.pushBroadcast.create({
        data: {
          title: body.title, body: body.message,
          type: body.type || 'broadcast',
          targetType: body.targetType || 'all',
          targetIds: body.targetIds ? JSON.stringify(body.targetIds) : null,
          sentCount: 0, failedCount: subscriptions.length,
          sentBy: sentBy || 'system',
          data: body.data ? JSON.stringify(body.data) : null,
        },
      });
      return { success: false, message: 'web-push library not installed', broadcast, stats: { sent: 0, failed: subscriptions.length } };
    }

    const payload = JSON.stringify({
      title: body.title,
      body: body.message,
      data: body.data || {},
      tag: body.type || 'broadcast',
    });

    for (const sub of subscriptions) {
      try {
        await webPush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        }, payload);
        sentCount++;
      } catch (err: any) {
        failedCount++;
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired, deactivate
          await this.prisma.pushSubscription.update({ where: { id: sub.id }, data: { isActive: false } });
        }
      }
    }

    const broadcast = await this.prisma.pushBroadcast.create({
      data: {
        title: body.title, body: body.message,
        type: body.type || 'broadcast',
        targetType: body.targetType || 'all',
        targetIds: body.targetIds ? JSON.stringify(body.targetIds) : null,
        sentCount, failedCount,
        sentBy: sentBy || 'system',
        data: body.data ? JSON.stringify(body.data) : null,
      },
    });

    return { success: true, message: 'Broadcast sent', broadcast, stats: { sent: sentCount, failed: failedCount } };
  }

  // ==================== SEND TO SPECIFIC USER ====================

  async sendToUser(userId: string, notification: { title: string; body: string; data?: Record<string, unknown> }) {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId, isActive: true },
    });

    if (subscriptions.length === 0) return { success: false, message: 'No active subscriptions for user' };

    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@salfanet.com';

    if (!vapidPrivateKey || !vapidPublicKey) {
      throw new HttpException('VAPID keys not configured', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    let webPush: any;
    try {
      webPush = require('web-push');
      webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    } catch {
      this.logger.warn('web-push library not available');
      return { success: false, message: 'web-push library not installed' };
    }

    const payload = JSON.stringify(notification);
    let sent = 0;
    for (const sub of subscriptions) {
      try {
        await webPush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        }, payload);
        sent++;
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await this.prisma.pushSubscription.update({ where: { id: sub.id }, data: { isActive: false } });
        }
      }
    }

    return { success: true, sent };
  }

  // ==================== SEND TO ALL TECHNICIANS ====================

  async sendToAllTechnicians(notification: { title: string; body: string; url?: string; tag?: string }) {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: { startsWith: 'tech_' }, isActive: true },
    });
    return this.sendToSubscriptions(subscriptions, notification);
  }

  private async sendToSubscriptions(subscriptions: any[], notification: { title: string; body: string; data?: Record<string, unknown> }) {
    if (subscriptions.length === 0) return { success: false, sent: 0 };

    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@salfanet.com';

    if (!vapidPrivateKey || !vapidPublicKey) return { success: false, sent: 0 };

    let webPush: any;
    try {
      webPush = require('web-push');
      webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    } catch {
      return { success: false, sent: 0 };
    }

    const payload = JSON.stringify(notification);
    let sent = 0;
    for (const sub of subscriptions) {
      try {
        await webPush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        }, payload);
        sent++;
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await this.prisma.pushSubscription.update({ where: { id: sub.id }, data: { isActive: false } });
        }
      }
    }
    return { success: true, sent };
  }
}
