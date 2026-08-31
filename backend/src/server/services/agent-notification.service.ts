import 'server-only';
import { prisma } from '@/server/db/client';
import { sendWebPushToAgent } from '@/server/services/push-notification.service';

/**
 * Create an agent notification AND send a web push notification in one call.
 * Use this instead of prisma.agentNotification.create to ensure push is always sent.
 */
export async function createAgentNotificationAndPush(
  agentId: string,
  data: {
    type: string;
    title: string;
    message: string;
    link?: string;
  },
): Promise<void> {
  try {
    await prisma.agentNotification.create({
      data: {
        agentId,
        type: data.type,
        title: data.title,
        message: data.message,
        link: data.link || null,
      },
    });
  } catch (e) {
    console.error('[AgentNotif] Failed to create notification:', e);
  }

  // Send web push (best-effort)
  try {
    await sendWebPushToAgent(agentId, {
      title: data.title,
      body: data.message,
      url: data.link || '/agent/dashboard',
      tag: data.type,
      data: { type: data.type },
    });
  } catch (e) {
    console.error('[AgentNotif] Push failed:', e);
  }
}
