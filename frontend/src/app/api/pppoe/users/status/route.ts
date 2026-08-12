import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { disconnectPPPoEUser } from '@/server/services/radius/coa-handler.service';
import { logActivity } from '@/server/services/activity-log.service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { managePppSecret, shouldManagePppSecretForSuspend } from '@/server/services/mikrotik/ppp-secret.service';
// sendIsolationNotification moved to NestJS backend — customer notifications handled by backend cron

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
        phone: true,
        email: true,
        expiredAt: true,
        profile: { select: { groupName: true } },
        router: { select: { id: true, nasname: true, authMode: true } },
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
    const nasIdentifier = user.router?.id || null;

    // Update RADIUS based on status
    if (status === 'active') {
      // Remove suspension markers
      await prisma.radcheck.deleteMany({
        where: {
          username: user.username,
          attribute: 'Auth-Type',
          ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}),
        },
      });
      // Remove NAS-IP-Address restriction (can prevent login if NAS-IP differs)
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

      // Restore to original profile
      // 1. Ensure password in radcheck
      await prisma.$executeRaw`
        INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
        VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}, ${nasIdentifier})
        ON DUPLICATE KEY UPDATE value = ${user.password}
      `;

      // 3. Restore to original group
      await prisma.$executeRaw`
        DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
      `;
      await prisma.$executeRaw`
        INSERT INTO radusergroup (username, groupname, priority, nas_identifier)
        VALUES (${user.username}, ${user.profile.groupName}, 1, ${nasIdentifier})
      `;

      // 4. Restore static IP if exists
      if (user.ipAddress) {
        await prisma.$executeRaw`
          INSERT INTO radreply (username, attribute, op, value, nas_identifier)
          VALUES (${user.username}, 'Framed-IP-Address', ':=', ${user.ipAddress}, ${nasIdentifier})
          ON DUPLICATE KEY UPDATE value = ${user.ipAddress}
        `;
      }
    } else if (status === 'isolated') {
      // Move to isolir group - MikroTik will apply isolir profile
      // Isolated users MUST still be able to login (to get isolir profile)
      // So we keep Cleartext-Password and just change the group.

      // Remove any existing suspension markers
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

      // 1. Keep password in radcheck
      await prisma.$executeRaw`
        INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
        VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}, ${nasIdentifier})
        ON DUPLICATE KEY UPDATE value = ${user.password}
      `;

      // 3. Move to isolir group (this maps to MikroTik profile 'isolir')
      await prisma.$executeRaw`
        DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
      `;
      await prisma.$executeRaw`
        INSERT INTO radusergroup (username, groupname, priority, nas_identifier)
        VALUES (${user.username}, 'isolir', 1, ${nasIdentifier})
      `;

      // 4. DELETE Framed-IP so user gets IP from MikroTik pool-isolir
      await prisma.$executeRaw`
        DELETE FROM radreply WHERE username = ${user.username} AND attribute = 'Framed-IP-Address' AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
      `;
    } else if (status === 'blocked') {
      // Block: Remove from all RADIUS tables
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
      // Stop subscription: Remove from all RADIUS tables (same as blocked but different intent)
      // User has voluntarily stopped subscription
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

    // Manage PPP Secret in MikroTik based on authMode (local/hybrid only — radius uses radcheck)
    // - active:   enable PPP secret (user can login normally)
    // - isolated: enable PPP secret (user still needs to login to get isolir profile)
    // - blocked:  disable PPP secret (prevent local fallback auth)
    // - stop:     disable PPP secret (prevent local fallback auth)
    if (user.router?.id && shouldManagePppSecretForSuspend(user.router.authMode)) {
      const action = (status === 'active' || status === 'isolated') ? 'enable' : 'disable';
      managePppSecret(user.router.id, action, { username: user.username, password: user.password }).then((r) => {
        console.log(`[PPP_SECRET] ${action} for "${user.username}" (status=${status}): ${r.message}`)
      }).catch((e) => {
        console.error(`[PPP_SECRET] ${action} failed for "${user.username}":`, e?.message || e)
      });
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

          // Customer isolation notification now handled by NestJS backend cron
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
