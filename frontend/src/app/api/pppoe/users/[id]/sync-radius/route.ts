import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { ok, unauthorized, notFound, serverError } from '@/lib/api-response';
import { prisma } from '@/server/db/client';
import { reloadFreeRadius } from '@/server/services/radius/freeradius.service';

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

    // nas_identifier = router UUID if user is assigned to a specific router (multi-tenant isolation)
    // When nas_identifier is NULL, the entry applies globally to all NAS
    // When nas_identifier is set, the entry only applies to that specific NAS
    const nasIdentifier = user.routerId || null;

    // Re-create radcheck (password) — with nas_identifier for multi-tenant isolation
    await prisma.radcheck.deleteMany({ where: { username, nas_identifier: nasIdentifier } });
    await prisma.radcheck.create({
      data: { username, attribute: 'Cleartext-Password', op: ':=', value: user.password, nas_identifier: nasIdentifier },
    });

    // Re-create radusergroup (profile group) — with nas_identifier
    await prisma.radusergroup.deleteMany({ where: { username, nas_identifier: nasIdentifier } });
    await prisma.radusergroup.create({
      data: { username, groupname: user.profile.groupName, priority: 0, nas_identifier: nasIdentifier },
    });

    // Re-create radreply (static IP if set) — with nas_identifier
    await prisma.radreply.deleteMany({ where: { username, nas_identifier: nasIdentifier } });
    if (user.ipAddress) {
      await prisma.radreply.create({
        data: { username, attribute: 'Framed-IP-Address', op: ':=', value: user.ipAddress, nas_identifier: nasIdentifier },
      });
    }

    // Mark synced
    await prisma.pppoeUser.update({
      where: { id },
      data: { syncedToRadius: true, lastSyncAt: new Date() },
    });

    // Reload FreeRADIUS so changes take effect immediately
    try {
      await reloadFreeRadius();
    } catch (e) {
      console.warn('FreeRADIUS reload failed after user sync:', e);
    }

    return ok({ success: true, message: `${username} berhasil di-sync ke RADIUS${nasIdentifier ? ` (NAS: ${nasIdentifier})` : ' (global)'}` });
  } catch (error) {
    console.error('Sync radius error:', error);
    return serverError();
  }
}
