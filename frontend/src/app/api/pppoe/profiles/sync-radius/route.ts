import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// POST - Sync a PPPoE profile to FreeRADIUS (radgroupreply / radgroupcheck)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    const profile = await prisma.pppoeProfile.findUnique({ where: { id } }) as any;
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

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
    const updated = await prisma.pppoeProfile.update({
      where: { id },
      data: { syncedToRadius: true, lastSyncAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      message: `Profile "${profile.name}" berhasil disinkronkan ke FreeRADIUS`,
      profile: updated,
    });
  } catch (error) {
    console.error('Sync RADIUS error:', error);
    return NextResponse.json({ error: 'Gagal sinkronisasi ke FreeRADIUS' }, { status: 500 });
  }
}
