import { NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { reloadFreeRadius } from '@/server/services/radius/freeradius.service';

/**
 * POST /api/pppoe/users/bulk-sync-radius
 *
 * Re-sync all PPPoE users to RADIUS tables (radcheck, radusergroup, radreply).
 * Does NOT change authMode — use this to fix out-of-sync RADIUS data.
 *
 * Body: { routerId?: string } — optional, if not provided syncs ALL routers
 */
export async function POST(request: Request) {
  try {
    const authCheck = await requirePermission('customers.edit');
    if (!authCheck.authorized) return authCheck.response;
    const body = await request.json().catch(() => ({}));
    const { routerId } = body as { routerId?: string };

    // Get users — either for a specific router or all
    const where = routerId ? { routerId } : {};
    const users = await prisma.pppoeUser.findMany({
      where,
      include: { profile: true },
    });

    if (users.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Tidak ada pelanggan untuk di-sync.',
        summary: { total: 0, synced: 0, failed: 0 },
      });
    }

    let synced = 0;
    let failed = 0;
    const errors: Array<{ username: string; error: string }> = [];

    for (const user of users) {
      try {
        const nasIdentifier = user.routerId || null;

        // Clean old RADIUS entries for this user on this NAS
        await prisma.$executeRaw`
          DELETE FROM radcheck WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
        `;
        await prisma.$executeRaw`
          DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
        `;
        await prisma.$executeRaw`
          DELETE FROM radreply WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
        `;

        // Only create RADIUS entries for active/isolated users
        if (user.status === 'active' || user.status === 'isolated') {
          const groupName = user.status === 'isolated'
            ? 'isolir'
            : (user.profile?.groupName || null);

          await prisma.$executeRaw`
            INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
            VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}, ${nasIdentifier})
            ON DUPLICATE KEY UPDATE value = ${user.password}
          `;

          if (groupName) {
            await prisma.$executeRaw`
              INSERT INTO radusergroup (username, groupname, priority, nas_identifier)
              VALUES (${user.username}, ${groupName}, 1, ${nasIdentifier})
            `;
          }

          if (user.ipAddress) {
            await prisma.$executeRaw`
              INSERT INTO radreply (username, attribute, op, value, nas_identifier)
              VALUES (${user.username}, 'Framed-IP-Address', ':=', ${user.ipAddress}, ${nasIdentifier})
              ON DUPLICATE KEY UPDATE value = ${user.ipAddress}
            `;
          }
        }

        // Mark synced
        await prisma.pppoeUser.update({
          where: { id: user.id },
          data: { syncedToRadius: true, lastSyncAt: new Date() },
        });

        synced++;
      } catch (e: any) {
        failed++;
        errors.push({ username: user.username, error: e?.message || 'Unknown error' });
        console.error(`[BULK-SYNC-RADIUS] Failed for "${user.username}":`, e);
      }
    }

    // Reload FreeRADIUS
    try {
      await reloadFreeRadius();
    } catch (e) {
      console.warn('[BULK-SYNC-RADIUS] FreeRADIUS reload failed:', e);
    }

    const scope = routerId ? 'router ini' : 'semua router';
    const message = `Sync RADIUS selesai: ${synced}/${users.length} pelanggan pada ${scope} berhasil di-sync${failed > 0 ? `, ${failed} gagal` : ''}.`;

    return NextResponse.json({
      success: true,
      message,
      summary: { total: users.length, synced, failed },
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });
  } catch (error) {
    console.error('Bulk sync RADIUS error:', error);
    return NextResponse.json(
      { error: 'Failed to sync users to RADIUS' },
      { status: 500 }
    );
  }
}
