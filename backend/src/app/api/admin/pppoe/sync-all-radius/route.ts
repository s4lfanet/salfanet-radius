import { NextRequest } from 'next/server';
import { ok, unauthorized, serverError } from '@/lib/api-response';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';

// POST /api/admin/pppoe/sync-all-radius
// Re-sync ALL pppoe_users → radcheck / radusergroup / radreply
// Safe to call repeatedly (idempotent — delete then re-insert per user).
// Includes nas_identifier (router.id) for multi-NAS isolation.
export async function POST(_request: NextRequest) {
  const auth = await requirePermission('customers.edit');
  if (!auth.authorized) return auth.response;

  try {
    const users = await prisma.pppoeUser.findMany({
      include: { profile: true },
    });

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        const { username, password, ipAddress, profile } = user;
        // nas_identifier = router.id for multi-NAS isolation
        const nasIdentifier = user.routerId || null;

        // -- radcheck (password) --
        // Delete scoped by nas_identifier to avoid cross-NAS deletion
        await prisma.radcheck.deleteMany({
          where: nasIdentifier
            ? { username, nas_identifier: nasIdentifier }
            : { username, nas_identifier: null },
        });
        await prisma.radcheck.create({
          data: {
            username,
            attribute: 'Cleartext-Password',
            op: ':=',
            value: password,
            nas_identifier: nasIdentifier,
          },
        });

        // -- radusergroup (profile group) --
        await prisma.radusergroup.deleteMany({
          where: nasIdentifier
            ? { username, nas_identifier: nasIdentifier }
            : { username, nas_identifier: null },
        });
        if (profile?.groupName) {
          await prisma.radusergroup.create({
            data: {
              username,
              groupname: profile.groupName,
              priority: 0,
              nas_identifier: nasIdentifier,
            },
          });
        }

        // -- radreply (static IP, if any) --
        await prisma.radreply.deleteMany({
          where: nasIdentifier
            ? { username, nas_identifier: nasIdentifier }
            : { username, nas_identifier: null },
        });
        if (ipAddress) {
          await prisma.radreply.create({
            data: {
              username,
              attribute: 'Framed-IP-Address',
              op: ':=',
              value: ipAddress,
              nas_identifier: nasIdentifier,
            },
          });
        }

        // Mark synced
        await prisma.pppoeUser.update({
          where: { id: user.id },
          data: { syncedToRadius: true, lastSyncAt: new Date() },
        });

        synced++;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        failed++;
        errors.push(`${user.username}: ${message}`);
      }
    }

    return ok({
      success: true,
      message: `Sync selesai: ${synced} berhasil, ${failed} gagal`,
      synced,
      failed,
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    console.error('[sync-all-radius] error:', error);
    return serverError();
  }
}
