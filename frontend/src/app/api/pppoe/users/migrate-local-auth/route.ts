import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { managePppSecret, getMikrotikProfileName, shouldCreatePppSecret } from '@/server/services/mikrotik/ppp-secret.service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

/**
 * POST /api/pppoe/users/migrate-local-auth
 * Bulk create PPP secrets in MikroTik for all PPPoE users that don't have one yet.
 * Only processes routers with authMode = local or hybrid.
 * Body (optional): { routerId?: string } — limit to one router
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const { routerId } = body as { routerId?: string };

    // Get all active routers with local/hybrid auth mode
    const routers = await prisma.router.findMany({
      where: {
        isActive: true,
        type: 'mikrotik',
        authMode: { in: ['local', 'hybrid'] },
        username: { not: null },
        password: { not: null },
        ...(routerId && { id: routerId }),
      },
      select: { id: true, name: true, authMode: true },
    });

    const summary: Array<{ routerId: string; routerName: string; total: number; success: number; failed: number }> = [];

    for (const router of routers) {
      const { shouldCreate, disabled } = shouldCreatePppSecret(router.authMode);
      if (!shouldCreate) continue;

      // Get all PPPoE users for this router (non-blocked, non-stopped)
      const users = await prisma.pppoeUser.findMany({
        where: {
          routerId: router.id,
          status: { in: ['active', 'isolated'] },
        },
        select: { username: true, password: true, profileId: true, status: true },
      });

      let success = 0, failed = 0;
      for (const u of users) {
        try {
          const mtProfile = await getMikrotikProfileName(u.profileId);
          const secretDisabled = disabled || u.status === 'isolated';
          const r = await managePppSecret(router.id, 'create', {
            username: u.username,
            password: u.password,
            profile: mtProfile || undefined,
            disabled: secretDisabled,
          });
          if (r.success) success++; else failed++;
        } catch (e) {
          failed++;
          console.error(`[MIGRATE] ${u.username} on ${router.name}:`, e);
        }
      }

      summary.push({ routerId: router.id, routerName: router.name, total: users.length, success, failed });
      console.log(`[MIGRATE] Router ${router.name}: ${success}/${users.length} berhasil`);
    }

    const totalSuccess = summary.reduce((s, r) => s + r.success, 0);
    const totalFailed = summary.reduce((s, r) => s + r.failed, 0);
    const totalAll = summary.reduce((s, r) => s + r.total, 0);

    return NextResponse.json({
      success: true,
      message: `Migrasi selesai: ${totalSuccess} berhasil, ${totalFailed} gagal dari ${totalAll} pelanggan`,
      summary: { total: totalAll, success: totalSuccess, failed: totalFailed },
      perRouter: summary,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed migrate' }, { status: 500 });
  }
}
