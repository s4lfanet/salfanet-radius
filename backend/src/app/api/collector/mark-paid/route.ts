import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyCollector } from '@/server/auth/collector-auth';
import { cancelPendingOntTasksForPaidUser } from '@/server/services/ont-removal-task.service';
import { nowWIB, toUTC } from '@/lib/timezone';
import { disconnectPPPoEUser } from '@/server/services/radius/coa-handler.service';
import { managePppSecret, shouldManagePppSecretForSuspend, kickPppoeSession } from '@/server/services/mikrotik/ppp-secret.service';

// POST - mark invoice as paid by collector
// Mirrors the payment webhook flow: records payment, extends expiry,
// reactivates the user (RADIUS restore + NAS-local secret/hotspot re-enable)
// so a cash-paying customer is immediately un-isolated.
export async function POST(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { invoiceId, paymentMethod, collectorProof } = await req.json();

    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        amount: true,
        userId: true,
        customerUsername: true,
        user: {
          select: {
            id: true,
            username: true,
            password: true,
            status: true,
            expiredAt: true,
            ipAddress: true,
            connectionType: true,
            areaId: true,
            routerId: true,
            profile: { select: { groupName: true, validityUnit: true, validityValue: true } },
            router: { select: { id: true, authMode: true } },
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice tidak ditemukan' }, { status: 404 });
    }

    if (invoice.status === 'PAID') {
      return NextResponse.json({ error: 'Invoice sudah lunas' }, { status: 400 });
    }

    const user = invoice.user;
    if (!user) {
      return NextResponse.json({ error: 'Invoice tidak terhubung ke pelanggan' }, { status: 400 });
    }

    // Ownership check: a collector may only settle invoices for customers in
    // their own assigned area — without this, any collector could mark any
    // customer's invoice as paid regardless of who they actually collect for.
    const collectorAccount = await prisma.adminUser.findUnique({
      where: { id: collector.id },
      select: { areaId: true },
    });

    if (
      !collectorAccount?.areaId ||
      !user.areaId ||
      user.areaId !== collectorAccount.areaId
    ) {
      return NextResponse.json({ error: 'Invoice bukan di area Anda' }, { status: 403 });
    }

    const method = paymentMethod || 'cash';

    // ─── Reactivation prep (mirror webhook flow) ─────────────────────────────
    const normalizedStatus = (user.status || '').toLowerCase();
    const wasDisabled = ['isolated', 'suspended', 'blocked', 'stop'].includes(normalizedStatus);
    const newStatus = wasDisabled ? 'active' : normalizedStatus || 'active';

    // Extend expiry by profile validity
    let newExpiredAt: Date | null = user.expiredAt;
    if (user.profile) {
      const now = nowWIB();
      let baseDate = user.expiredAt ? new Date(user.expiredAt) : now;
      if (baseDate < now) {
        baseDate = now;
      }
      newExpiredAt = new Date(baseDate);
      switch (user.profile.validityUnit) {
        case 'DAYS':
          newExpiredAt.setDate(newExpiredAt.getDate() + user.profile.validityValue);
          break;
        case 'MONTHS':
          newExpiredAt.setMonth(newExpiredAt.getMonth() + user.profile.validityValue);
          break;
        case 'HOURS':
          newExpiredAt.setHours(newExpiredAt.getHours() + user.profile.validityValue);
          break;
        case 'MINUTES':
          newExpiredAt.setMinutes(newExpiredAt.getMinutes() + user.profile.validityValue);
          break;
      }
      newExpiredAt = toUTC(newExpiredAt);
    }

    // Wrap invoice update + proof creation in a transaction so they
    // either both succeed or both roll back — prevents orphaned PAID
    // invoices with no proof record if the second write fails.
    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paidById: collector.id,
          paymentMethod: method,
          collectorProof: collectorProof || null,
        },
      });

      // For transfer payments with proof: create a pending paymentProof record for admin verification
      if (method === 'transfer' && collectorProof) {
        const existing = await tx.paymentProof.findFirst({
          where: { invoiceId, status: 'pending' },
        });

        if (!existing) {
          await tx.paymentProof.create({
            data: {
              invoiceId,
              username: invoice.customerUsername || '',
              amount: invoice.amount,
              proofImage: collectorProof,
              status: 'pending',
              collectorId: collector.id,
            },
          });
        }
      }

      // Payment record (idempotent — one record per invoice)
      const existingPayment = await tx.payment.findFirst({
        where: { invoiceId },
      });
      if (!existingPayment) {
        await tx.payment.create({
          data: {
            id: crypto.randomUUID(),
            invoiceId,
            amount: invoice.amount,
            method: `collector_${method}`,
            status: 'completed',
            paidAt: new Date(),
          },
        });
      }

      // Extend expiry + reactivate user status
      await tx.pppoeUser.update({
        where: { id: user.id },
        data: {
          expiredAt: newExpiredAt,
          status: newStatus,
        },
      });
    });

    if (invoice.customerUsername) {
      await cancelPendingOntTasksForPaidUser(invoice.customerUsername).catch(() => {});
    }

    // ─── Network restore (NAS local + RADIUS) — only when user was disabled ──
    if (wasDisabled && user.profile) {
      const nasIdentifier = user.routerId || null;
      try {
        // Remove forced reject / NAS-IP restriction from previous suspended state — scoped by nas_identifier
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

        // Restore radcheck (password) — with nas_identifier
        await prisma.$executeRaw`
          INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
          VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}, ${nasIdentifier})
          ON DUPLICATE KEY UPDATE value = ${user.password}
        `;

        // Restore radusergroup (remove 'isolir' row, insert real group) — scoped by nas_identifier
        await prisma.$executeRaw`
          DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
        `;
        await prisma.$executeRaw`
          INSERT INTO radusergroup (username, groupname, priority, nas_identifier)
          VALUES (${user.username}, ${user.profile.groupName}, 1, ${nasIdentifier})
          ON DUPLICATE KEY UPDATE groupname = ${user.profile.groupName}
        `;

        // Remove isolir reply message, restore static IP — scoped by nas_identifier
        await prisma.radreply.deleteMany({
          where: {
            username: user.username,
            attribute: 'Reply-Message',
            ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}),
          },
        });
        await prisma.$executeRaw`
          DELETE FROM radreply WHERE username = ${user.username} AND attribute = 'Framed-IP-Address' AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
        `;
        if (user.ipAddress) {
          await prisma.$executeRaw`
            INSERT INTO radreply (username, attribute, op, value, nas_identifier)
            VALUES (${user.username}, 'Framed-IP-Address', ':=', ${user.ipAddress}, ${nasIdentifier})
            ON DUPLICATE KEY UPDATE value = ${user.ipAddress}
          `;
        }

        // NAS local mode: re-enable PPP secret / hotspot user in MikroTik
        if (user.routerId && shouldManagePppSecretForSuspend(user.router?.authMode)) {
          if (user.connectionType === 'HOTSPOT') {
            const { manageHotspotUser, kickHotspotSession } = await import('@/server/services/mikrotik/arp-hotspot.service');
            manageHotspotUser(user.routerId, 'update', {
              username: user.username,
              password: user.password,
              disabled: false,
            }).catch((e: any) => {
              console.error(`[CollectorMarkPaid] Hotspot re-enable failed for ${user.username}:`, e?.message || e);
            });
            kickHotspotSession(user.routerId, user.username).catch((e: any) => {
              console.error(`[CollectorMarkPaid] Hotspot kick failed for ${user.username}:`, e?.message || e);
            });
          } else {
            managePppSecret(user.routerId, 'enable', {
              username: user.username,
              password: user.password,
              profile: user.profile.groupName,
            }).catch((e: any) => {
              console.error(`[CollectorMarkPaid] PPP secret restore failed for ${user.username}:`, e?.message || e);
            });
            kickPppoeSession(user.routerId, user.username).catch((e: any) => {
              console.error(`[CollectorMarkPaid] Kick failed for ${user.username}:`, e?.message || e);
            });
          }
        }

        // CoA disconnect so the user immediately reconnects with the restored profile
        const coaResult = await disconnectPPPoEUser(user.username);
        console.log(`[CollectorMarkPaid] RADIUS restored + CoA for ${user.username}:`, coaResult);
      } catch (restoreError: any) {
        // Non-fatal: invoice is paid, but network restore may need manual sync
        console.error('[CollectorMarkPaid] Network restore error (non-fatal):', restoreError?.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: method === 'transfer'
        ? 'Invoice ditandai lunas. Bukti transfer menunggu verifikasi admin.'
        : 'Invoice berhasil ditandai lunas',
    });
  } catch (error) {
    console.error('Mark paid error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
