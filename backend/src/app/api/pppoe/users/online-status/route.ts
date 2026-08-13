import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { ok, unauthorized, serverError } from '@/lib/api-response';
import { prisma } from '@/server/db/client';
import { batchListPppActive } from '@/server/services/mikrotik/ppp-secret.service';

/**
 * GET /api/pppoe/users/online-status
 * Lightweight endpoint — returns only the set of usernames that are currently online.
 * Used for realtime polling on admin/pppoe/users page so online/offline status
 * updates without full page reload.
 *
 * Query params:
 *   usernames (optional, comma-separated) — restrict to specific usernames
 *
 * Response:
 *   { online: string[], onlineCount: number, total: number, timestamp: string }
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const usernamesParam = searchParams.get('usernames');

    // Build where clause — exclude 'stop' users (they should never be online)
    const whereClause: Record<string, unknown> = { status: { not: 'stop' } };
    if (usernamesParam) {
      const usernames = usernamesParam.split(',').map(u => u.trim()).filter(Boolean);
      if (usernames.length > 0) {
        whereClause.username = { in: usernames };
      }
    }

    // 1. Get all relevant usernames (so we know the total)
    const users = await prisma.pppoeUser.findMany({
      where: whereClause,
      select: { username: true, router: { select: { id: true, authMode: true } } },
    });
    const usernames = users.map(u => u.username);

    if (usernames.length === 0) {
      return ok({ online: [], onlineCount: 0, total: 0, timestamp: new Date().toISOString() });
    }

    // 2. Batch fetch active RADIUS sessions (radacct with acctstoptime = NULL)
    const activeSessions = await prisma.radacct.findMany({
      where: { username: { in: usernames }, acctstoptime: null },
      select: { username: true },
    });
    const onlineSet = new Set(activeSessions.map(s => s.username));

    // 3. For local-auth routers, also poll MikroTik /ppp/active
    //    (local-auth sessions bypass RADIUS accounting)
    const localRouterIds = new Set<string>();
    for (const u of users) {
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
        if (usernames.includes(name)) {
          onlineSet.add(name);
        }
      }
    }

    const online = [...onlineSet];
    return ok({
      online,
      onlineCount: online.length,
      total: usernames.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Online status error:', error);
    return serverError();
  }
}
