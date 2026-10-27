import 'server-only'
/**
 * Firebase Cloud Messaging (FCM) push for the customer Flutter app.
 *
 * Separate from push-notification.service.ts's Web Push/VAPID subscriptions
 * (used by the customer PWA in a browser) — a native Android app can't
 * receive Web Push, it needs FCM. sendWebPushToUser/sendWebPushToUsers in
 * that file call into sendFcmToUser/sendFcmToUsers here, so every existing
 * notification trigger (invoice reminders, payment success/rejected,
 * ticket replies, auto-renewal, isolation notices) reaches the Flutter app
 * automatically without touching those call sites.
 *
 * No-ops safely (returns 0 sent/0 failed) when no service account is set up
 * (admin panel upload or FIREBASE_SERVICE_ACCOUNT_JSON), so the existing
 * web-push flow is unaffected until a Firebase project is set up. Customer
 * pushes are also stored as customerAppNotice rows either way, which is how
 * the app still gets them on a server without Firebase.
 */
import * as admin from 'firebase-admin';
import { prisma } from '@/server/db/client';
import { readServiceAccount } from './firebase-config.service';

// Deliberately NOT importing types/helpers from push-notification.service.ts
// here (it imports back from this file) — kept minimal and self-contained to
// avoid a circular module dependency between the two push services.
export interface FcmPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  data?: Record<string, string | number | boolean | null | undefined>;
}

const FCM_APP_NAME = 'fcm-customer';
let fcmApp: admin.app.App | null = null;
// The service account can be uploaded or removed in the admin panel while
// the server runs; re-initialize whenever its source changes.
let loadedSignature: string | undefined;
let warnedMissing = false;

function getFcmApp(): admin.app.App | null {
  const sa = readServiceAccount();
  const signature = sa?.signature ?? 'none';
  if (signature === loadedSignature) return fcmApp;

  loadedSignature = signature;
  const previous = fcmApp ?? admin.apps.find((a) => a?.name === FCM_APP_NAME) ?? null;
  fcmApp = null;
  if (previous) void previous.delete().catch(() => {});

  if (!sa) {
    if (!warnedMissing) console.warn('[FCM] No Firebase service account — native app push goes through polling (web push is unaffected).');
    warnedMissing = true;
    return null;
  }
  try {
    fcmApp = admin.initializeApp({ credential: admin.credential.cert(sa.account as admin.ServiceAccount) }, `${FCM_APP_NAME}-${Date.now()}`);
    return fcmApp;
  } catch (error) {
    console.error('[FCM] Failed to initialize firebase-admin:', error);
    return null;
  }
}

/** Keeps a copy the customer app can poll for (see /api/customer/app-notices). */
async function storeCustomerNotices(userIds: string[], payload: FcmPushPayload) {
  if (userIds.length === 0) return;
  try {
    await prisma.customerAppNotice.createMany({
      data: userIds.map((userId) => ({
        userId,
        title: payload.title.slice(0, 255),
        body: payload.body,
        url: payload.url?.slice(0, 500) || null,
      })),
    });
  } catch (error) {
    console.error('[FCM] Storing customer app notices failed:', error);
  }
}

function toFcmData(payload: FcmPushPayload): Record<string, string> {
  const out: Record<string, string> = { url: payload.url?.trim() || '/customer' };
  if (payload.tag) out.tag = payload.tag;
  if (payload.data) {
    for (const [key, value] of Object.entries(payload.data)) {
      if (value !== undefined && value !== null) out[key] = String(value);
    }
  }
  return out;
}

export async function registerCustomerPushToken(userId: string, token: string, platform = 'android') {
  const cleanToken = token.trim();
  if (!cleanToken) throw new Error('Invalid FCM token');

  return prisma.customerPushToken.upsert({
    where: { token: cleanToken },
    update: { userId, platform, lastUsedAt: new Date() },
    create: { userId, token: cleanToken, platform },
  });
}

export async function removeCustomerPushToken(userId: string, token?: string | null) {
  const where: { userId: string; token?: string } = { userId };
  if (token?.trim()) where.token = token.trim();
  const result = await prisma.customerPushToken.deleteMany({ where });
  return result.count;
}

type TokenAudience = 'customer' | 'admin';

