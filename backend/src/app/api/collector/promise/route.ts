import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyCollector } from '@/server/auth/collector-auth';
import { managePppSecret, kickPppoeSession, shouldManagePppSecretForSuspend } from '@/server/services/mikrotik/ppp-secret.service';
import { disconnectPPPoEUser } from '@/server/services/radius/coa-handler.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/collector/promise
 * Create a payment promise (janji bayar) from the field — GPS is mandatory
 * here (unlike the admin endpoint) since the whole point is proving the
 * collector actually visited the customer's location.
 * Body: { userId, promiseDate, notes?, invoiceId?, latitude, longitude }
 */
export async function POST(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { userId, promiseDate, notes, invoiceId, latitude, longitude } = body as {
      userId?: string;
      promiseDate?: string;
      notes?: string;
      invoiceId?: string;
      latitude?: number;
      longitude?: number;
    };

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (!promiseDate) {
      return NextResponse.json({ error: 'promiseDate is required' }, { status: 400 });
    }
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json({ error: 'Lokasi GPS wajib diisi — aktifkan izin lokasi di perangkat Anda' }, { status: 400 });
    }

    const promiseDateObj = new Date(promiseDate);
    if (isNaN(promiseDateObj.getTime())) {
      return NextResponse.json({ error: 'Invalid promiseDate' }, { status: 400 });
    }
    if (promiseDateObj <= new Date()) {
      return NextResponse.json({ error: 'Tanggal janji harus di masa depan' }, { status: 400 });
    }

    const user = await prisma.pppoeUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        password: true,
        ipAddress: true,
        status: true,
        areaId: true,
        profile: { select: { groupName: true } },
        router: { select: { id: true, authMode: true } },
      },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Ownership check: a collector may only act on customers in their own
    // assigned area — mirrors collector/mark-paid's guard.
    const collectorAccount = await prisma.adminUser.findUnique({
      where: { id: collector.id },
      select: { areaId: true },
    });
    if (!collectorAccount?.areaId || !user.areaId || user.areaId !== collectorAccount.areaId) {
      return NextResponse.json({ error: 'Pelanggan bukan di area Anda' }, { status: 403 });
    }

    // Check no existing active promise
    const existingActive = await prisma.paymentPromise.findFirst({
      where: { pppoeUserId: userId, status: 'active' },
    });
    if (existingActive) {
      return NextResponse.json(
        { error: 'Pelanggan sudah memiliki janji bayar aktif. Batalkan dahulu jika ingin membuat yang baru.' },
        { status: 409 }
      );
    }

    // Validate invoiceId if provided
    if (invoiceId) {
      const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice || invoice.userId !== userId) {
        return NextResponse.json({ error: 'Invalid invoiceId for this user' }, { status: 400 });
      }
    }

    const promise = await prisma.paymentPromise.create({
      data: {
        pppoeUserId: userId,
        invoiceId: invoiceId || null,
        promiseDate: promiseDateObj,
        notes: notes?.trim() || null,
        status: 'active',
        createdByAdminId: collector.id,
        createdByRole: 'collector',
        latitude,
        longitude,
      },
    });

    // If user is isolated, un-isolate them — same restoration as the admin
    // endpoint (customers.edit permission), since a field collector granting
    // this is the same business action.
    if (user.status === 'isolated') {
      const nasIdentifier = user.router?.id || null;

      await prisma.pppoeUser.update({ where: { id: userId }, data: { status: 'active' } });

      try {
        await prisma.radcheck.deleteMany({
          where: { username: user.username, attribute: 'Auth-Type', ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}) },
        });
        await prisma.radcheck.deleteMany({
          where: { username: user.username, attribute: 'NAS-IP-Address', ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}) },
        });
        await prisma.radreply.deleteMany({
          where: { username: user.username, attribute: 'Reply-Message', ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}) },
        });

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

        if (user.router?.id && shouldManagePppSecretForSuspend(user.router.authMode) && user.profile?.groupName) {
          managePppSecret(user.router.id, 'enable', {
            username: user.username,
            password: user.password,
            profile: user.profile.groupName,
          }).catch((e) => console.error(`[CollectorPromise] PPP secret restore failed for ${user.username}:`, e?.message || e));
          kickPppoeSession(user.router.id, user.username).catch((e) => console.error(`[CollectorPromise] Kick failed for ${user.username}:`, e?.message || e));
        }

        try { await disconnectPPPoEUser(user.username); } catch { /* non-fatal */ }
      } catch (radiusErr: any) {
        console.error(`[CollectorPromise] RADIUS restore error for ${user.username}:`, radiusErr?.message);
      }
    }

    return NextResponse.json(
      { success: true, message: 'Janji bayar tercatat dengan lokasi GPS. Akses internet dibuka hingga tanggal janji.', promise },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[CollectorPromise POST] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
