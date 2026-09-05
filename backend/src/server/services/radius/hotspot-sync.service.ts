import 'server-only'
import { prisma } from '@/server/db/client'

/**
 * Sync hotspot profile to RADIUS radgroupreply table
 */
export async function syncProfileToRadius(profileId: string) {
  try {
    const profile = await prisma.hotspotProfile.findUnique({
      where: { id: profileId }
    })

    if (!profile) {
      throw new Error('Profile not found')
    }

    const groupName = profile.groupProfile || `hs-${profile.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`

    // Delete existing entries for this group
    await prisma.radgroupreply.deleteMany({
      where: { groupname: groupName }
    })

    // Add rate-limit attribute
    await prisma.radgroupreply.create({
      data: {
        groupname: groupName,
        attribute: 'Mikrotik-Rate-Limit',
        op: ':=',
        value: profile.speed
      }
    })

    // Add shared-users attribute
    await prisma.radgroupreply.create({
      data: {
        groupname: groupName,
        attribute: 'Simultaneous-Use',
        op: ':=',
        value: profile.sharedUsers.toString()
      }
    })

    return { success: true, groupName }
  } catch (error) {
    console.error('Sync profile to RADIUS error:', error)
    throw error
  }
}

/**
 * Sync single voucher to RADIUS
 * Structure like production:
 * - radcheck: password only
 * - radusergroup: username -> unique group per voucher (hotspot-{profile}-{code})
 * - radgroupreply: unique group -> Mikrotik-Group + Rate-Limit + Session-Timeout
 * 
 * @param voucherIdOrCode - voucher ID or code (for direct sync with custom password)
 * @param customPassword - optional custom password (if different from username)
 * @param customGroupProfile - optional custom group profile
 * @param options - additional options like nasIpAddress, lockMac
 */
export async function syncVoucherToRadius(
  voucherIdOrCode: string, 
  customPassword?: string,
  customGroupProfile?: string,
  options?: { nasIpAddress?: string; lockMac?: boolean }
) {
  try {
    // Try to find by ID first, then by code
    let voucher = await prisma.hotspotVoucher.findUnique({
      where: { id: voucherIdOrCode },
      include: { profile: true, router: true }
    })

    if (!voucher) {
      voucher = await prisma.hotspotVoucher.findUnique({
        where: { code: voucherIdOrCode },
        include: { profile: true, router: true }
      })
    }

    if (!voucher) {
      throw new Error('Voucher not found')
    }

    // Generate unique group name per voucher: hotspot-{profileName}-{voucherCode}
    const profileName = voucher.profile.name.toLowerCase().replace(/[^a-z0-9]/g, '')
    const uniqueGroupName = `hotspot-${profileName}-${voucher.code}`
    
    // MikroTik profile name from groupProfile or use default
    const mikrotikProfile = customGroupProfile || voucher.profile.groupProfile || 'SALFANET'

    // Determine password: custom, voucher's separate password, or same as code
    const password = customPassword || voucher.password || voucher.code

    // 1. Add to radcheck (password only)
    // Note: NAS-IP-Address restriction via radcheck doesn't work in standard FreeRADIUS
    // Router restriction is stored in database for reference/filtering but not enforced at RADIUS level
    const existingRadcheck = await prisma.radcheck.findFirst({
      where: { username: voucher.code, attribute: 'Cleartext-Password', nas_identifier: null }
    })
    if (existingRadcheck) {
      await prisma.radcheck.update({
        where: { id: existingRadcheck.id },
        data: { value: password }
      })
    } else {
      await prisma.radcheck.create({
        data: {
          username: voucher.code,
          attribute: 'Cleartext-Password',
          op: ':=',
          value: password
        }
      })
    }

    // 2. Add to radusergroup (unique group per voucher)
    const existingRadusergroup = await prisma.radusergroup.findFirst({
      where: { username: voucher.code, groupname: uniqueGroupName, nas_identifier: null }
    })
    if (existingRadusergroup) {
      await prisma.radusergroup.update({
        where: { id: existingRadusergroup.id },
        data: { priority: 1 }
      })
    } else {
      await prisma.radusergroup.create({
        data: {
          username: voucher.code,
          groupname: uniqueGroupName,
          priority: 1
        }
      })
    }

    // 3. Create radgroupreply entries for this unique group
    // Delete old entries first
    await prisma.radgroupreply.deleteMany({
      where: { groupname: uniqueGroupName }
    })

    // Calculate session timeout in seconds
    let sessionTimeout = 0
    switch (voucher.profile.validityUnit) {
      case 'MINUTES':
        sessionTimeout = voucher.profile.validityValue * 60
        break
      case 'HOURS':
        sessionTimeout = voucher.profile.validityValue * 3600
        break
      case 'DAYS':
        sessionTimeout = voucher.profile.validityValue * 86400
        break
      case 'MONTHS':
        sessionTimeout = voucher.profile.validityValue * 30 * 86400
        break
    }

    // Add Mikrotik-Group (profile name in MikroTik)
    await prisma.radgroupreply.create({
      data: {
        groupname: uniqueGroupName,
        attribute: 'Mikrotik-Group',
        op: ':=',
        value: mikrotikProfile
      }
    })

    // Add Mikrotik-Rate-Limit
    await prisma.radgroupreply.create({
      data: {
        groupname: uniqueGroupName,
        attribute: 'Mikrotik-Rate-Limit',
        op: ':=',
        value: voucher.profile.speed
      }
    })

    // Add Session-Timeout
    await prisma.radgroupreply.create({
      data: {
        groupname: uniqueGroupName,
        attribute: 'Session-Timeout',
        op: ':=',
        value: sessionTimeout.toString()
      }
    })

    return { success: true, groupName: uniqueGroupName }
  } catch (error) {
    console.error('Sync voucher to RADIUS error:', error)
    throw error
  }
}

