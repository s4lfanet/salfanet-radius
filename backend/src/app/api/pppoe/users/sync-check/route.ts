import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { listPppSecrets, managePppSecret, getMikrotikProfileName, shouldCreatePppSecret } from '@/server/services/mikrotik/ppp-secret.service';
import { reloadFreeRadius } from '@/server/services/radius/freeradius.service';
import { requirePermission } from '@/server/middleware/api-auth';

/**
 * GET /api/pppoe/users/sync-check
 * Compare PPPoE users in DB vs PPP secrets in MikroTik.
 * Only checks routers with authMode = local (not radius).
 * Returns list of users missing from MikroTik.
 */
export async function GET(request: Request) {
  const authCheck = await requirePermission('customers.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    // Get all active routers with local auth mode
    const routers = await prisma.router.findMany({
      where: {
        isActive: true,
        type: 'mikrotik',
        authMode: 'local',
        username: { not: null },
        password: { not: null },
      },
      select: { id: true, name: true, nasname: true, ipAddress: true, authMode: true },
    });

    const missing: Array<{ username: string; routerId: string; routerName: string; profile: string; isIsolated: boolean }> = [];
    const nasChecked: Array<{ routerId: string; routerName: string; dbCount: number; mtCount: number; error?: string }> = [];

    for (const router of routers) {
      // Get PPPoE users assigned to this router (non-blocked, non-stopped)
      const dbUsers = await prisma.pppoeUser.findMany({
        where: {
          routerId: router.id,
          status: { in: ['active', 'isolated'] },
        },
        select: { username: true, profileId: true, status: true, profile: { select: { groupName: true } } },
      });

      // Get PPP secrets from MikroTik
      let mtSecrets: Array<{ name: string; disabled: string; profile: string }> = [];
      try {
        mtSecrets = await listPppSecrets(router.id);
      } catch (e: any) {
        nasChecked.push({ routerId: router.id, routerName: router.name, dbCount: dbUsers.length, mtCount: 0, error: e?.message || 'Failed to fetch' });
        continue;
      }

      const mtNames = new Set(mtSecrets.map((s) => s.name));

      for (const u of dbUsers) {
        if (!mtNames.has(u.username)) {
          missing.push({
            username: u.username,
            routerId: router.id,
            routerName: router.name,
            profile: u.profile?.groupName || '',
            isIsolated: u.status === 'isolated',
          });
        }
      }

      nasChecked.push({ routerId: router.id, routerName: router.name, dbCount: dbUsers.length, mtCount: mtSecrets.length });
    }

    return NextResponse.json({
      success: true,
      missing,
      totalDb: missing.length,
      nasChecked,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed sync check' }, { status: 500 });
  }
}

/**
 * POST /api/pppoe/users/sync-check
 * Fix missing PPP secrets by creating them in MikroTik.
 * Body: { usernames: string[] } — list of usernames to fix
 */
export async function POST(request: Request) {
  const authCheck = await requirePermission('customers.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const body = await request.json();
    const { usernames } = body as { usernames?: string[] };
    if (!Array.isArray(usernames) || usernames.length === 0) {
      return NextResponse.json({ error: 'usernames array required' }, { status: 400 });
    }

    const results = { success: 0, failed: 0, details: [] as Array<{ username: string; status: string; reason?: string }> };

    for (const username of usernames) {
      try {
        const user = await prisma.pppoeUser.findUnique({
          where: { username },
          select: {
            username: true,
            password: true,
            profileId: true,
            status: true,
            routerId: true,
            router: { select: { id: true, authMode: true } },
          },
        });
        if (!user) {
          results.failed++;
          results.details.push({ username, status: 'error', reason: 'Not found in DB' });
          continue;
        }
        if (!user.routerId || !user.router) {
          results.failed++;
          results.details.push({ username, status: 'error', reason: 'No router assigned' });
          continue;
        }

        const { shouldCreate, disabled } = shouldCreatePppSecret(user.router.authMode);
        if (!shouldCreate) {
          results.details.push({ username, status: 'skip', reason: `Router authMode=${user.router.authMode}` });
          continue;
        }

        const mtProfile = await getMikrotikProfileName(user.profileId);
        const secretDisabled = disabled || user.status === 'isolated' || user.status === 'blocked' || user.status === 'stop';
        const r = await managePppSecret(user.routerId, 'create', {
          username: user.username,
          password: user.password,
          profile: mtProfile || undefined,
          disabled: secretDisabled,
        });
        if (r.success) {
          results.success++;
          results.details.push({ username, status: 'ok' });
        } else {
          results.failed++;
          results.details.push({ username, status: 'error', reason: r.message });
        }
      } catch (e: any) {
        results.failed++;
        results.details.push({ username, status: 'error', reason: e?.message || 'Unknown error' });
      }
    }

    return NextResponse.json({ ...results, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed fix' }, { status: 500 });
  }
}
