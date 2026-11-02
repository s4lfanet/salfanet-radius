import 'server-only';

/**
 * Small best-effort senders for events that cross between roles (customer,
 * collector, technician, admin). Each swallows its own errors: the thing that
 * happened (a request, a decision, a report) must never fail because a
 * notification could not be delivered.
 */

/** A row in the admin bell (and FCM to the admin app, which hangs off it). */
export async function notifyAdmins(notice: { type: string; title: string; message: string; link?: string }): Promise<void> {
  try {
    const { createAdminNotification } = await import('@/server/services/notifications/admin-notification.service');
    await createAdminNotification({ data: { type: notice.type, title: notice.title, message: notice.message, link: notice.link } });
  } catch (error) {
    console.error('[EventNotice] Admin notification failed:', error instanceof Error ? error.message : error);
  }
}

/** Web push and FCM to one customer's devices. */
export async function pushToCustomer(userId: string, title: string, body: string): Promise<void> {
  try {
    const { sendPushToUser } = await import('@/server/services/notifications/push-templates.service');
    await sendPushToUser(userId, 'info', { customTitle: title, customBody: body });
  } catch (error) {
    console.error('[EventNotice] Customer push failed:', error instanceof Error ? error.message : error);
  }
}