/**
 * Remove voucher from RADIUS
 * Also removes the unique radgroupreply entries
 */
export async function removeVoucherFromRadius(code: string) {
  try {
    // Get voucher to find group name
    const voucher = await prisma.hotspotVoucher.findUnique({
      where: { code },
      include: { profile: true }
    })

    if (voucher) {
      const profileName = voucher.profile.name.toLowerCase().replace(/[^a-z0-9]/g, '')
      const uniqueGroupName = `hotspot-${profileName}-${code}`
      
      // Remove from radgroupreply
      await prisma.radgroupreply.deleteMany({
        where: { groupname: uniqueGroupName }
      })
    }

    // Remove from radcheck
    await prisma.radcheck.deleteMany({
      where: { username: code }
    })

    // Remove from radusergroup
    await prisma.radusergroup.deleteMany({
      where: { username: code }
    })

    return { success: true }
  } catch (error) {
    console.error('Remove voucher from RADIUS error:', error)
    throw error
  }
}

/**
 * Sync voucher statuses from RADIUS radacct table.
 * For RADIUS-mode routers, active sessions are in radacct (acctstoptime IS NULL).
 * This updates voucher status to ACTIVE and sets firstLoginAt from acctstarttime.
 *
 * Also closes vouchers that were ACTIVE but no longer have an open radacct session
 * and whose expiresAt has passed.
 */
