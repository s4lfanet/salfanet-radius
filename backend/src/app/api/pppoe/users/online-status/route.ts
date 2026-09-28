import { NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, serverError } from '@/lib/api-response';
import { prisma } from '@/server/db/client';
import { resolveOnlineUsernames } from '@/server/services/radius/online-status.service';

/**
 * GET /api/pppoe/users/online-status
 * Lightweight endpoint — returns online usernames + status map for realtime polling.
 * Used for realtime polling on admin/pppoe/users page so online/offline status
 * and isolated/active/stop status update without full page reload.
 *
 * Query params:
 *   usernames (optional, comma-separated) — restrict to specific usernames
 *
 * Response:
 *   {
 *     online: string[],
 *     onlineCount: number,
 *     total: number,
 *     statusMap: Record<username, status>,  // active | isolated | blocked | stop
 *     timestamp: string
 *   }
 */
export async function GET(request: NextRequest) {
  const authCheck = await requirePermission('customers.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { searchParams } = new URL(request.url);
    const usernamesParam = searchParams.get('usernames');

    // Build where clause — exclude 'stop' users from online check (they should never be online)
    // but still return their status in statusMap
    const onlineWhereClause: Record<string, unknown> = { status: { not: 'stop' } };
    const statusWhereClause: Record<string, unknown> = {};
    if (usernamesParam) {
      const usernames = usernamesParam.split(',').map(u => u.trim()).filter(Boolean);
      if (usernames.length > 0) {
        onlineWhereClause.username = { in: usernames };
        statusWhereClause.username = { in: usernames };
      }
    }

    // 1. Get all relevant users for online check + status map
    const [onlineUsers, statusUsers] = await Promise.all([
      prisma.pppoeUser.findMany({
        where: onlineWhereClause,
        select: { username: true, router: { select: { id: true, authMode: true } } },
      }),
      prisma.pppoeUser.findMany({
        where: statusWhereClause,
        select: { username: true, status: true },
      }),
    ]);

    // Build status map: { username: status }
    const statusMap: Record<string, string> = {};
    for (const u of statusUsers) {
      statusMap[u.username] = u.status;
    }

    const onlineUsernames = onlineUsers.map(u => u.username);

    if (onlineUsernames.length === 0) {
      return ok({ online: [], onlineCount: 0, total: statusUsers.length, statusMap, timestamp: new Date().toISOString() });
    }

    // 2. Shared rule: radacct first, then live MikroTik for the rest.
    const onlineSet = await resolveOnlineUsernames(onlineUsers);

    const online = [...onlineSet];
    return ok({
      online,
      onlineCount: online.length,
      total: statusUsers.length,
      statusMap,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Online status error:', error);
    return serverError();
  }
}
