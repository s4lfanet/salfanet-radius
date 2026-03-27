import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { ok, unauthorized, serverError } from '@/lib/api-response';
import { prisma } from '@/server/db/client';

// POST /api/admin/pppoe/sync-all-radius
// Re-sync ALL pppoe_users → radcheck / radusergroup / radreply
// Safe to call repeatedly (idempotent — delete then re-insert per user).
export async function POST(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  const role = (session.user as any)?.role;
  if (role !== 'admin' && role !== 'ADMIN') return unauthorized();

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

        // -- radcheck (password) --
        await prisma.radcheck.deleteMany({ where: { username } });
        await prisma.radcheck.create({
          data: { username, attribute: 'Cleartext-Password', op: ':=', value: password },
        });

        // -- radusergroup (profile group) --
        await prisma.radusergroup.deleteMany({ where: { username } });
        if (profile?.groupName) {
          await prisma.radusergroup.create({
            data: { username, groupname: profile.groupName, priority: 0 },
          });
        }

        // -- radreply (static IP, if any) --
        await prisma.radreply.deleteMany({ where: { username } });
        if (ipAddress) {
          await prisma.radreply.create({
            data: { username, attribute: 'Framed-IP-Address', op: ':=', value: ipAddress },
          });
        }

        // Mark synced
        await prisma.pppoeUser.update({
          where: { id: user.id },
          data: { syncedToRadius: true, lastSyncAt: new Date() },
        });

        synced++;
      } catch (err: any) {
        failed++;
        errors.push(`${user.username}: ${err.message}`);
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