export async function syncVoucherStatusFromRadius(): Promise<{
  activated: number;
  expired: number;
  total: number;
  errors: string[];
}> {
  const errors: string[] = [];
  const now = new Date();

  try {
    // 1. Find all active radacct sessions (acctstoptime IS NULL) whose username
    //    matches a hotspot voucher code
    const activeRadacct = await prisma.radacct.findMany({
      where: {
        acctstoptime: null,
      },
      select: {
        username: true,
        acctstarttime: true,
        nasipaddress: true,
      },
    });

    if (activeRadacct.length === 0) {
      // No active RADIUS sessions — just expire old ACTIVE vouchers
      const expired = await prisma.hotspotVoucher.updateMany({
        where: {
          status: 'ACTIVE',
          expiresAt: { lt: now, not: null },
        },
        data: { status: 'EXPIRED' },
      });
      return { activated: 0, expired: expired.count, total: 0, errors };
    }

    const activeUsernames = new Set(activeRadacct.map((s) => s.username));
    const activeSessionMap = new Map<string, Date>();
    for (const s of activeRadacct) {
      const existing = activeSessionMap.get(s.username);
      if (!existing || (s.acctstarttime && new Date(s.acctstarttime) < existing)) {
        if (s.acctstarttime) activeSessionMap.set(s.username, new Date(s.acctstarttime));
      }
    }

    // 2. Find vouchers that match active radacct sessions
    const waitingOrActiveVouchers = await prisma.hotspotVoucher.findMany({
      where: {
        status: { in: ['WAITING', 'ACTIVE'] },
        code: { in: Array.from(activeUsernames) },
      },
      select: {
        id: true,
        code: true,
        status: true,
        firstLoginAt: true,
        expiresAt: true,
        profile: { select: { validityValue: true, validityUnit: true } },
      },
    });

    let activated = 0;
    for (const voucher of waitingOrActiveVouchers) {
      const sessionStart = activeSessionMap.get(voucher.code);
      if (!sessionStart) continue;

      const updateData: any = {};

      // Set firstLoginAt from radacct if not already set
      if (!voucher.firstLoginAt) {
        updateData.firstLoginAt = sessionStart;

        // Calculate expiresAt based on profile validity
        if (!voucher.expiresAt) {
          const { validityValue, validityUnit } = voucher.profile;
          let intervalMs = 0;
          switch (validityUnit) {
            case 'MINUTES': intervalMs = validityValue * 60 * 1000; break;
            case 'HOURS': intervalMs = validityValue * 60 * 60 * 1000; break;
            case 'DAYS': intervalMs = validityValue * 24 * 60 * 60 * 1000; break;
            case 'MONTHS': intervalMs = validityValue * 30 * 24 * 60 * 60 * 1000; break;
          }
          if (intervalMs > 0) {
            updateData.expiresAt = new Date(sessionStart.getTime() + intervalMs);
          }
        }
      }

      // Set status to ACTIVE
      if (voucher.status !== 'ACTIVE') {
        updateData.status = 'ACTIVE';
        activated++;
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.hotspotVoucher.update({
          where: { id: voucher.id },
          data: updateData,
        });
      }
    }

    // 3. Expire ACTIVE vouchers whose expiresAt has passed and are NOT in active radacct
    const expired = await prisma.hotspotVoucher.updateMany({
      where: {
        status: { in: ['WAITING', 'ACTIVE'] },
        expiresAt: { lt: now, not: null },
        code: { notIn: Array.from(activeUsernames) },
      },
      data: { status: 'EXPIRED' },
    });

    return {
      activated,
      expired: expired.count,
      total: waitingOrActiveVouchers.length,
      errors,
    };
  } catch (error: any) {
    errors.push(error?.message || 'Unknown error');
    return { activated: 0, expired: 0, total: 0, errors };
  }
}

/**
 * Sync batch of vouchers to RADIUS
 */
export async function syncBatchToRadius(batchCode: string) {
  try {
    const vouchers = await prisma.hotspotVoucher.findMany({
      where: { batchCode },
      include: { profile: true }
    })

    let successCount = 0
    const errors = []

    for (const voucher of vouchers) {
      try {
        await syncVoucherToRadius(voucher.id)
        successCount++
      } catch (error: any) {
        errors.push({ voucherId: voucher.id, error: error.message })
      }
    }

    return {
      total: vouchers.length,
      successCount,
      failedCount: errors.length,
      errors
    }
  } catch (error) {
    console.error('Sync batch to RADIUS error:', error)
    throw error
  }
}

