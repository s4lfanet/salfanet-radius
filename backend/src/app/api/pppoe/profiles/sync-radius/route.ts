import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { reloadFreeRadius } from '@/server/services/radius/freeradius.service';

// POST - Sync a PPPoE profile to FreeRADIUS (radgroupreply / radgroupcheck)
export async function POST(request: NextRequest) {
  try {
    const authCheck = await requirePermission('customers.edit');
    if (!authCheck.authorized) return authCheck.response;

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Empty body — sync all profiles
    }
    const { id } = body;

    // If id provided, sync single profile; otherwise sync all
    const profiles = id
      ? await prisma.pppoeProfile.findMany({ where: { id } })
      : await prisma.pppoeProfile.findMany();

    if (profiles.length === 0) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    let syncedCount = 0;
    const errors: string[] = [];

    for (const profile of profiles) {

    const rateLimit = profile.rateLimit || `${profile.downloadSpeed}M/${profile.uploadSpeed}M`;
    const mikrotikProfileName = profile.groupName;

    // Upsert radgroupreply: Mikrotik-Group
    const existingGroup = await prisma.radgroupreply.findFirst({
      where: { groupname: profile.groupName, attribute: 'Mikrotik-Group' },
    });

    if (existingGroup) {
      await prisma.radgroupreply.update({
        where: { id: existingGroup.id },
        data: { value: mikrotikProfileName },
      });
    } else {
      await prisma.radgroupreply.create({
        data: {
          groupname: profile.groupName,
          attribute: 'Mikrotik-Group',
          op: ':=',
          value: mikrotikProfileName,
        },
      });
    }

    // Upsert radgroupreply: Mikrotik-Rate-Limit
    const existingRateLimit = await prisma.radgroupreply.findFirst({
      where: { groupname: profile.groupName, attribute: 'Mikrotik-Rate-Limit' },
    });

    if (existingRateLimit) {
      await prisma.radgroupreply.update({
        where: { id: existingRateLimit.id },
        data: { value: rateLimit },
      });
    } else {
      await prisma.radgroupreply.create({
        data: {
          groupname: profile.groupName,
          attribute: 'Mikrotik-Rate-Limit',
          op: ':=',
          value: rateLimit,
        },
      });
    }

    // Upsert radgroupreply: Pool-Name
    // Priority: 1) profile.radiusPoolName (explicit selection)  2) speed-tier fallback ({downloadSpeed}Mbps-Pool)
    // Only set if the pool exists in radippool table
    const downloadSpeed = profile.downloadSpeed || 10;
    const speedTierPoolName = `${downloadSpeed}Mbps-Pool`;
    const poolName = (profile as any).radiusPoolName || speedTierPoolName;

    // Verify pool exists in radippool before assigning
    const poolExists: Array<{ cnt: number }> = await prisma.$queryRaw`
      SELECT COUNT(*) as cnt FROM radippool WHERE pool_name = ${poolName}
    `;

    if (poolExists[0]?.cnt > 0) {
      const existingPool = await prisma.radgroupreply.findFirst({
        where: { groupname: profile.groupName, attribute: 'Pool-Name' },
      });

      if (existingPool) {
        await prisma.radgroupreply.update({
          where: { id: existingPool.id },
          data: { value: poolName },
        });
      } else {
        await prisma.radgroupreply.create({
          data: {
            groupname: profile.groupName,
            attribute: 'Pool-Name',
            op: ':=',
            value: poolName,
          },
        });
      }
    } else {
      // Pool doesn't exist — remove any stale Pool-Name mapping
      await prisma.radgroupreply.deleteMany({
        where: { groupname: profile.groupName, attribute: 'Pool-Name' },
      });
    }

    // Upsert radgroupcheck: Simultaneous-Use
    const existingSimUse = await prisma.radgroupcheck.findFirst({
      where: { groupname: profile.groupName, attribute: 'Simultaneous-Use' },
    });

    if (profile.sharedUser) {
      // sharedUser = true means allow multi-device → remove Simultaneous-Use restriction
      if (existingSimUse) {
        await prisma.radgroupcheck.delete({ where: { id: existingSimUse.id } });
      }
    } else {
      // sharedUser = false means 1 device only
      if (existingSimUse) {
        await prisma.radgroupcheck.update({
          where: { id: existingSimUse.id },
          data: { value: '1' },
        });
      } else {
        await prisma.radgroupcheck.create({
          data: {
            groupname: profile.groupName,
            attribute: 'Simultaneous-Use',
            op: ':=',
            value: '1',
          },
        });
      }
    }

    // Mark profile as synced
    await prisma.pppoeProfile.update({
      where: { id: profile.id },
      data: { syncedToRadius: true, lastSyncAt: new Date() },
    });
    syncedCount++;
    } // end for loop

    // Reload FreeRADIUS so profile changes take effect immediately
    try {
      await reloadFreeRadius();
    } catch (e) {
      console.warn('FreeRADIUS reload failed after profile sync:', e);
    }

    if (id) {
      return NextResponse.json({
        success: true,
        message: `Profile "${profiles[0].name}" berhasil disinkronkan ke FreeRADIUS`,
      });
    }

    return NextResponse.json({
      success: true,
      message: `${syncedCount} profile berhasil disinkronkan ke FreeRADIUS`,
      synced: syncedCount,
    });
  } catch (error) {
    console.error('Sync RADIUS error:', error);
    return NextResponse.json({ error: 'Gagal sinkronisasi ke FreeRADIUS' }, { status: 500 });
  }
}
