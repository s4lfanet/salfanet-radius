import { NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { managePppSecret, kickPppoeSession } from '@/server/services/mikrotik/ppp-secret.service';
import { disconnectMultiplePPPoEUsers } from '@/server/services/radius/coa-handler.service';

/**
 * PUT /api/pppoe/users/bulk-update
 * Bulk update editable fields for multiple PPPoE users at once.
 *
 * Supported fields (all optional — only provided fields are updated):
 *   - routerId       (string | null)  : change NAS/router assignment
 *   - billingDay     (number 1-31)    : change due-date day for POSTPAID
 *   - autoIsolationEnabled (boolean)  : toggle auto-isolation on overdue
 *
 * Body: { userIds: string[], routerId?, billingDay?, autoIsolationEnabled? }
 */
export async function PUT(request: Request) {
  try {
    const authCheck = await requirePermission('customers.edit');
    if (!authCheck.authorized) return authCheck.response;
    const body = await request.json();
    const { userIds, routerId, billingDay, autoIsolationEnabled } = body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: 'Missing or invalid userIds' },
        { status: 400 }
      );
    }

    // At least one field must be provided
    const hasRouterChange = routerId !== undefined;
    const hasBillingDayChange = billingDay !== undefined;
    const hasAutoIsolationChange = autoIsolationEnabled !== undefined;

    if (!hasRouterChange && !hasBillingDayChange && !hasAutoIsolationChange) {
      return NextResponse.json(
        { error: 'No fields to update. Provide routerId, billingDay, or autoIsolationEnabled.' },
        { status: 400 }
      );
    }

    // Validate billingDay
    if (hasBillingDayChange) {
      const bd = parseInt(String(billingDay), 10);
      if (isNaN(bd) || bd < 1 || bd > 31) {
        return NextResponse.json(
          { error: 'billingDay must be between 1 and 31' },
          { status: 400 }
        );
      }
    }

    // Validate routerId if provided
    if (hasRouterChange && routerId) {
      const router = await prisma.router.findUnique({ where: { id: routerId } });
      if (!router) {
        return NextResponse.json(
          { error: 'Router not found' },
          { status: 404 }
        );
      }
    }

    // Fetch affected users (with current router info for RADIUS sync)
    const users = await prisma.pppoeUser.findMany({
      where: { id: { in: userIds } },
      include: {
        profile: true,
        router: { select: { id: true, authMode: true } },
      },
    });

    if (users.length === 0) {
      return NextResponse.json(
        { error: 'No users found' },
        { status: 404 }
      );
    }

    // Build update data — only include provided fields
    const updateData: Record<string, unknown> = {};
    if (hasRouterChange) {
      updateData.routerId = routerId || null;
    }
    if (hasBillingDayChange) {
      updateData.billingDay = Math.min(Math.max(parseInt(String(billingDay), 10), 1), 28);
    }
    if (hasAutoIsolationChange) {
      updateData.autoIsolationEnabled = !!autoIsolationEnabled;
    }

    // Update all users in bulk
    await prisma.pppoeUser.updateMany({
      where: { id: { in: userIds } },
      data: updateData,
    });

    // If router changed, sync RADIUS and MikroTik for affected users
    if (hasRouterChange) {
      for (const user of users) {
        const newRouterId = routerId || null;
        const oldNasIdentifier = user.routerId || null;
        const newNasIdentifier = newRouterId;

        // Only sync if router actually changed
        if (oldNasIdentifier === newNasIdentifier) continue;

        // Remove old RADIUS entries from previous NAS
        await prisma.$executeRaw`
          DELETE FROM radcheck WHERE username = ${user.username} AND (${oldNasIdentifier} IS NULL OR nas_identifier = ${oldNasIdentifier})
        `;
        await prisma.$executeRaw`
          DELETE FROM radusergroup WHERE username = ${user.username} AND (${oldNasIdentifier} IS NULL OR nas_identifier = ${oldNasIdentifier})
        `;
        await prisma.$executeRaw`
          DELETE FROM radreply WHERE username = ${user.username} AND (${oldNasIdentifier} IS NULL OR nas_identifier = ${oldNasIdentifier})
        `;

        // Re-create RADIUS entries on new NAS (only if user is active or isolated)
        if (user.status === 'active' || user.status === 'isolated') {
          const groupName = user.status === 'isolated' ? 'isolir' : (user.profile?.groupName || null);

          await prisma.$executeRaw`
            INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
            VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}, ${newNasIdentifier})
            ON DUPLICATE KEY UPDATE value = ${user.password}
          `;
          if (groupName) {
            await prisma.$executeRaw`
              INSERT INTO radusergroup (username, groupname, priority, nas_identifier)
              VALUES (${user.username}, ${groupName}, 1, ${newNasIdentifier})
            `;
          }
          if (user.ipAddress) {
            await prisma.$executeRaw`
              INSERT INTO radreply (username, attribute, op, value, nas_identifier)
              VALUES (${user.username}, 'Framed-IP-Address', ':=', ${user.ipAddress}, ${newNasIdentifier})
              ON DUPLICATE KEY UPDATE value = ${user.ipAddress}
            `;
          }
        }

        // Manage PPP secret on old router (disable) and new router (enable)
        const connType = user.connectionType || 'PPPOE';
        if (connType === 'HOTSPOT') {
          // Disable on old router
          if (user.router?.id) {
            try {
              const { manageHotspotUser } = await import('@/server/services/mikrotik/arp-hotspot.service');
              await manageHotspotUser(user.router.id, 'update', {
                username: user.username,
                password: user.password,
                disabled: true,
                comment: `Salfanet-${user.id.slice(0, 8)}`,
              });
            } catch (e: any) {
              console.error(`[BULK_UPDATE] hotspot disable old router failed for "${user.username}":`, e?.message || e);
            }
          }
          // Enable on new router
          if (newRouterId) {
            try {
              const { manageHotspotUser } = await import('@/server/services/mikrotik/arp-hotspot.service');
              await manageHotspotUser(newRouterId, 'update', {
                username: user.username,
                password: user.password,
                disabled: user.status === 'blocked' || user.status === 'stop',
                comment: `Salfanet-${user.id.slice(0, 8)}`,
              });
            } catch (e: any) {
              console.error(`[BULK_UPDATE] hotspot enable new router failed for "${user.username}":`, e?.message || e);
            }
          }
        } else {
          // PPPoE secret
          // Disable on old router
          if (user.router?.id && user.router.authMode === 'LOCAL') {
            try {
              await managePppSecret(user.router.id, 'disable', {
                username: user.username,
                password: user.password,
                comment: `Salfanet-${user.id.slice(0, 8)}`,
              });
            } catch (e: any) {
              console.error(`[BULK_UPDATE] ppp secret disable old router failed for "${user.username}":`, e?.message || e);
            }
          }
          // Enable on new router
          if (newRouterId) {
            try {
              const newRouter = await prisma.router.findUnique({ where: { id: newRouterId }, select: { authMode: true } });
              if (newRouter?.authMode === 'LOCAL') {
                const profile = user.status === 'isolated' ? 'isolir' : (user.profile?.groupName || undefined);
                const action = user.status === 'blocked' || user.status === 'stop' ? 'disable' : 'enable';
                await managePppSecret(newRouterId, action, {
                  username: user.username,
                  password: user.password,
                  profile,
                  comment: `Salfanet-${user.id.slice(0, 8)}`,
                });
              }
            } catch (e: any) {
              console.error(`[BULK_UPDATE] ppp secret enable new router failed for "${user.username}":`, e?.message || e);
            }
          }
        }
      }

      // Send CoA disconnect to all affected users
      const usernames = users.map(u => u.username);
      try {
        const coaResult = await disconnectMultiplePPPoEUsers(usernames);
        console.log(`[Bulk Update] CoA disconnect result:`, coaResult);
      } catch (e) {
        console.error(`[Bulk Update] CoA disconnect failed:`, e);
      }
    }

    const updatedFields: string[] = [];
    if (hasRouterChange) updatedFields.push('routerId');
    if (hasBillingDayChange) updatedFields.push('billingDay');
    if (hasAutoIsolationChange) updatedFields.push('autoIsolationEnabled');

    return NextResponse.json({
      success: true,
      updated: users.length,
      fields: updatedFields,
    });
  } catch (error) {
    console.error('Bulk update error:', error);
    return NextResponse.json(
      { error: 'Failed to update users' },
      { status: 500 }
    );
  }
}
