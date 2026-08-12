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

    // nas_id = router UUID if user is assigned to a specific router (multi-tenant isolation)
    // When nas_id is NULL, the entry applies globally to all NAS
    // When nas_id is set, the entry only applies to that specific NAS
    const nasId = user.routerId || null;

    // Re-create radcheck (password) — with nas_id for multi-tenant isolation
    await prisma.radcheck.deleteMany({ where: { username, nas_id: nasId } });
    await prisma.$executeRaw`
      INSERT INTO radcheck (username, attribute, op, value, nas_id)
      VALUES (${username}, 'Cleartext-Password', ':=', ${user.password}, ${nasId})
    `;

    // Re-create radusergroup (profile group) — with nas_id
    await prisma.radusergroup.deleteMany({ where: { username, nas_id: nasId } });
    await prisma.$executeRaw`
      INSERT INTO radusergroup (username, groupname, priority, nas_id)
      VALUES (${username}, ${user.profile.groupName}, 0, ${nasId})
    `;

    // Re-create radreply (static IP if set) — with nas_id
    await prisma.radreply.deleteMany({ where: { username, nas_id: nasId } });
    if (user.ipAddress) {
      await prisma.$executeRaw`
        INSERT INTO radreply (username, attribute, op, value, nas_id)
        VALUES (${username}, 'Framed-IP-Address', ':=', ${user.ipAddress}, ${nasId})
      `;
    }

    // Mark synced
    await prisma.pppoeUser.update({
      where: { id },
      data: { syncedToRadius: true, lastSyncAt: new Date() },
    });

    return ok({ success: true, message: `${username} berhasil di-sync ke RADIUS${nasId ? ` (NAS: ${nasId})` : ' (global)'}` });
  } catch (error) {
    console.error('Sync radius error:', error);
    return serverError();
  }
}
