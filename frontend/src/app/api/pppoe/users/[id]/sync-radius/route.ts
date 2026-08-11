import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response';
import { prisma } from '@/server/db/client';

// POST /api/pppoe/users/[id]/sync-radius — re-sync a single user to RADIUS tables
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { id } = await params;

    const user = await prisma.pppoeUser.findUnique({
      where: { id },
      include: { profile: true },
    });
    if (!user) return notFound('User tidak ditemukan');

    const username = user.username;

    // Re-create radcheck (password)
    await prisma.radcheck.deleteMany({ where: { username } });
    await prisma.radcheck.create({
      data: { username, attribute: 'Cleartext-Password', op: ':=', value: user.password },
    });

    // Re-create radusergroup (profile group)
    await prisma.radusergroup.deleteMany({ where: { username } });
    await prisma.radusergroup.create({
      data: { username, groupname: user.profile.groupName, priority: 0 },
    });

    // Re-create radreply (static IP if set)
    await prisma.radreply.deleteMany({ where: { username } });
    if (user.ipAddress) {
      await prisma.radreply.create({
        data: { username, attribute: 'Framed-IP-Address', op: ':=', value: user.ipAddress },
      });
    }

    // Mark synced
    await prisma.pppoeUser.update({
      where: { id },
      data: { syncedToRadius: true, lastSyncAt: new Date() },
    });

    return ok({ success: true, message: `${username} berhasil di-sync ke RADIUS` });
  } catch (error) {
    console.error('Sync radius error:', error);
    return serverError();
  }
}
