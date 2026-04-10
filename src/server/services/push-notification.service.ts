import * as webpush from 'web-push';
import { prisma } from '@/server/db/client';

export interface WebPushSubscriptionInput {
  endpoint: string;
  expirationTime?: number | null;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  image?: string;
  requireInteraction?: boolean;
  data?: Record<string, string | number | boolean | null | undefined>;
}

export interface PushSendResult {
  sent: number;
  failed: number;
  total: number;
}

export interface PushBroadcastInput {
  title: string;
  body: string;
  type?: string;
  recipientRole?: 'customer' | 'agent' | 'technician' | 'all';
  targetType?: 'all' | 'active' | 'expired' | 'area' | 'selected';
  targetIds?: string[];
  sentBy?: string | null;
  data?: Record<string, unknown>;
}

type StoredSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime: Date | null;
};

let vapidConfigured = false;

function getVapidPublicKey() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;

  if (!publicKey) {
    throw new Error('VAPID_PUBLIC_KEY is not configured');
  }

  return publicKey;
}

function ensureVapidConfiguration() {
  if (vapidConfigured) {
    return;
  }

  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('VAPID_PRIVATE_KEY is not configured');
  }

  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_CONTACT_EMAIL || 'admin@example.com'}`,
    publicKey,
    privateKey,
  );

  vapidConfigured = true;
}

export function normalizePushUrl(rawUrl?: string | null) {
  if (!rawUrl) {
    return '/customer';
  }

  const url = rawUrl.trim();

  if (!url) {
    return '/customer';
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  if (url.startsWith('/customer')) {
    return url;
  }

  if (url.startsWith('/(tabs)/')) {
    return url.replace('/(tabs)', '/customer');
  }

  if (url === '/(tabs)') {
    return '/customer';
  }

  const mappedRoutes: Record<string, string> = {
    invoices: '/customer/invoices',
    profile: '/customer/profile',
    tickets: '/customer/tickets',
    history: '/customer/history',
    referral: '/customer/referral',
    upgrade: '/customer/upgrade',
    notifications: '/customer',
    home: '/customer',
  };

  const normalizedKey = url.replace(/^\/+/, '');

  if (mappedRoutes[normalizedKey]) {
    return mappedRoutes[normalizedKey];
  }

  if (url.startsWith('/')) {
    return url;
  }

  return `/customer/${normalizedKey}`;
}

function buildNotificationPayload(payload: PushNotificationPayload) {
  const url = normalizePushUrl(payload.url);

  return JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/pwa/icon-192.svg',
    badge: payload.badge || '/pwa/badge.svg',
    image: payload.image,
    tag: payload.tag || 'salfanet-notification',
    requireInteraction: payload.requireInteraction || false,
    data: {
      url,
      ...(payload.data || {}),
    },
  });
}

function toWebPushSubscription(subscription: StoredSubscription) {
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ? subscription.expirationTime.getTime() : null,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };
}

function isExpiredSubscriptionError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { statusCode?: number; status?: number; body?: string; message?: string };
  const status = maybeError.statusCode || maybeError.status;
  const message = `${maybeError.body || ''} ${maybeError.message || ''}`;

  return status === 404 || status === 410 || /expired|unregistered|not found|gone/i.test(message);
}

async function deactivateSubscriptions(ids: string[]) {
  if (ids.length === 0) {
    return;
  }

  await prisma.pushSubscription.updateMany({
    where: { id: { in: ids } },
    data: { isActive: false },
  });
}

async function markSubscriptionsUsed(ids: string[]) {
  if (ids.length === 0) {
    return;
  }

  await prisma.pushSubscription.updateMany({
    where: { id: { in: ids } },
    data: { lastUsedAt: new Date() },
  });
}

async function deactivateAgentSubscriptions(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.agentPushSubscription.updateMany({ where: { id: { in: ids } }, data: { isActive: false } });
}

async function markAgentSubscriptionsUsed(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.agentPushSubscription.updateMany({ where: { id: { in: ids } }, data: { lastUsedAt: new Date() } });
}

async function deactivateTechnicianSubscriptions(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.technicianPushSubscription.updateMany({ where: { id: { in: ids } }, data: { isActive: false } });
}

async function markTechnicianSubscriptionsUsed(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.technicianPushSubscription.updateMany({ where: { id: { in: ids } }, data: { lastUsedAt: new Date() } });
}

async function deactivateAdminSubscriptions(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.adminPushSubscription.updateMany({ where: { id: { in: ids } }, data: { isActive: false } });
}

async function markAdminSubscriptionsUsed(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.adminPushSubscription.updateMany({ where: { id: { in: ids } }, data: { lastUsedAt: new Date() } });
}

async function sendToStoredSubscriptions(
  subscriptions: StoredSubscription[],
  payload: PushNotificationPayload,
  role: 'customer' | 'agent' | 'technician' | 'admin' = 'customer',
) {
  ensureVapidConfiguration();

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, total: 0 };
  }

  const serializedPayload = buildNotificationPayload(payload);
  const usedIds: string[] = [];
  const expiredIds: string[] = [];
  let sent = 0;
  let failed = 0;

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(toWebPushSubscription(subscription), serializedPayload, {
        TTL: 60,
        urgency: 'high',
      });
      sent += 1;
      usedIds.push(subscription.id);
    } catch (error) {
      failed += 1;

      if (isExpiredSubscriptionError(error)) {
        expiredIds.push(subscription.id);
      } else {
        console.error('[WebPush] Failed to send notification:', error);
      }
    }
  }

  await Promise.all([
    role === 'agent'
      ? deactivateAgentSubscriptions(expiredIds)
      : role === 'technician'
        ? deactivateTechnicianSubscriptions(expiredIds)
        : role === 'admin'
          ? deactivateAdminSubscriptions(expiredIds)
          : deactivateSubscriptions(expiredIds),
    role === 'agent'
      ? markAgentSubscriptionsUsed(usedIds)
      : role === 'technician'
        ? markTechnicianSubscriptionsUsed(usedIds)
        : role === 'admin'
          ? markAdminSubscriptionsUsed(usedIds)
          : markSubscriptionsUsed(usedIds),
  ]);

  return { sent, failed, total: subscriptions.length };
}

export async function upsertWebPushSubscription(userId: string, subscription: WebPushSubscriptionInput, userAgent?: string | null) {
  const endpoint = subscription.endpoint?.trim();
  const p256dh = subscription.keys?.p256dh?.trim();
  const auth = subscription.keys?.auth?.trim();

  if (!endpoint || !p256dh || !auth) {
    throw new Error('Invalid push subscription payload');
  }

  return prisma.pushSubscription.upsert({
    where: { endpoint },
    update: {
      userId,
      p256dh,
      auth,
      userAgent: userAgent || null,
      expirationTime: subscription.expirationTime ? new Date(subscription.expirationTime) : null,
      isActive: true,
      lastUsedAt: new Date(),
    },
    create: {
      userId,
      endpoint,
      p256dh,
      auth,
      userAgent: userAgent || null,
      expirationTime: subscription.expirationTime ? new Date(subscription.expirationTime) : null,
      isActive: true,
      lastUsedAt: new Date(),
    },
  });
}

export async function removeWebPushSubscription(userId: string, endpoint?: string | null) {
  const where: { userId: string; endpoint?: string } = { userId };

  if (endpoint?.trim()) {
    where.endpoint = endpoint.trim();
  }

  const result = await prisma.pushSubscription.deleteMany({ where });
  return result.count;
}

export async function upsertAdminPushSubscription(adminId: string, subscription: WebPushSubscriptionInput, userAgent?: string | null) {
  const endpoint = subscription.endpoint?.trim();
  const p256dh = subscription.keys?.p256dh?.trim();
  const auth = subscription.keys?.auth?.trim();

  if (!endpoint || !p256dh || !auth) {
    throw new Error('Invalid push subscription payload');
  }

  return prisma.adminPushSubscription.upsert({
    where: { endpoint },
    update: {
      adminId,
      p256dh,
      auth,
      userAgent: userAgent || null,
      expirationTime: subscription.expirationTime ? new Date(subscription.expirationTime) : null,
      isActive: true,
      lastUsedAt: new Date(),
    },
    create: {
      adminId,
      endpoint,
      p256dh,
      auth,
      userAgent: userAgent || null,
      expirationTime: subscription.expirationTime ? new Date(subscription.expirationTime) : null,
      isActive: true,
      lastUsedAt: new Date(),
    },
  });
}

export async function removeAdminPushSubscription(adminId: string, endpoint?: string | null) {
  const where: { adminId: string; endpoint?: string } = { adminId };
  if (endpoint?.trim()) where.endpoint = endpoint.trim();
  const result = await prisma.adminPushSubscription.deleteMany({ where });
  return result.count;
}

export async function upsertAgentPushSubscription(agentId: string, subscription: WebPushSubscriptionInput, userAgent?: string | null) {
  const endpoint = subscription.endpoint?.trim();
  const p256dh = subscription.keys?.p256dh?.trim();
  const auth = subscription.keys?.auth?.trim();

  if (!endpoint || !p256dh || !auth) {
    throw new Error('Invalid push subscription payload');
  }

  return prisma.agentPushSubscription.upsert({
    where: { endpoint },
    update: {
      agentId,
      p256dh,
      auth,
      userAgent: userAgent || null,
      expirationTime: subscription.expirationTime ? new Date(subscription.expirationTime) : null,
      isActive: true,
      lastUsedAt: new Date(),
    },
    create: {
      agentId,
      endpoint,
      p256dh,
      auth,
      userAgent: userAgent || null,
      expirationTime: subscription.expirationTime ? new Date(subscription.expirationTime) : null,
      isActive: true,
      lastUsedAt: new Date(),
    },
  });
}

export async function removeAgentPushSubscription(agentId: string, endpoint?: string | null) {
  const where: { agentId: string; endpoint?: string } = { agentId };
  if (endpoint?.trim()) where.endpoint = endpoint.trim();
  const result = await prisma.agentPushSubscription.deleteMany({ where });
  return result.count;
}

export async function upsertTechnicianPushSubscription(technicianId: string, subscription: WebPushSubscriptionInput, userAgent?: string | null) {
  const endpoint = subscription.endpoint?.trim();
  const p256dh = subscription.keys?.p256dh?.trim();
  const auth = subscription.keys?.auth?.trim();

  if (!endpoint || !p256dh || !auth) {
    throw new Error('Invalid push subscription payload');
  }

  return prisma.technicianPushSubscription.upsert({
    where: { endpoint },
    update: {
      technicianId,
      p256dh,
      auth,
      userAgent: userAgent || null,
      expirationTime: subscription.expirationTime ? new Date(subscription.expirationTime) : null,
      isActive: true,
      lastUsedAt: new Date(),
    },
    create: {
      technicianId,
      endpoint,
      p256dh,
      auth,
      userAgent: userAgent || null,
      expirationTime: subscription.expirationTime ? new Date(subscription.expirationTime) : null,
      isActive: true,
      lastUsedAt: new Date(),
    },
  });
}

export async function removeTechnicianPushSubscription(technicianId: string, endpoint?: string | null) {
  const where: { technicianId: string; endpoint?: string } = { technicianId };
  if (endpoint?.trim()) where.endpoint = endpoint.trim();
  const result = await prisma.technicianPushSubscription.deleteMany({ where });
  return result.count;
}

export async function sendWebPushToUser(userId: string, payload: PushNotificationPayload): Promise<PushSendResult> {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      userId,
      isActive: true,
    },
    select: {
      id: true,
      endpoint: true,
      p256dh: true,
      auth: true,
      expirationTime: true,
    },
  });

  return sendToStoredSubscriptions(subscriptions, payload);
}

export async function sendWebPushToUsers(userIds: string[], payload: PushNotificationPayload): Promise<PushSendResult> {
  if (userIds.length === 0) {
    return { sent: 0, failed: 0, total: 0 };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      userId: { in: userIds },
      isActive: true,
    },
    select: {
      id: true,
      endpoint: true,
      p256dh: true,
      auth: true,
      expirationTime: true,
    },
  });

  return sendToStoredSubscriptions(subscriptions, payload);
}

export async function getPushDashboardStats() {
  const [totalUsers, areas, totalBroadcasts, totalSubscriptions, subscribedUsers, agentSubscribers, technicianSubscribers, adminSubscribers, fcmUsers] = await Promise.all([
    prisma.pppoeUser.count({
      where: { status: 'active' },
    }),
    prisma.pppoeArea.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.pushBroadcast.count(),
    prisma.pushSubscription.count({
      where: { isActive: true },
    }),
    prisma.pushSubscription.findMany({
      where: { isActive: true },
      distinct: ['userId'],
      select: { userId: true },
    }),
    prisma.agentPushSubscription.findMany({
      where: { isActive: true },
      distinct: ['agentId'],
      select: { agentId: true },
    }),
    prisma.technicianPushSubscription.findMany({
      where: { isActive: true },
      distinct: ['technicianId'],
      select: { technicianId: true },
    }),
    prisma.adminPushSubscription.findMany({
      where: { isActive: true },
      distinct: ['adminId'],
      select: { adminId: true },
    }),
    prisma.pppoeUser.count({
      where: {
        fcmTokens: { not: null },
        NOT: { fcmTokens: '' },
      },
    }),
  ]);

  return {
    totalUsers,
    usersWithTokens: subscribedUsers.length,
    totalSubscriptions,
    areas,
    totalBroadcasts,
    agentSubscribers: agentSubscribers.length,
    technicianSubscribers: technicianSubscribers.length,
    adminSubscribers: adminSubscribers.length,
    fcmUserCount: fcmUsers,
  };
}

export async function getPushBroadcastHistory(limit = 20, page = 1) {
  const take = Math.max(1, limit);
  const currentPage = Math.max(1, page);
  const skip = (currentPage - 1) * take;

  const [broadcasts, total] = await Promise.all([
    prisma.pushBroadcast.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.pushBroadcast.count(),
  ]);

  return {
    broadcasts,
    total,
    page: currentPage,
    totalPages: Math.ceil(total / take),
  };
}

async function getBroadcastTargets(targetType: PushBroadcastInput['targetType'], targetIds: string[]) {
  const where: Record<string, unknown> = {
    status: { not: 'stop' },
    pushSubscriptions: {
      some: { isActive: true },
    },
  };

  if (targetType === 'area' && targetIds.length > 0) {
    where.areaId = { in: targetIds };
  } else if (targetType === 'selected' && targetIds.length > 0) {
    where.id = { in: targetIds };
  } else if (targetType === 'active') {
    where.status = 'active';
  } else if (targetType === 'expired') {
    where.status = 'expired';
  }

  return prisma.pppoeUser.findMany({
    where,
    select: {
      id: true,
      pushSubscriptions: {
        where: { isActive: true },
        select: {
          id: true,
          endpoint: true,
          p256dh: true,
          auth: true,
          expirationTime: true,
        },
      },
    },
  });
}

async function getAgentSubscriptions() {
  const agents = await prisma.agentPushSubscription.findMany({
    where: { isActive: true },
    select: { id: true, endpoint: true, p256dh: true, auth: true, expirationTime: true },
  });
  return agents;
}

async function getTechnicianSubscriptions() {
  const technicians = await prisma.technicianPushSubscription.findMany({
    where: { isActive: true },
    select: { id: true, endpoint: true, p256dh: true, auth: true, expirationTime: true },
  });
  return technicians;
}

async function getAdminSubscriptions() {
  const admins = await prisma.adminPushSubscription.findMany({
    where: { isActive: true },
    select: { id: true, endpoint: true, p256dh: true, auth: true, expirationTime: true },
  });
  return admins;
}

export async function sendWebPushBroadcast(input: PushBroadcastInput) {
  const targetIds = input.targetIds || [];
  const recipientRole = input.recipientRole || 'customer';

  const notificationPayload = {
    title: input.title,
    body: input.body,
    url: typeof input.data?.link === 'string' ? input.data.link : undefined,
    tag: input.type || 'broadcast',
    data: {
      type: input.type || 'broadcast',
      ...(input.data || {}),
    },
  };

  let totalSent = 0;
  let totalFailed = 0;
  let totalCount = 0;

  if (recipientRole === 'agent' || recipientRole === 'all') {
    const agentSubs = await getAgentSubscriptions();
    if (agentSubs.length > 0) {
      const r = await sendToStoredSubscriptions(agentSubs, notificationPayload, 'agent');
      totalSent += r.sent;
      totalFailed += r.failed;
      totalCount += r.total;
    }
  }

  if (recipientRole === 'technician' || recipientRole === 'all') {
    const techSubs = await getTechnicianSubscriptions();
    if (techSubs.length > 0) {
      const r = await sendToStoredSubscriptions(techSubs, notificationPayload, 'technician');
      totalSent += r.sent;
      totalFailed += r.failed;
      totalCount += r.total;
    }
    // Also send to admin_users who subscribed via technician portal
    const adminSubs = await getAdminSubscriptions();
    if (adminSubs.length > 0) {
      const r = await sendToStoredSubscriptions(adminSubs, notificationPayload, 'admin');
      totalSent += r.sent;
      totalFailed += r.failed;
      totalCount += r.total;
    }
  }

  if (recipientRole === 'customer' || recipientRole === 'all') {
    const targets = await getBroadcastTargets(input.targetType || 'all', targetIds);
    const customerSubs = targets.flatMap((t) => t.pushSubscriptions);
    if (customerSubs.length > 0) {
      const r = await sendToStoredSubscriptions(customerSubs, notificationPayload, 'customer');
      totalSent += r.sent;
      totalFailed += r.failed;
      totalCount += r.total;
    }
  }

  if (totalCount === 0) {
    return { broadcast: null, sent: 0, failed: 0, total: 0 };
  }

  const broadcast = await prisma.pushBroadcast.create({
    data: {
      title: input.title,
      body: input.body,
      type: input.type || 'broadcast',
      targetType: `${recipientRole}:${input.targetType || 'all'}`,
      targetIds: targetIds.length > 0 ? JSON.stringify(targetIds) : null,
      sentCount: totalSent,
      failedCount: totalFailed,
      sentBy: input.sentBy || null,
      data: input.data ? JSON.stringify(input.data) : null,
    },
  });

  return { broadcast, sent: totalSent, failed: totalFailed, total: totalCount };
}

export function getPublicVapidKey() {
  return getVapidPublicKey();
}

// ─── Per-role targeted send helpers ─────────────────────────────────────────

/**
 * Send web push to a specific technician by technicianId
 */
export async function sendWebPushToTechnician(
  technicianId: string,
  payload: PushNotificationPayload,
): Promise<PushSendResult> {
  const subscriptions = await prisma.technicianPushSubscription.findMany({
    where: { technicianId, isActive: true },
    select: { id: true, endpoint: true, p256dh: true, auth: true, expirationTime: true },
  });
  return sendToStoredSubscriptions(subscriptions, payload, 'technician');
}

/**
 * Send web push to ALL active technicians
 */
export async function sendWebPushToAllTechnicians(
  payload: PushNotificationPayload,
): Promise<PushSendResult> {
  const subscriptions = await prisma.technicianPushSubscription.findMany({
    where: { isActive: true },
    select: { id: true, endpoint: true, p256dh: true, auth: true, expirationTime: true },
  });
  return sendToStoredSubscriptions(subscriptions, payload, 'technician');
}

/**
 * Send web push to a specific agent by agentId
 */
export async function sendWebPushToAgent(
  agentId: string,
  payload: PushNotificationPayload,
): Promise<PushSendResult> {
  const subscriptions = await prisma.agentPushSubscription.findMany({
    where: { agentId, isActive: true },
    select: { id: true, endpoint: true, p256dh: true, auth: true, expirationTime: true },
  });
  return sendToStoredSubscriptions(subscriptions, payload, 'agent');
}