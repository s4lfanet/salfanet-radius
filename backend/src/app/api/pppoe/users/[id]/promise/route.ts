import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { managePppSecret, kickPppoeSession, shouldManagePppSecretForSuspend } from '@/server/services/mikrotik/ppp-secret.service';
import { disconnectPPPoEUser } from '@/server/services/radius/coa-handler.service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pppoe/users/[id]/promise
 * List all payment promises for this user. Ordered by createdAt DESC.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission('customers.view');
    if (!authCheck.authorized) return authCheck.response;

    const { id } = await params;

    const user = await prisma.pppoeUser.findUnique({ where: { id }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const promises = await prisma.paymentPromise.findMany({
      where: { pppoeUserId: id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ promises });
  } catch (error: any) {
    console.error('[PaymentPromise GET] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/pppoe/users/[id]/promise
 * Create a new payment promise (janji bayar).
 * Body: { promiseDate, notes?, invoiceId? }
 * - promiseDate must be in the future.
 * - No existing active promise allowed.
 * - After creating, if user is isolated, un-isolate them
 *   (set status to 'active', remove RADIUS Auth-Type Reject if exists).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission('customers.edit');
    if (!authCheck.authorized) return authCheck.response;

    const { id } = await params;

    const user = await prisma.pppoeUser.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        password: true,
        ipAddress: true,
        status: true,
        profile: { select: { groupName: true } },
        router: { select: { id: true, authMode: true } },
      },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { promiseDate, notes, invoiceId } = body as {
      promiseDate?: string;
      notes?: string;
      invoiceId?: string;
    };

    if (!promiseDate) {
      return NextResponse.json({ error: 'promiseDate is required' }, { status: 400 });
    }

    const promiseDateObj = new Date(promiseDate);
    if (isNaN(promiseDateObj.getTime())) {
      return NextResponse.json({ error: 'Invalid promiseDate' }, { status: 400 });
    }
    if (promiseDateObj <= new Date()) {
      return NextResponse.json({ error: 'promiseDate must be in the future' }, { status: 400 });
    }

    // Check no existing active promise
    const existingActive = await prisma.paymentPromise.findFirst({
      where: { pppoeUserId: id, status: 'active' },
    });
    if (existingActive) {
      return NextResponse.json(
        { error: 'User already has an active payment promise. Cancel it first.' },
        { status: 409 }
      );
    }

    // Validate invoiceId if provided
    if (invoiceId) {
      const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice || invoice.userId !== id) {
        return NextResponse.json({ error: 'Invalid invoiceId for this user' }, { status: 400 });
      }
    }

    // Create the promise
    const promise = await prisma.paymentPromise.create({
      data: {
        pppoeUserId: id,
        invoiceId: invoiceId || null,
        promiseDate: promiseDateObj,
        notes: notes?.trim() || null,
        status: 'active',
        createdByAdminId: authCheck.userId || null,
      },
    });

    // If user is isolated, un-isolate them
    if (user.status === 'isolated') {
      const nasIdentifier = user.router?.id || null;

      // 1. Update DB status to active
      await prisma.pppoeUser.update({
        where: { id },
        data: { status: 'active' },
      });

      // 2. Remove RADIUS Auth-Type Reject if exists
      try {
        await prisma.radcheck.deleteMany({
          where: {
            username: user.username,
            attribute: 'Auth-Type',
            ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}),
          },
        });
        await prisma.radcheck.deleteMany({
          where: {
            username: user.username,
            attribute: 'NAS-IP-Address',
            ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}),
          },
        });
        await prisma.radreply.deleteMany({
          where: {
            username: user.username,
            attribute: 'Reply-Message',
            ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}),
          },
        });

        // Restore original profile group
        if (user.profile?.groupName) {
          await prisma.$executeRaw`
            INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
            VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}, ${nasIdentifier})
            ON DUPLICATE KEY UPDATE value = ${user.password}
          `;
          await prisma.$executeRaw`
            DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
          `;
          await prisma.$executeRaw`
            INSERT INTO radusergroup (username, groupname, priority, nas_identifier)
            VALUES (${user.username}, ${user.profile.groupName}, 1, ${nasIdentifier})
          `;
          if (user.ipAddress) {
            await prisma.$executeRaw`
              INSERT INTO radreply (username, attribute, op, value, nas_identifier)
              VALUES (${user.username}, 'Framed-IP-Address', ':=', ${user.ipAddress}, ${nasIdentifier})
              ON DUPLICATE KEY UPDATE value = ${user.ipAddress}
            `;
          }
        }

        // Restore PPP secret profile in MikroTik
        if (user.router?.id && shouldManagePppSecretForSuspend(user.router.authMode) && user.profile?.groupName) {
          managePppSecret(user.router.id, 'enable', {
            username: user.username,
            password: user.password,
            profile: user.profile.groupName,
          }).then((r) => {
            console.log(`[PaymentPromise] PPP secret restored for ${user.username}: ${r.message}`);
          }).catch((e) => {
            console.error(`[PaymentPromise] PPP secret restore failed for ${user.username}:`, e?.message || e);
          });
        }

        // CoA disconnect to force re-auth
        try { await disconnectPPPoEUser(user.username); } catch { /* non-fatal */ }
      } catch (radiusErr: any) {
        console.error(`[PaymentPromise] RADIUS restore error for ${user.username}:`, radiusErr?.message);
      }
    }

    return NextResponse.json(
      { success: true, message: 'Payment promise created successfully.', promise },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[PaymentPromise POST] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/pppoe/users/[id]/promise
 * Cancel the active payment promise.
 * - Set status to 'broken'.
 * - Re-isolate the user (set status to 'isolated', add RADIUS Auth-Type Reject).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission('customers.edit');
    if (!authCheck.authorized) return authCheck.response;
    const session = authCheck.session;
    if ((session.user as any)?.role !== 'ADMIN' && (session.user as any)?.role !== 'SUPER_ADMIN' && (session.user as any)?.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    const user = await prisma.pppoeUser.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        password: true,
        status: true,
        profile: { select: { groupName: true } },
        router: { select: { id: true, authMode: true } },
      },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find active promise
    const activePromise = await prisma.paymentPromise.findFirst({
      where: { pppoeUserId: id, status: 'active' },
    });
    if (!activePromise) {
      return NextResponse.json({ error: 'No active payment promise found' }, { status: 404 });
    }

    // Set status to 'broken'
    await prisma.paymentPromise.update({
      where: { id: activePromise.id },
      data: { status: 'broken' },
    });

    // Re-isolate the user
    const nasIdentifier = user.router?.id || null;

    // 1. Update DB status to isolated
    await prisma.pppoeUser.update({
      where: { id },
      data: { status: 'isolated' },
    });

    // 2. Add RADIUS Auth-Type Reject
    try {
      // Remove existing Auth-Type first (unique constraint on [username, attribute])
      await prisma.radcheck.deleteMany({
        where: {
          username: user.username,
          attribute: 'Auth-Type',
          ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}),
        },
      });

      await prisma.$executeRaw`
        INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
        VALUES (${user.username}, 'Auth-Type', ':=', 'Reject', ${nasIdentifier})
      `;

      // Move to isolir group
      await prisma.$executeRaw`
        DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
      `;
      await prisma.$executeRaw`
        INSERT INTO radusergroup (username, groupname, priority, nas_identifier)
        VALUES (${user.username}, 'isolir', 1, ${nasIdentifier})
      `;

      // Keep Cleartext-Password so user can still login to isolir profile
      await prisma.$executeRaw`
        INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
        VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}, ${nasIdentifier})
        ON DUPLICATE KEY UPDATE value = ${user.password}
      `;

      // Remove static IP (user gets IP from pool-isolir)
      await prisma.$executeRaw`
        DELETE FROM radreply WHERE username = ${user.username} AND attribute = 'Framed-IP-Address' AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
      `;

      // PPP secret: enable + change profile to 'isolir'
      if (user.router?.id && shouldManagePppSecretForSuspend(user.router.authMode)) {
        managePppSecret(user.router.id, 'enable', {
          username: user.username,
          password: user.password,
          profile: 'isolir',
        }).then((r) => {
          console.log(`[PaymentPromise DELETE] PPP secret isolir for ${user.username}: ${r.message}`);
        }).catch((e) => {
          console.error(`[PaymentPromise DELETE] PPP secret failed for ${user.username}:`, e?.message || e);
        });

        kickPppoeSession(user.router.id, user.username).then((kicked) => {
          console.log(`[PaymentPromise DELETE] Kicked ${kicked} session(s) for ${user.username}`);
        }).catch((e) => {
          console.error(`[PaymentPromise DELETE] Kick failed for ${user.username}:`, e?.message || e);
        });
      }

      // CoA disconnect to force re-auth
      try { await disconnectPPPoEUser(user.username); } catch { /* non-fatal */ }
    } catch (radiusErr: any) {
      console.error(`[PaymentPromise DELETE] RADIUS re-isolate error for ${user.username}:`, radiusErr?.message);
    }

    return NextResponse.json({
      success: true,
      message: 'Payment promise cancelled. User re-isolated.',
    });
  } catch (error: any) {
    console.error('[PaymentPromise DELETE] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
