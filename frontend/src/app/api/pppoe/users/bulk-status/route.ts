import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { disconnectMultiplePPPoEUsers } from '@/server/services/radius/coa-handler.service';
import { managePppSecret, shouldManagePppSecretForSuspend } from '@/server/services/mikrotik/ppp-secret.service';

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
        router: { select: { id: true, nasname: true, authMode: true } },
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
      const nasIdentifier = user.router?.id || null;
      if (status === 'active') {
        // Remove suspension markers
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
      } else if (status === 'isolated') {
        // Isolated users MUST still be able to login (to get isolir profile)
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
          VALUES (${user.username}, 'isolir', 1, ${nasIdentifier})
        `;
        await prisma.$executeRaw`
          DELETE FROM radreply WHERE username = ${user.username} AND attribute = 'Framed-IP-Address' AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
        `;
      } else if (status === 'blocked') {
        await prisma.$executeRaw`
          DELETE FROM radcheck WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
        `;
        await prisma.$executeRaw`
          DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
        `;
        await prisma.$executeRaw`
          DELETE FROM radreply WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
        `;
      } else if (status === 'stop') {
        await prisma.$executeRaw`
          DELETE FROM radcheck WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
        `;
        await prisma.$executeRaw`
          DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
        `;
        await prisma.$executeRaw`
          DELETE FROM radreply WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
        `;
      }

      // Manage PPP secret for local/hybrid routers
      // - active/isolated: enable (user still needs to login)
      // - blocked/stop:    disable (prevent local fallback)
      if (user.router?.id && shouldManagePppSecretForSuspend(user.router.authMode)) {
        const action = (status === 'active' || status === 'isolated') ? 'enable' : 'disable';
        managePppSecret(user.router.id, action, { username: user.username, password: user.password }).then((r) => {
          console.log(`[PPP_SECRET] bulk ${action} for "${user.username}" (status=${status}): ${r.message}`)
        }).catch((e) => {
          console.error(`[PPP_SECRET] bulk ${action} failed for "${user.username}":`, e?.message || e)
        });
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
