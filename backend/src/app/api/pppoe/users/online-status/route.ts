import { NextRequest } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { ok, serverError } from '@/lib/api-response';
import { prisma } from '@/server/db/client';
import { batchListPppActive } from '@/server/services/mikrotik/ppp-secret.service';

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

    // 2. Batch fetch active RADIUS sessions (radacct with acctstoptime = NULL)
    const activeSessions = await prisma.radacct.findMany({
      where: { username: { in: onlineUsernames }, acctstoptime: null },
      select: { username: true },
    });
    const onlineSet = new Set(activeSessions.map(s => s.username));

    // 3. For local-auth routers, also poll MikroTik /ppp/active
    //    (local-auth sessions bypass RADIUS accounting)
    const localRouterIds = new Set<string>();
    for (const u of onlineUsers) {
      if (u.router?.id) {
        const mode = u.router.authMode || 'local';
        if (mode !== 'radius') {
          localRouterIds.add(u.router.id);
        }
      }
    }
    if (localRouterIds.size > 0) {
      const pppActiveNames = await batchListPppActive([...localRouterIds]);
      for (const name of pppActiveNames) {
        if (onlineUsernames.includes(name)) {
          onlineSet.add(name);
        }
      }
    }

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
