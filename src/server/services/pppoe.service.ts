/**
 * PPPoE User service â€” business logic extracted from route handlers.
 * All DB mutations, RADIUS sync, notifications and activity logging live here.
 */

import { prisma } from '@/server/db/client';
import { logActivity } from '@/server/services/activity-log.service';
import { sendAdminCreateUser } from '@/server/services/notifications/whatsapp-templates.service';
import { changePPPoERateLimit } from '@/server/services/mikrotik/rate-limit';
import { redisDel, RedisKeys } from '@/server/cache/redis';
import { generateUniqueReferralCode } from '@/server/services/referral.service';
import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface CreatePppoeUserInput {
  username: string;
  password: string;
  profileId: string;
  routerId?: string;
  areaId?: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  latitude?: string | number;
  longitude?: string | number;
  ipAddress?: string;
  macAddress?: string;
  comment?: string;
  expiredAt?: string;
  subscriptionType?: string;
  billingDay?: string | number;
  idCardNumber?: string;
  idCardPhoto?: string;
  installationPhotos?: unknown;
  followRoad?: boolean;
}

export interface UpdatePppoeUserInput {
  id: string;
  username?: string;
  password?: string;
  profileId?: string;
  routerId?: string | null;
  areaId?: string | null;
  name?: string;
  phone?: string;
  email?: string | null;
  address?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  ipAddress?: string | null;
  macAddress?: string | null;
  comment?: string | null;
  expiredAt?: string;
  status?: string;
  subscriptionType?: string;
  billingDay?: string | number;
  autoRenewal?: boolean;
  idCardNumber?: string | null;
  idCardPhoto?: string | null;
  installationPhotos?: unknown;
  followRoad?: boolean;
}

