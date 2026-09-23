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
 * No-ops safely (returns 0 sent/0 failed) if FIREBASE_SERVICE_ACCOUNT_JSON
 * isn't configured, so the existing web-push flow is unaffected until a
 * Firebase project is set up.
 */
import * as admin from 'firebase-admin';
import { prisma } from '@/server/db/client';

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

let fcmApp: admin.app.App | null = null;
let initAttempted = false;

function getFcmApp(): admin.app.App | null {
  if (fcmApp) return fcmApp;
  if (initAttempted) return null;
  initAttempted = true;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    console.warn('[FCM] FIREBASE_SERVICE_ACCOUNT_JSON not configured — customer app push disabled (web push is unaffected).');
    return null;
  }

  try {
    const serviceAccount = JSON.parse(raw);
    fcmApp = admin.apps.length
      ? (admin.apps.find((a) => a?.name === 'fcm-customer') ?? admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, 'fcm-customer'))
      : admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, 'fcm-customer');
    return fcmApp;
  } catch (error) {
    console.error('[FCM] Failed to initialize firebase-admin:', error);
    return null;
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

async function sendToTokenRows(
  tokenRows: Array<{ id: string; token: string }>,
  payload: FcmPushPayload,
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
        android: { priority: 'high', notification: { channelId: 'salfanet_customer' } },
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
    await prisma.customerPushToken.deleteMany({ where: { id: { in: staleIds } } }).catch(() => {});
  }

  return { sent, failed };
}

export async function sendFcmToUser(userId: string, payload: FcmPushPayload): Promise<{ sent: number; failed: number }> {
  if (!getFcmApp()) return { sent: 0, failed: 0 };
  const tokenRows = await prisma.customerPushToken.findMany({ where: { userId }, select: { id: true, token: true } });
  return sendToTokenRows(tokenRows, payload);
}

export async function sendFcmToUsers(userIds: string[], payload: FcmPushPayload): Promise<{ sent: number; failed: number }> {
  if (!getFcmApp() || userIds.length === 0) return { sent: 0, failed: 0 };
  const tokenRows = await prisma.customerPushToken.findMany({ where: { userId: { in: userIds } }, select: { id: true, token: true } });
  return sendToTokenRows(tokenRows, payload);
}
