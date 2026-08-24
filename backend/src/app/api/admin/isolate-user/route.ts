import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { managePppSecret, kickPppoeSession, shouldManagePppSecretForSuspend } from '@/server/services/mikrotik/ppp-secret.service';
import { disconnectPPPoEUser } from '@/server/services/radius/coa-handler.service';
import { parseBody, z } from '@/lib/parse-body';

// Zod schema for isolate-user — prevents mass assignment and validates input
const isolateUserSchema = z.object({
  username: z.string().min(1).max(64),
  reason: z.string().max(500).optional(),
});

/**
 * POST /api/admin/isolate-user
 * Manual isolation by username — native Next.js (no NestJS backend).
 * Body: { username, reason }
 */
export async function POST(request: NextRequest) {
  try {
    const authCheck = await requirePermission('customers.isolate');
    if (!authCheck.authorized) return authCheck.response;

    const { data, error } = await parseBody(request, isolateUserSchema);
    if (error) return error;
    const { username, reason } = data;

    const user = await prisma.pppoeUser.findUnique({
      where: { username },
      select: {
        id: true, username: true, name: true, password: true, ipAddress: true,
        profile: { select: { groupName: true } },
        router: { select: { id: true, authMode: true } },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const nasIdentifier = user.router?.id || null;

    // 1. Update DB status + RADIUS tables in a transaction so they either
    //    all succeed or all roll back — prevents a user being isolated in
    //    DB but still active in RADIUS if one of the writes fails.
    await prisma.$transaction(async (tx) => {
      await tx.pppoeUser.update({
        where: { id: user.id },
        data: { status: 'isolated', comment: reason || 'Manual isolation' },
      });

      await tx.radcheck.deleteMany({
        where: { username: user.username, attribute: 'Auth-Type', ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}) },
      });

      await tx.$executeRaw`
        INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
        VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}, ${nasIdentifier})
        ON DUPLICATE KEY UPDATE value = ${user.password}
      `;

      await tx.$executeRaw`
        DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
      `;
      await tx.$executeRaw`
        INSERT INTO radusergroup (username, groupname, priority, nas_identifier)
        VALUES (${user.username}, 'isolir', 1, ${nasIdentifier})
      `;

      await tx.$executeRaw`
        DELETE FROM radreply WHERE username = ${user.username} AND attribute = 'Framed-IP-Address' AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
      `;
    });

    // 3. MikroTik: change PPP secret profile to isolir + kick
    if (user.router?.id && shouldManagePppSecretForSuspend(user.router.authMode)) {
      managePppSecret(user.router.id, 'enable', { username: user.username, password: user.password, profile: 'isolir' })
        .then(r => console.log(`[ISOLATE_USER] PPP secret: ${r.message}`))
        .catch(e => console.error(`[ISOLATE_USER] PPP secret failed:`, e?.message));

      kickPppoeSession(user.router.id, user.username)
        .then(k => console.log(`[ISOLATE_USER] Kicked ${k} session(s)`))
        .catch(e => console.error(`[ISOLATE_USER] Kick failed:`, e?.message));
    }

    // 4. CoA disconnect
    try { await disconnectPPPoEUser(user.username); } catch { /* non-fatal */ }

    return NextResponse.json({
      success: true,
      message: `User ${username} isolated successfully`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
