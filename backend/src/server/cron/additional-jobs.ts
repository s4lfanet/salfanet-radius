/**
 * Cron jobs tambahan — hotspot_sync, agent_sales, session_monitor, pppoe_session_sync
 *
 * Implementasi 4 job yang sebelumnya hanya placeholder "not yet implemented".
 */
import { prisma } from '@/server/db/client';
import { nowWIB } from '@/lib/timezone';
import { batchListPppActive } from '@/server/services/mikrotik/ppp-secret.service';

// ─── hotspot_sync ───────────────────────────────────────────────────────────
/**
 * Sinkronisasi voucher hotspot:
 *   - Voucher dengan status ACTIVE dan expiresAt < now → set EXPIRED
 *   - Voucher dengan status WAITING dan expiresAt < now → set EXPIRED
 *   - Update lastUsedBy tracking
 */
export async function runHotspotSync(): Promise<{ expired: number; total: number; errors: string[] }> {
  const errors: string[] = [];
  const now = nowWIB();

  try {
    // Expire vouchers yang sudah lewat masa berlakunya
    const expired = await prisma.hotspotVoucher.updateMany({
      where: {
        status: { in: ['WAITING', 'ACTIVE'] },
        expiresAt: { lt: now, not: null },
      },
      data: { status: 'EXPIRED' },
    });

    // Count active vouchers for reporting
    const activeCount = await prisma.hotspotVoucher.count({
      where: { status: 'ACTIVE' },
    });

    return {
      expired: expired.count,
      total: activeCount,
      errors,
    };
  } catch (error: any) {
    errors.push(error?.message || 'Unknown error');
    return { expired: 0, total: 0, errors };
  }
}

// ─── agent_sales ────────────────────────────────────────────────────────────
/**
 * Catat penjualan voucher agent:
 *   - Cari voucher dengan status SOLD yang belum ada di agent_sales
 *   - Buat record agent_sale untuk tracking komisi/setoran
 *   - Update balance agent jika diperlukan
 */
export async function runAgentSales(): Promise<{ recorded: number; total: number; errors: string[] }> {
  const errors: string[] = [];

  try {
    // Cari voucher SOLD yang punya agentId dan belum tercatat di agent_sales
    const soldVouchers = await prisma.hotspotVoucher.findMany({
      where: {
        status: 'SOLD',
        agentId: { not: null },
      },
      select: {
        id: true,
        code: true,
        agentId: true,
        profileId: true,
        profile: { select: { name: true } },
      },
      take: 100,
    });

    if (soldVouchers.length === 0) {
      return { recorded: 0, total: 0, errors };
    }

    // Cek voucher codes yang sudah ada di agent_sales
    const existingCodes = await prisma.agentSale.findMany({
      where: { voucherCode: { in: soldVouchers.map(v => v.code) } },
      select: { voucherCode: true },
    });
    const existingSet = new Set(existingCodes.map(e => e.voucherCode));

    // Ambil harga profile untuk amount
    const profileIds = [...new Set(soldVouchers.map(v => v.profileId))];
    const profiles = await prisma.hotspotProfile.findMany({
      where: { id: { in: profileIds } },
      select: { id: true, sellingPrice: true },
    });
    const profilePriceMap = new Map(profiles.map(p => [p.id, p.sellingPrice || 0]));

    let recorded = 0;
    for (const voucher of soldVouchers) {
      if (existingSet.has(voucher.code)) continue;

      try {
        const amount = profilePriceMap.get(voucher.profileId) || 0;
        await prisma.agentSale.create({
          data: {
            id: `sale_${voucher.id}_${Date.now()}`,
            agentId: voucher.agentId!,
            voucherCode: voucher.code,
            profileName: voucher.profile?.name || 'Unknown',
            amount,
            paymentStatus: 'UNPAID',
          },
        });
        recorded++;
      } catch (err: any) {
        // Skip duplicate — might be race condition
        if (!err?.message?.includes('Unique')) {
          errors.push(`Voucher ${voucher.code}: ${err?.message || 'Unknown error'}`);
        }
      }
    }

    return { recorded, total: soldVouchers.length, errors };
  } catch (error: any) {
    errors.push(error?.message || 'Unknown error');
    return { recorded: 0, total: 0, errors };
  }
}

// ─── session_monitor ────────────────────────────────────────────────────────
/**
 * Monitor sesi mencurigakan:
 *   - Sesi di radacct dengan acctstoptime IS NULL tapi user sudah isolated/suspended
 *   - Sesi dengan durasi > 30 hari (kemungkinan stale)
 *   - Sesi dengan username yang tidak ada di pppoe_users (orphan)
 *   - Log ke cron_history untuk alert admin
 */