// â”€â”€â”€ List â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function listPppoeUsers(params: { status?: string | null }) {
  const whereClause: Record<string, unknown> = {};
  if (params.status) {
    whereClause.status = params.status;
  } else {
    whereClause.status = { not: 'stop' };
  }

  const users = await prisma.pppoeUser.findMany({
    where: whereClause,
    include: {
      profile: true,
      router: true,
      area: true,
      odpAssignment: { include: { odp: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Batch fetch all active sessions in ONE query instead of N queries (N+1 fix)
  const usernames = users.map(u => u.username);
  const activeSessions = usernames.length > 0
    ? await prisma.radacct.findMany({
        where: { username: { in: usernames }, acctstoptime: null },
        select: { username: true },
      })
    : [];
  const onlineSet = new Set(activeSessions.map(s => s.username));

  return users.map(user => ({ ...user, isOnline: onlineSet.has(user.username) }));
}

// â”€â”€â”€ Get one â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getPppoeUserById(id: string) {
  const user = await prisma.pppoeUser.findUnique({
    where: { id },
    include: {
      profile: true,
      router: true,
      area: { select: { id: true, name: true } },
    },
  });

  if (!user) return null;

  const activeSession = await prisma.radacct.findFirst({
    where: { username: user.username, acctstoptime: null },
    orderBy: { acctstarttime: 'desc' },
    select: {
      radacctid: true,
      acctstarttime: true,
      framedipaddress: true,
      nasipaddress: true,
      callingstationid: true,
      acctinputoctets: true,
      acctoutputoctets: true,
      acctsessiontime: true,
    },
  });

  return { user, activeSession };
}

// â”€â”€â”€ Create â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function createPppoeUser(
  data: CreatePppoeUserInput,
  session: Session | null,
  request: NextRequest
) {
  const {
    username, password, profileId, routerId, areaId, name, phone,
    email, address, latitude, longitude, ipAddress, macAddress, comment,
    expiredAt, subscriptionType, billingDay, idCardNumber, idCardPhoto,
    installationPhotos, followRoad,
  } = data;

  // Check duplicate
  const existingUser = await prisma.pppoeUser.findUnique({ where: { username } });
  if (existingUser) {
    throw Object.assign(new Error(`Username "${username}" already exists`), { code: 'DUPLICATE_USERNAME' });
  }

  // Generate unique 8-digit customer ID
  let customerId = '';
  let isUnique = false;
  while (!isUnique) {
    customerId = Math.floor(10000000 + Math.random() * 90000000).toString();
    const existing = await prisma.pppoeUser.findUnique({ where: { customerId } });
    if (!existing) isUnique = true;
  }

  // Load profile
  const profile = await prisma.pppoeProfile.findUnique({ where: { id: profileId } });
  if (!profile) throw Object.assign(new Error('Profile not found'), { code: 'NOT_FOUND' });

  // Calculate expiredAt
  const now = new Date();
  let finalExpiredAt: Date;
  if (subscriptionType === 'POSTPAID') {
    finalExpiredAt = new Date(now);
    finalExpiredAt.setMonth(finalExpiredAt.getMonth() + 1);
    const validBillingDay = billingDay ? Math.min(Math.max(parseInt(String(billingDay)), 1), 31) : 1;
    finalExpiredAt.setDate(validBillingDay);
    finalExpiredAt.setHours(23, 59, 59, 999);
  } else {
    if (expiredAt) {
      finalExpiredAt = new Date(expiredAt);
    } else {
      finalExpiredAt = new Date(now);
      if (profile.validityUnit === 'MONTHS') {
        finalExpiredAt.setMonth(finalExpiredAt.getMonth() + profile.validityValue);
      } else {
        finalExpiredAt.setDate(finalExpiredAt.getDate() + profile.validityValue);
      }
      finalExpiredAt.setHours(23, 59, 59, 999);
    }
  }

  // Verify router
  if (routerId) {
    const router = await prisma.router.findUnique({ where: { id: routerId } });
    if (!router) throw Object.assign(new Error('Router not found'), { code: 'NOT_FOUND' });
  }

  // Create user
  const user = await prisma.pppoeUser.create({
    data: {
      id: crypto.randomUUID(),
      username,
      customerId,
      password,
      profileId,
      routerId: routerId || null,
      areaId: areaId || null,
      name,
      phone,
      email: email || null,
      address: address || null,
      latitude: latitude ? parseFloat(String(latitude)) : null,
      longitude: longitude ? parseFloat(String(longitude)) : null,
      ipAddress: ipAddress || null,
      macAddress: macAddress || null,
      comment: comment || null,
      expiredAt: finalExpiredAt,
      status: 'active',
      subscriptionType: subscriptionType || 'POSTPAID',
      billingDay: billingDay ? Math.min(Math.max(parseInt(String(billingDay)), 1), 31) : 1,
      idCardNumber: idCardNumber || null,
      idCardPhoto: idCardPhoto || null,
      installationPhotos: installationPhotos ?? null,
      followRoad: !!followRoad,
      referralCode: await generateUniqueReferralCode(),
    } as never,
  });

  // RADIUS sync
  let radiusSynced = false;
  try {
    let router = null;
    if (routerId) {
      router = await prisma.router.findUnique({
        where: { id: routerId },
        select: { id: true, nasname: true },
      });
    }

    await prisma.radcheck.create({
      data: { username, attribute: 'Cleartext-Password', op: ':=', value: password },
    });

    // NOTE: NAS-IP-Address is NOT stored in radcheck.
    // FreeRADIUS treats radcheck as check items — if NAS-IP-Address doesn't match
    // the incoming request (VPN, NAT, different source IP), auth fails entirely.
    // NAS restriction is handled at the app level via REST authorize hook.

    await prisma.radusergroup.create({
      data: { username, groupname: profile.groupName, priority: 0 },
    });

    if (ipAddress) {
      await prisma.radreply.create({
        data: { username, attribute: 'Framed-IP-Address', op: ':=', value: ipAddress },
      });
    }

    await prisma.pppoeUser.update({
      where: { id: user.id },
      data: { syncedToRadius: true, lastSyncAt: new Date() },
    });
    radiusSynced = true;
  } catch (syncError) {
    console.error('RADIUS sync error:', syncError);
  }

  // Notifications
  let areaName: string | undefined;
  if (areaId) {
    const area = await prisma.pppoeArea.findUnique({ where: { id: areaId }, select: { name: true } });
    areaName = area?.name;
  }

  try {
    await sendAdminCreateUser({
      customerName: name,
      customerPhone: phone,
      customerId: user.customerId || undefined,
      username,
      password,
      profileName: profile.name,
      area: areaName,
    });
  } catch (waError) {
    console.error('WhatsApp notification error:', waError);
  }

  if (email) {
    try {
      const company = await prisma.company.findFirst();
      if (company) {
        const { EmailService } = await import('@/server/services/notifications/email.service');
        await EmailService.sendAdminCreateUser({
          email,
          customerName: name,
          username,
          password,
          profileName: profile.name,
          area: areaName,
          companyName: company.name,
          companyPhone: company.phone || '',
        });
      }
    } catch (emailError) {
      console.error('Email notification error:', emailError);
    }
  }

  // Activity log
  try {
    await logActivity({
      userId: (session?.user as never as { id: string })?.id,
      username: (session?.user as never as { username: string })?.username || 'Admin',
      userRole: (session?.user as never as { role: string })?.role,
      action: 'CREATE_PPPOE_USER',
      description: `Created PPPoE user: ${username}`,
      module: 'pppoe',
      status: 'success',
      request,
      metadata: { username, profileId, profileName: profile.name, routerId },
    });
  } catch (logError) {
    console.error('Activity log error:', logError);
  }

  return { user: { ...user, syncedToRadius: radiusSynced }, radiusSynced };
}

// â”€â”€â”€ Update â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function updatePppoeUser(
  data: UpdatePppoeUserInput,
  session: Session | null,
  request: NextRequest
) {
  const { id } = data;

  const currentUser = await prisma.pppoeUser.findUnique({
    where: { id },
    include: { profile: true },
  });
  if (!currentUser) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });

  // Duplicate username check
  if (data.username && data.username !== currentUser.username) {
    const existing = await prisma.pppoeUser.findUnique({ where: { username: data.username } });
    if (existing) throw Object.assign(new Error(`Username "${data.username}" already exists`), { code: 'DUPLICATE_USERNAME' });
  }

  // Resolve new profile
  let newProfile = currentUser.profile;
  if (data.profileId && data.profileId !== currentUser.profileId) {
    const profile = await prisma.pppoeProfile.findUnique({ where: { id: data.profileId } });
    if (!profile) throw Object.assign(new Error('Profile not found'), { code: 'NOT_FOUND' });
    newProfile = profile;
  }

  // Validate router if changed
  if (data.routerId) {
    const router = await prisma.router.findUnique({ where: { id: data.routerId } });
    if (!router) throw Object.assign(new Error('Router not found'), { code: 'NOT_FOUND' });
  }

  // Apply update
  const user = await prisma.pppoeUser.update({
    where: { id },
    data: {
      ...(data.username && { username: data.username }),
      ...(data.password && { password: data.password }),
      ...(data.profileId && { profileId: data.profileId }),
      ...(data.routerId !== undefined && { routerId: data.routerId || null }),
      ...(data.areaId !== undefined && { areaId: data.areaId || null }),
      ...(data.name && { name: data.name }),
      ...(data.phone && { phone: data.phone }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.address !== undefined && { address: data.address }),
      ...(data.latitude !== undefined && { latitude: data.latitude ? parseFloat(String(data.latitude)) : null }),
      ...(data.longitude !== undefined && { longitude: data.longitude ? parseFloat(String(data.longitude)) : null }),
      ...(data.ipAddress !== undefined && { ipAddress: data.ipAddress }),
      ...(data.macAddress !== undefined && { macAddress: data.macAddress }),
      ...(data.comment !== undefined && { comment: data.comment }),
      ...(data.expiredAt && { expiredAt: new Date(data.expiredAt) }),
      ...(data.status && { status: data.status }),
      ...(data.subscriptionType && { subscriptionType: data.subscriptionType }),
      ...(data.billingDay !== undefined && { billingDay: Math.min(Math.max(parseInt(String(data.billingDay)), 1), 28) }),
      ...(data.autoRenewal !== undefined && { autoRenewal: data.autoRenewal }),
      ...(data.idCardNumber !== undefined && { idCardNumber: data.idCardNumber }),
      ...(data.idCardPhoto !== undefined && { idCardPhoto: data.idCardPhoto }),
      ...(data.installationPhotos !== undefined && { installationPhotos: data.installationPhotos }),
      ...(data.followRoad !== undefined && { followRoad: !!data.followRoad }),
    } as never,
  });

  // RADIUS re-sync if critical fields changed
  if (data.username || data.password || data.profileId || data.ipAddress !== undefined || data.routerId !== undefined) {
    try {
      const oldUsername = currentUser.username;
      const newUsername = data.username || currentUser.username;

      await prisma.radcheck.deleteMany({ where: { username: oldUsername } });
      await prisma.radreply.deleteMany({ where: { username: oldUsername } });
      await prisma.radusergroup.deleteMany({ where: { username: oldUsername } });

      const finalRouterId = data.routerId !== undefined ? data.routerId : currentUser.routerId;
      let router = null;
      if (finalRouterId) {
        router = await prisma.router.findUnique({ where: { id: finalRouterId }, select: { id: true, nasname: true } });
      }

      await prisma.radcheck.create({
        data: { username: newUsername, attribute: 'Cleartext-Password', op: ':=', value: data.password || currentUser.password },
      });

      // NOTE: NAS-IP-Address NOT stored in radcheck (breaks auth in VPN/NAT setups)

      await prisma.radusergroup.create({
        data: { username: newUsername, groupname: newProfile.groupName, priority: 0 },
      });

      const finalIp = data.ipAddress !== undefined ? data.ipAddress : currentUser.ipAddress;
      if (finalIp) {
        await prisma.radreply.create({
          data: { username: newUsername, attribute: 'Framed-IP-Address', op: ':=', value: finalIp },
        });
      }

      await prisma.pppoeUser.update({
        where: { id },
        data: { syncedToRadius: true, lastSyncAt: new Date() },
      });

      // If profile changed, apply new rate limit via CoA
      const profileChanged = data.profileId && data.profileId !== currentUser.profileId;
      if (profileChanged && newProfile) {
        const activeSession = await prisma.radacct.findFirst({
          where: { username: oldUsername, acctstoptime: null },
          select: { acctsessionid: true, nasipaddress: true, framedipaddress: true },
        });

        if (activeSession) {
          const routerRow = await prisma.router.findFirst({
            where: {
              OR: [
                { nasname: activeSession.nasipaddress ?? '' },
                { ipAddress: activeSession.nasipaddress ?? '' },
              ],
            },
            select: { ipAddress: true, nasname: true, port: true, username: true, password: true, secret: true },
          }) || await prisma.router.findFirst({
            where: { isActive: true },
            select: { ipAddress: true, nasname: true, port: true, username: true, password: true, secret: true },
          });

          if (routerRow) {
            const newRateLimit = newProfile.rateLimit || `${newProfile.downloadSpeed}M/${newProfile.uploadSpeed}M`;
            await changePPPoERateLimit(
              {
                ipAddress: routerRow.ipAddress,
                nasname: routerRow.nasname,
                port: routerRow.port,
                username: routerRow.username,
                password: routerRow.password,
                secret: routerRow.secret,
              },
              oldUsername,
              newRateLimit,
              {
                acctSessionId: activeSession.acctsessionid || undefined,
                nasIpAddress: routerRow.ipAddress,
                framedIpAddress: activeSession.framedipaddress || undefined,
              },
              { allowDisconnect: true }
            );
          }
        }
      }
    } catch (syncError) {
      console.error('RADIUS re-sync error:', syncError);
    }
  }

  // Status change: invalidate auth cache + CoA disconnect
  if (data.status && data.status !== currentUser.status) {
    await redisDel(RedisKeys.radiusAuth(currentUser.username));
    if (['blocked', 'stop', 'isolated'].includes(data.status)) {
      try {
        const { disconnectPPPoEUser } = await import('@/server/services/radius/coa-handler.service');
        await disconnectPPPoEUser(currentUser.username).catch((e: Error) =>
          console.error('[User Update] CoA disconnect error:', e.message)
        );
      } catch { /* ignore */ }
    }
  }

  // Activity log
  try {
    const changes: Record<string, unknown> = {};
    if (data.username !== user.username) changes.username = data.username;
    if (data.profileId !== user.profileId) changes.profileId = data.profileId;
    if (data.status !== currentUser.status) changes.status = data.status;

    await logActivity({
      userId: (session?.user as never as { id: string })?.id,
      username: (session?.user as never as { username: string })?.username || 'Admin',
      userRole: (session?.user as never as { role: string })?.role,
      action: 'UPDATE_PPPOE_USER',
      description: `Updated PPPoE user: ${data.username || user.username}`,
      module: 'pppoe',
      status: 'success',
      request,
      metadata: { userId: id, changes },
    });
  } catch (logError) {
    console.error('Activity log error:', logError);
  }

  return user;
}

// â”€â”€â”€ Delete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function deletePppoeUser(
  id: string,
  session: Session | null,
  request: NextRequest
) {
  const user = await prisma.pppoeUser.findUnique({ where: { id } });
  if (!user) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });

  // RADIUS cleanup
  try {
    await prisma.radcheck.deleteMany({ where: { username: user.username } });
    await prisma.radreply.deleteMany({ where: { username: user.username } });
    await prisma.radusergroup.deleteMany({ where: { username: user.username } });
  } catch (syncError) {
    console.error('RADIUS cleanup error:', syncError);
  }

  await prisma.pppoeUser.delete({ where: { id } });

  // Activity log
  try {
    await logActivity({
      userId: (session?.user as never as { id: string })?.id,
      username: (session?.user as never as { username: string })?.username || 'Admin',
      userRole: (session?.user as never as { role: string })?.role,
      action: 'DELETE_PPPOE_USER',
      description: `Deleted PPPoE user: ${user.username}`,
      module: 'pppoe',
      status: 'success',
      request,
      metadata: { userId: id, username: user.username },
    });
  } catch (logError) {
    console.error('Activity log error:', logError);
  }

  return { deleted: true, username: user.username };
}
