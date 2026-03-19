import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { disconnectPPPoEUser } from '@/server/services/radius/coa-handler.service';
import { logActivity } from '@/server/services/activity-log.service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

export async function PUT(request: Request) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, status } = await request.json();

    if (!userId || !status) {
      return NextResponse.json(
        { error: 'Missing userId or status' },
        { status: 400 }
      );
    }

    if (!['active', 'isolated', 'blocked', 'stop'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be: active, isolated, blocked, or stop' },
        { status: 400 }
      );
    }

    // Get current user data for comparison
    const currentUser = await prisma.pppoeUser.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        username: true, 
        name: true, 
        status: true,
        password: true,
        ipAddress: true,
        profile: { select: { groupName: true } },
        router: { select: { id: true, nasname: true } },
      },
    });

    if (!currentUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const oldStatus = currentUser.status;

    // Update user status in database
    const updatedUser = await prisma.pppoeUser.update({
      where: { id: userId },
      data: { status },
    });

    // Use current user data for RADIUS operations
    const user = currentUser;

    // Update RADIUS based on status
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

    // Send CoA disconnect to force user to re-authenticate with new config
    const coaResult = await disconnectPPPoEUser(user.username);
    console.log(`[Status Change] CoA disconnect result for ${user.username}:`, coaResult);

    // Log activity
    await logActivity({
      username: session.user?.email || 'system',
      userRole: session.user?.role || 'unknown',
      action: 'status_change',
      description: `Changed user ${user.username} status from ${oldStatus} to ${status}`,
      module: 'pppoe',
      status: 'success',
      metadata: {
        userId: user.id,
        username: user.username,
        name: user.name,
        oldStatus,
        newStatus: status,
      },
      request: request as any,
    });

    // Create notification for status change (only if status actually changed)
    if (oldStatus !== status) {
      try {
        const { NotificationService } = await import('@/server/services/notifications/dispatcher.service');
        
        if (status === 'isolated') {
          await NotificationService.notifyUserIsolated({
            username: user.username,
            name: user.name || undefined,
            reason: 'manual isolation'
          });
        } else if (status === 'active' && (oldStatus === 'isolated' || oldStatus === 'blocked')) {
          await NotificationService.notifyUserReactivated({
            username: user.username,
            name: user.name || undefined,
          });
        } else {
          await NotificationService.notifyUserStatusChange({
            username: user.username,
            name: user.name || undefined,
            oldStatus,
            newStatus: status
          });
        }
      } catch (notifError: any) {
        console.error(`[Status Change] Failed to create notification for ${user.username}:`, notifError.message);
      }
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
      coa: coaResult,
    });
  } catch (error) {
    console.error('Status change error:', error);
    return NextResponse.json(
      { error: 'Failed to change status' },
      { status: 500 }
    );
  }
}
