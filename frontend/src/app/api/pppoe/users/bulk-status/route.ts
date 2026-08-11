import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { disconnectMultiplePPPoEUsers } from '@/server/services/radius/coa-handler.service';

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { userIds, status } = await request.json();

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: 'Missing or invalid userIds' },
        { status: 400 }
      );
    }

    if (!status || !['active', 'isolated', 'blocked', 'stop'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be: active, isolated, blocked, or stop' },
        { status: 400 }
      );
    }

    // Get all users with router info
    const users = await prisma.pppoeUser.findMany({
      where: { id: { in: userIds } },
      include: { 
        profile: true,
        router: { select: { id: true, nasname: true } },
      },
    });

    if (users.length === 0) {
      return NextResponse.json(
        { error: 'No users found' },
        { status: 404 }
      );
    }

    // Update all users status
    await prisma.pppoeUser.updateMany({
      where: { id: { in: userIds } },
      data: { status },
    });

    // Update RADIUS for each user based on status
    for (const user of users) {
      if (status === 'active') {
        // Remove suspension markers
        await prisma.radcheck.deleteMany({
          where: {
            username: user.username,
            attribute: 'Auth-Type',
          },
        });
        // Remove NAS-IP-Address restriction (can prevent login if NAS-IP differs)
        await prisma.radcheck.deleteMany({
          where: {
            username: user.username,
            attribute: 'NAS-IP-Address',
          },
        });
        await prisma.radreply.deleteMany({
          where: {
            username: user.username,
            attribute: 'Reply-Message',
          },
        });

        // Restore to original profile
        // 1. Ensure password in radcheck
        await prisma.$executeRaw`
          INSERT INTO radcheck (username, attribute, op, value)
          VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password})
          ON DUPLICATE KEY UPDATE value = ${user.password}
        `;

        // 3. Restore to original group
        await prisma.$executeRaw`
          DELETE FROM radusergroup WHERE username = ${user.username}
        `;
        await prisma.$executeRaw`
          INSERT INTO radusergroup (username, groupname, priority)
          VALUES (${user.username}, ${user.profile.groupName}, 1)
        `;

        // 4. Restore static IP if exists
        if (user.ipAddress) {
          await prisma.$executeRaw`
            INSERT INTO radreply (username, attribute, op, value)
            VALUES (${user.username}, 'Framed-IP-Address', ':=', ${user.ipAddress})
            ON DUPLICATE KEY UPDATE value = ${user.ipAddress}
          `;
        }
      } else if (status === 'isolated') {
        // Move to isolir group - MikroTik will apply isolir profile
        // Remove static IP so user gets IP from MikroTik pool-isolir

        // Remove suspension markers (isolated users must still be able to login)
        await prisma.radcheck.deleteMany({
          where: {
            username: user.username,
            attribute: 'Auth-Type',
          },
        });
        // Remove NAS-IP-Address restriction (can prevent login if NAS-IP differs)
        await prisma.radcheck.deleteMany({
          where: {
            username: user.username,
            attribute: 'NAS-IP-Address',
          },
        });
        await prisma.radreply.deleteMany({
          where: {
            username: user.username,
            attribute: 'Reply-Message',
          },
        });
        
        // 1. Keep password in radcheck
        await prisma.$executeRaw`
          INSERT INTO radcheck (username, attribute, op, value)
          VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password})
          ON DUPLICATE KEY UPDATE value = ${user.password}
        `;

        // 3. Move to isolir group (this maps to MikroTik profile 'isolir')
        await prisma.$executeRaw`
          DELETE FROM radusergroup WHERE username = ${user.username}
        `;
        await prisma.$executeRaw`
          INSERT INTO radusergroup (username, groupname, priority)
          VALUES (${user.username}, 'isolir', 1)
        `;

        // 4. DELETE Framed-IP so user gets IP from MikroTik pool-isolir
        await prisma.$executeRaw`
          DELETE FROM radreply WHERE username = ${user.username} AND attribute = 'Framed-IP-Address'
        `;
      } else if (status === 'blocked') {
        // Block: Remove from all RADIUS tables
        await prisma.$executeRaw`
          DELETE FROM radcheck WHERE username = ${user.username}
        `;
        await prisma.$executeRaw`
          DELETE FROM radusergroup WHERE username = ${user.username}
        `;
        await prisma.$executeRaw`
          DELETE FROM radreply WHERE username = ${user.username}
        `;
      } else if (status === 'stop') {
        // Stop subscription: Remove from all RADIUS tables (same as blocked but different intent)
        // User has voluntarily stopped subscription
        await prisma.$executeRaw`
          DELETE FROM radcheck WHERE username = ${user.username}
        `;
        await prisma.$executeRaw`
          DELETE FROM radusergroup WHERE username = ${user.username}
        `;
        await prisma.$executeRaw`
          DELETE FROM radreply WHERE username = ${user.username}
        `;
      }
    }

    // Send CoA disconnect to all affected users
    const usernames = users.map(u => u.username);
    const coaResult = await disconnectMultiplePPPoEUsers(usernames);
    console.log(`[Bulk Status Change] CoA disconnect result:`, coaResult);

    return NextResponse.json({
      success: true,
      updated: users.length,
      status,
      coa: coaResult,
    });
  } catch (error) {
    console.error('Bulk status change error:', error);
    return NextResponse.json(
      { error: 'Failed to update status' },
      { status: 500 }
    );
  }
}