// Channel ids must match each app's AndroidNotificationChannel.
const CHANNEL: Record<TokenAudience, string> = { customer: 'salfanet_customer', admin: 'salfanet_admin' };

async function sendToTokenRows(
  tokenRows: Array<{ id: string; token: string }>,
  payload: FcmPushPayload,
  audience: TokenAudience = 'customer',
): Promise<{ sent: number; failed: number }> {
  const app = getFcmApp();
  if (!app || tokenRows.length === 0) return { sent: 0, failed: 0 };

  const messaging = admin.messaging(app);
  const data = toFcmData(payload);

  let sent = 0;
  let failed = 0;
  const staleIds: string[] = [];

  // FCM's multicast send caps at 500 tokens per call.
  for (let i = 0; i < tokenRows.length; i += 500) {
    const chunk = tokenRows.slice(i, i + 500);
    try {
      const result = await messaging.sendEachForMulticast({
        tokens: chunk.map((t) => t.token),
        notification: { title: payload.title, body: payload.body },
        data,
        android: { priority: 'high', notification: { channelId: CHANNEL[audience] } },
      });
      result.responses.forEach((r, idx) => {
        if (r.success) {
          sent += 1;
        } else {
          failed += 1;
          const code = r.error?.code;
          if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
            staleIds.push(chunk[idx].id);
          }
        }
      });
    } catch (error) {
      failed += chunk.length;
      console.error('[FCM] sendEachForMulticast batch error:', error);
    }
  }

  if (staleIds.length > 0) {
    const where = { where: { id: { in: staleIds } } };
    await (audience === 'admin' ? prisma.adminPushToken.deleteMany(where) : prisma.customerPushToken.deleteMany(where)).catch(() => {});
  }

  return { sent, failed };
}

export async function sendFcmToUser(userId: string, payload: FcmPushPayload): Promise<{ sent: number; failed: number }> {
  await storeCustomerNotices([userId], payload);
  if (!getFcmApp()) return { sent: 0, failed: 0 };
  const tokenRows = await prisma.customerPushToken.findMany({ where: { userId }, select: { id: true, token: true } });
  return sendToTokenRows(tokenRows, payload);
}

export async function sendFcmToUsers(userIds: string[], payload: FcmPushPayload): Promise<{ sent: number; failed: number }> {
  if (userIds.length === 0) return { sent: 0, failed: 0 };
  await storeCustomerNotices(userIds, payload);
  if (!getFcmApp()) return { sent: 0, failed: 0 };
  const tokenRows = await prisma.customerPushToken.findMany({ where: { userId: { in: userIds } }, select: { id: true, token: true } });
  return sendToTokenRows(tokenRows, payload);
}

// ── Admin Flutter app ─────────────────────────────────────────────────────

export async function registerAdminPushToken(adminId: string, token: string, platform = 'android') {
  const cleanToken = token.trim();
  if (!cleanToken) throw new Error('Invalid FCM token');

  return prisma.adminPushToken.upsert({
    where: { token: cleanToken },
    update: { adminId, platform, lastUsedAt: new Date() },
    create: { adminId, token: cleanToken, platform },
  });
}

export async function removeAdminPushToken(adminId: string, token?: string | null) {
  const where: { adminId: string; token?: string } = { adminId };
  if (token?.trim()) where.token = token.trim();
  const result = await prisma.adminPushToken.deleteMany({ where });
  return result.count;
}

/**
 * Pushes an admin notification to every signed-in admin app whose account
 * may read notifications — the same people who see it in the web bell.
 */
export async function sendFcmToAdmins(payload: FcmPushPayload): Promise<{ sent: number; failed: number }> {
  if (!getFcmApp()) return { sent: 0, failed: 0 };
  const rows = await prisma.adminPushToken.findMany({
    where: { admin: { isActive: true } },
    select: { id: true, token: true, adminId: true },
  });
  if (rows.length === 0) return { sent: 0, failed: 0 };

  const { hasPermission, isSuperAdmin } = await import('@/server/auth/permissions');
  const allowed = new Set<string>();
  for (const adminId of new Set(rows.map((r) => r.adminId))) {
    if ((await isSuperAdmin(adminId)) || (await hasPermission(adminId, 'notifications.view'))) allowed.add(adminId);
  }
  return sendToTokenRows(rows.filter((r) => allowed.has(r.adminId)), { url: '/admin', ...payload }, 'admin');
}