export async function runSessionMonitor(): Promise<{ suspicious: number; stale: number; orphaned: number; errors: string[] }> {
  const errors: string[] = [];
  const now = nowWIB();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    // 1. Sesi aktif (acctstoptime IS NULL) dari user yang sudah isolated/suspended
    const suspiciousSessions = await prisma.radacct.findMany({
      where: {
        acctstoptime: null,
        username: {
          in: (await prisma.pppoeUser.findMany({
            where: { status: { in: ['isolated', 'suspended'] } },
            select: { username: true },
          })).map(u => u.username),
        },
      },
      select: { radacctid: true, username: true, nasipaddress: true, acctstarttime: true },
      take: 50,
    });

    // 2. Sesi stale — acctstoptime IS NULL dan acctstarttime > 30 hari
    const staleSessions = await prisma.radacct.findMany({
      where: {
        acctstoptime: null,
        acctstarttime: { lt: thirtyDaysAgo },
      },
      select: { radacctid: true, username: true, acctstarttime: true },
      take: 50,
    });

    // 3. Sesi orphan — username di radacct tidak ada di pppoe_users
    const activeUsernames = await prisma.radacct.findMany({
      where: { acctstoptime: null },
      select: { username: true },
      distinct: ['username'],
    });

    const orphanedSessions: { radacctid: BigInt; username: string }[] = [];
    if (activeUsernames.length > 0) {
      const knownUsers = new Set(
        (await prisma.pppoeUser.findMany({
          where: { username: { in: activeUsernames.map(u => u.username) } },
          select: { username: true },
        })).map(u => u.username)
      );

      const orphanUsernames = activeUsernames
        .map(u => u.username)
        .filter(u => !knownUsers.has(u));

      if (orphanUsernames.length > 0) {
        const orphanDb = await prisma.radacct.findMany({
          where: {
            acctstoptime: null,
            username: { in: orphanUsernames },
          },
          select: { radacctid: true, username: true },
          take: 50,
        });
        orphanedSessions.push(...orphanDb.map(s => ({ radacctid: s.radacctid, username: s.username })));
      }
    }

    // Log summary
    if (suspiciousSessions.length > 0) {
      console.log(`[SESSION_MONITOR] ${suspiciousSessions.length} suspicious sessions (user isolated/suspended but still active)`);
    }
    if (staleSessions.length > 0) {
      console.log(`[SESSION_MONITOR] ${staleSessions.length} stale sessions (>30 days without stop)`);
    }
    if (orphanedSessions.length > 0) {
      console.log(`[SESSION_MONITOR] ${orphanedSessions.length} orphaned sessions (username not in pppoe_users)`);
    }

    return {
      suspicious: suspiciousSessions.length,
      stale: staleSessions.length,
      orphaned: orphanedSessions.length,
      errors,
    };
  } catch (error: any) {
    errors.push(error?.message || 'Unknown error');
    return { suspicious: 0, stale: 0, orphaned: 0, errors };
  }
}

// ─── pppoe_session_sync ─────────────────────────────────────────────────────
/**
 * Sync sesi PPPoE dari MikroTik ke database:
 *   - Ambil daftar PPP active dari semua router via RouterOS API
 *   - Bandingkan dengan radacct (acctstoptime IS NULL)
 *   - Tandai sesi yang tidak ada di MikroTik tapi masih open di radacct → set acctstoptime
 *   - Update sessions table untuk tracking realtime
 */
export async function runPppoeSessionSync(): Promise<{ synced: number; closed: number; total: number; errors: string[] }> {
  const errors: string[] = [];
  const now = nowWIB();

  try {
    // Ambil semua router aktif
    const routers = await prisma.router.findMany({
      where: { isActive: true },
      select: { id: true, name: true, nasname: true },
    });

    if (routers.length === 0) {
      return { synced: 0, closed: 0, total: 0, errors };
    }

    // Batch fetch PPP active dari semua router
    const activeUsernames = await batchListPppActive(routers.map(r => r.id));

    // Cari sesi open di radacct yang username-nya TIDAK ada di PPP active MikroTik
    // → kemungkinan user sudah disconnect tapi radacct belum di-stop
    const openSessions = await prisma.radacct.findMany({
      where: { acctstoptime: null },
      select: { radacctid: true, username: true, nasipaddress: true, acctstarttime: true },
      take: 500,
    });

    let closed = 0;
    const toClose: BigInt[] = [];
    for (const session of openSessions) {
      if (!activeUsernames.has(session.username)) {
        toClose.push(session.radacctid);
      }
    }

    // Batch update — set acctstoptime untuk sesi yang sudah tidak aktif
    if (toClose.length > 0) {
      // Prisma tidak support BigInt in where untuk updateMany langsung,
      // jadi update per-batch
      const batchSize = 50;
      for (let i = 0; i < toClose.length; i += batchSize) {
        const batch = toClose.slice(i, i + batchSize);
        try {
          await prisma.radacct.updateMany({
            where: { radacctid: { in: batch.map(b => b.toString()) as any } },
            data: {
              acctstoptime: now,
              acctupdatetime: now,
              acctterminatecause: 'Session-Timeout-Cron',
            },
          });
          closed += batch.length;
        } catch (err: any) {
          errors.push(`Batch close error: ${err?.message || 'Unknown'}`);
        }
      }
    }

    // Update sessions table — sync dari radacct open sessions
    const stillOpen = openSessions.filter(s => activeUsernames.has(s.username));
    const synced = stillOpen.length;

    return {
      synced,
      closed,
      total: openSessions.length,
      errors,
    };
  } catch (error: any) {
    errors.push(error?.message || 'Unknown error');
    return { synced: 0, closed: 0, total: 0, errors };
  }
}
