import 'server-only'
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';

/**
 * Creates an admin notification (the web panel's bell) and pushes it to the
 * admin Flutter app. Every admin notification goes through here so the app
 * gets the same events as the bell; the push is best-effort and never fails
 * the caller.
 */
export async function createAdminNotification(args: Prisma.notificationCreateArgs) {
  const row = await prisma.notification.create(args);
  const { sendFcmToAdmins } = await import('@/server/services/fcm-push.service');
  sendFcmToAdmins({
    title: row.title,
    body: row.message,
    tag: row.type,
    data: { type: row.type, notificationId: row.id, link: row.link ?? '' },
  }).catch((error) => console.error('[AdminNotification] FCM push failed:', error));
  return row;
}
