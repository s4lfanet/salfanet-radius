/**
 * PPPoE User service — business logic extracted from route handlers.
 * All DB mutations, RADIUS sync, notifications and activity logging live here.
 */

import { prisma } from '@/server/db/client';
import { logActivity } from '@/server/services/activity-log.service';
import { sendAdminCreateUser } from '@/server/services/notifications/whatsapp-templates.service';
import { changePPPoERateLimit } from '@/server/services/mikrotik/rate-limit';
import { managePppSecret, shouldCreatePppSecret, getMikrotikProfileName, batchListPppActive } from '@/server/services/mikrotik/ppp-secret.service';
import { generateUniqueReferralCode } from '@/server/services/referral.service';
import { generateInvoiceNumber } from '@/server/services/billing/invoice.service';
import { randomBytes } from 'crypto';
import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreatePppoeUserInput {
  username: string;
  password: string;
  profileId: string;
  pppoeCustomerId?: string;
  routerId?: string;
  areaId?: string;
  name?: string;
  phone?: string;
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
  registeredAt?: string;
  autoIsolationEnabled?: boolean;
  firstInvoice?: 'none' | 'prorate' | 'full';
  // PSB wizard fields
  odp?: string;
  discount?: number | string;
  discountNote?: string;
  installDate?: string;
  connectionType?: string;
  createPppSecret?: boolean;
}

export interface UpdatePppoeUserInput {
  id: string;
  username?: string;
  password?: string;
  profileId?: string;
  pppoeCustomerId?: string | null;
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
  autoIsolationEnabled?: boolean;
  idCardNumber?: string | null;
  idCardPhoto?: string | null;
  installationPhotos?: unknown;
  followRoad?: boolean;
  registeredAt?: string;
}

// ─── List ─────────────────────────────────────────────────────────────────────

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
      pppoeCustomer: { select: { id: true, customerId: true, name: true, phone: true, email: true } },
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

  // For local routers, also poll MikroTik /ppp/active because
  // local-auth users bypass RADIUS accounting and won't appear in radacct.
  // Group users by router to determine which routers need polling.
  const localRouterIds = new Set<string>();
  for (const u of users) {
    if (u.router && u.router.id) {
      const mode = u.router.authMode || 'local';
      if (mode === 'local') {
        localRouterIds.add(u.router.id);
      }
    }
  }
  if (localRouterIds.size > 0) {
    const pppActiveNames = await batchListPppActive([...localRouterIds]);
    for (const name of pppActiveNames) {
      onlineSet.add(name);
    }
  }

  return users.map(user => ({ ...user, isOnline: onlineSet.has(user.username) }));
}

// ─── Get one ──────────────────────────────────────────────────────────────────

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

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createPppoeUser(
  data: CreatePppoeUserInput & { noPppoeAccount?: boolean },
  session: Session | null,
  request: NextRequest
) {
  const {
    password, profileId, pppoeCustomerId, routerId, areaId,
    email, address, latitude, longitude, ipAddress, macAddress, comment,
    expiredAt, subscriptionType, billingDay, idCardNumber, idCardPhoto,
    installationPhotos, followRoad, registeredAt,
    odp, discount, discountNote, installDate, connectionType,
  } = data;
  const noPppoeAccount = !!(data as any).noPppoeAccount;

  // Resolve name/phone: prefer explicit values, fall back to linked customer
  let resolvedName = data.name || '';
  let resolvedPhone = data.phone || '';
  if (pppoeCustomerId && (!resolvedName || !resolvedPhone)) {
    const linkedCustomer = await (prisma as any).pppoeCustomer.findUnique({
      where: { id: pppoeCustomerId },
      select: { name: true, phone: true },
    });
    if (linkedCustomer) {
      resolvedName = resolvedName || linkedCustomer.name;
      resolvedPhone = resolvedPhone || linkedCustomer.phone;
    }
  }
  if (!resolvedPhone) resolvedPhone = '-';

  // Generate unique customer ID (with company prefix if configured)
  const company = await prisma.company.findFirst({ select: { customerIdPrefix: true } });
  const prefix = (company as any)?.customerIdPrefix?.trim() || '';
  let customerId = '';
  let isUnique = false;
  while (!isUnique) {
    customerId = prefix + Math.floor(10000000 + Math.random() * 90000000).toString();
    const existing = await prisma.pppoeUser.findUnique({ where: { customerId } });
    if (!existing) isUnique = true;
  }

  // Resolve username: auto-generate for static/MAC-only customers
  let username = data.username || '';
  if (noPppoeAccount || !username) {
    // Generate a placeholder username: STATIC-{customerId} or STATIC-{random}
    username = 'STATIC-' + customerId;
  }
  if (!resolvedName) resolvedName = username;

  // Check duplicate
  const existingUser = await prisma.pppoeUser.findUnique({ where: { username } });
  if (existingUser) {
    throw Object.assign(new Error(`Username "${username}" already exists`), { code: 'DUPLICATE_USERNAME' });
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

  // Check duplicate NIK (idCardNumber) — warning only, not blocking
  if (idCardNumber) {
    const existingNik = await prisma.pppoeUser.findFirst({
      where: { idCardNumber },
      select: { username: true, name: true },
    });
    if (existingNik) {
      console.log(`[PSB] NIK "${idCardNumber}" sudah terdaftar atas nama: ${existingNik.name} (${existingNik.username}) — warning only`);
    }
  }

  // Check duplicate phone — warning only, not blocking
  if (resolvedPhone && resolvedPhone !== '-') {
    const existingPhone = await prisma.pppoeUser.findFirst({
      where: { phone: resolvedPhone },
      select: { username: true, name: true },
    });
    if (existingPhone) {
      console.log(`[PSB] No HP "${resolvedPhone}" sudah terdaftar atas nama: ${existingPhone.name} (${existingPhone.username}) — warning only`);
    }
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
      name: resolvedName,
      phone: resolvedPhone,
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
      billingDay: billingDay ? Math.min(Math.max(parseInt(String(billingDay)), 1), 28) : 1,
      idCardNumber: idCardNumber || null,
      idCardPhoto: idCardPhoto || null,
      installationPhotos: installationPhotos ?? null,
      followRoad: !!followRoad,
      referralCode: await generateUniqueReferralCode(),
      ...((data as any).autoIsolationEnabled !== undefined && { autoIsolationEnabled: !!(data as any).autoIsolationEnabled }),
      ...(registeredAt ? { createdAt: new Date(registeredAt) } : {}),
      ...(pppoeCustomerId ? { pppoeCustomerId } : {}),
      // PSB wizard fields
      ...(odp ? { odp } : {}),
      ...(discount !== undefined ? { discount: parseInt(String(discount)) || 0 } : {}),
      ...(discountNote ? { discountNote } : {}),
      ...(installDate ? { installDate: new Date(installDate) } : {}),
      ...(connectionType ? { connectionType: connectionType as any } : {}),
    } as never,
  });

  // RADIUS sync - skip for static/MAC-only customers
  let radiusSynced = false;
  if (!noPppoeAccount && password) {
    try {
      // nas_identifier = routerId for multi-tenant isolation (NULL = global)
      const nasIdentifier = routerId || null;

      // Delete old entries (avoid duplicates on re-create)
      await prisma.radcheck.deleteMany({ where: { username, nas_identifier: nasIdentifier } });
      await prisma.radusergroup.deleteMany({ where: { username, nas_identifier: nasIdentifier } });
      await prisma.radreply.deleteMany({ where: { username, nas_identifier: nasIdentifier } });

      await prisma.radcheck.create({
        data: { username, attribute: 'Cleartext-Password', op: ':=', value: password, nas_identifier: nasIdentifier },
      });

      await prisma.radusergroup.create({
        data: { username, groupname: profile.groupName, priority: 0, nas_identifier: nasIdentifier },
      });

      if (ipAddress) {
        await prisma.radreply.create({
          data: { username, attribute: 'Framed-IP-Address', op: ':=', value: ipAddress, nas_identifier: nasIdentifier },
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

    // Create PPP Secret in MikroTik (conditional by router authMode)
    // local  → enabled (secret is primary auth)
    // radius → disabled (secret is backup only, RADIUS is primary)
    if (routerId) {
      try {
        const router = await prisma.router.findUnique({
          where: { id: routerId },
          select: { authMode: true },
        });
        const { shouldCreate, disabled } = shouldCreatePppSecret(router?.authMode);
        if (shouldCreate) {
          const mtProfile = await getMikrotikProfileName(profileId);
          managePppSecret(routerId, 'create', {
            username,
            password,
            profile: mtProfile || undefined,
            disabled,
            comment: `Salfanet-${user.id.slice(0, 8)}`,
          }).then((r) => {
            console.log(`[PPP_SECRET] create for "${username}" on router ${routerId}: ${r.message}`)
          }).catch((e) => {
            console.error(`[PPP_SECRET] create failed for "${username}":`, e?.message || e)
          });
        }
      } catch (e: any) {
        console.error(`[PPP_SECRET] lookup router authMode failed:`, e?.message || e);
      }
    }
  } else if (noPppoeAccount && ipAddress) {
    try {
      const nasIdentifier = routerId || null;
      await prisma.radreply.create({
        data: { username, attribute: 'Framed-IP-Address', op: ':=', value: ipAddress, nas_identifier: nasIdentifier },
      });
      await prisma.radusergroup.create({
        data: { username, groupname: profile.groupName, priority: 0, nas_identifier: nasIdentifier },
      });
    } catch (syncError) {
      console.error('Static IP sync error:', syncError);
    }
  }

  // Create first invoice if requested
  const firstInvoice = (data as any).firstInvoice as 'none' | 'prorate' | 'full' | undefined;
  if (firstInvoice && firstInvoice !== 'none') {
    try {
      let invoiceAmount = profile.price;
      if (firstInvoice === 'prorate' && subscriptionType !== 'PREPAID') {
        // Calculate prorate: days from today to next billing date
        const registrationDate = registeredAt ? new Date(registeredAt + 'T00:00:00') : new Date();
        registrationDate.setHours(0, 0, 0, 0);
        const year = registrationDate.getFullYear();
        const month = registrationDate.getMonth();
        const currentDay = registrationDate.getDate();
        const bd = billingDay ? Math.min(Math.max(parseInt(String(billingDay)), 1), 28) : 1;
        let nextBilling: Date;
        if (currentDay < bd) { nextBilling = new Date(year, month, bd); }
        else { nextBilling = new Date(year, month + 1, bd); }
        const msPerDay = 1000 * 60 * 60 * 24;
        const daysActive = Math.max(1, Math.ceil((nextBilling.getTime() - registrationDate.getTime()) / msPerDay));
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        invoiceAmount = Math.ceil((daysActive / daysInMonth) * profile.price);
      }
      const invoiceId = crypto.randomUUID();
      const invoiceNumber = generateInvoiceNumber();
      const company = await prisma.company.findFirst({ select: { baseUrl: true } });
      const baseUrl = company?.baseUrl || 'http://localhost:3000';
      const paymentToken = randomBytes(32).toString('hex');
      const paymentLink = `${baseUrl}/pay/${paymentToken}`;
      await prisma.invoice.create({
        data: {
          id: invoiceId,
          invoiceNumber,
          userId: user.id,
          amount: invoiceAmount,
          baseAmount: invoiceAmount,
          dueDate: finalExpiredAt,
          status: 'PENDING',
          invoiceType: 'MONTHLY',
          customerName: resolvedName,
          customerPhone: resolvedPhone,
          customerUsername: username,
          paymentToken,
          paymentLink,
          createdAt: new Date(),
        },
      });
    } catch (invoiceError) {
      console.error('First invoice creation error:', invoiceError);
    }
  }

  // Notifications
  let areaName: string | undefined;
  if (areaId) {
    const area = await prisma.pppoeArea.findUnique({ where: { id: areaId }, select: { name: true } });
    areaName = area?.name;
  }

  try {
    await sendAdminCreateUser({
      customerName: resolvedName,
      customerPhone: resolvedPhone,
      customerId: user.customerId || undefined,
      username,
      password,
      profileName: profile.name,
      area: areaName,
      expiredAt: finalExpiredAt,
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
          customerName: resolvedName,
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

// ─── Update ───────────────────────────────────────────────────────────────────

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
      ...(data.status && { status: data.status }),
      ...(data.subscriptionType && { subscriptionType: data.subscriptionType }),
      ...(data.billingDay !== undefined && { billingDay: Math.min(Math.max(parseInt(String(data.billingDay)), 1), 28) }),
      // expiredAt: if explicitly provided, save it directly with correct timezone handling.
      // Date-only string (YYYY-MM-DD) ? end of day WIB (23:59:59 WIB = 16:59:59 UTC).
      // No longer auto-recalculate expiredAt from billingDay on every edit �
      // that was the bug causing expiredAt to silently reset to "next month" on any save.
      ...(data.expiredAt && (() => {
        const expStr = String(data.expiredAt);
        if (/^\d{4}-\d{2}-\d{2}$/.test(expStr)) {
          const [y, m, d] = expStr.split('-').map(Number);
          return { expiredAt: new Date(Date.UTC(y, m - 1, d, 16, 59, 59, 999)) };
        }
        return { expiredAt: new Date(expStr) };
      })()),
      ...(data.autoRenewal !== undefined && { autoRenewal: data.autoRenewal }),
      ...(data.autoIsolationEnabled !== undefined && { autoIsolationEnabled: data.autoIsolationEnabled }),
      ...(data.idCardNumber !== undefined && { idCardNumber: data.idCardNumber }),
      ...(data.idCardPhoto !== undefined && { idCardPhoto: data.idCardPhoto }),
      ...(data.installationPhotos !== undefined && { installationPhotos: data.installationPhotos }),
      ...(data.followRoad !== undefined && { followRoad: !!data.followRoad }),
      ...(data.registeredAt && { createdAt: new Date(data.registeredAt) }),
    } as never,
  });

  // RADIUS re-sync if critical fields changed (including status change)
  if (data.username || data.password || data.profileId || data.ipAddress !== undefined || data.routerId !== undefined || (data.status && data.status !== currentUser.status)) {
    try {
      const oldUsername = currentUser.username;
      const newUsername = data.username || currentUser.username;

      const finalRouterId = data.routerId !== undefined ? data.routerId : currentUser.routerId;
      // nas_identifier = routerId for multi-tenant isolation (NULL = global)
      const nasIdentifier = finalRouterId || null;
      const oldNasIdentifier = currentUser.routerId || null;

      // Delete old entries for old username + old nas_identifier
      await prisma.radcheck.deleteMany({ where: { username: oldUsername, nas_identifier: oldNasIdentifier } });
      await prisma.radreply.deleteMany({ where: { username: oldUsername, nas_identifier: oldNasIdentifier } });
      await prisma.radusergroup.deleteMany({ where: { username: oldUsername, nas_identifier: oldNasIdentifier } });
      let router = null;
      if (finalRouterId) {
        router = await prisma.router.findUnique({ where: { id: finalRouterId }, select: { id: true, nasname: true } });
      }

      // Determine effective status after this update (new status if being changed, otherwise current)
      const effectiveStatus = data.status || currentUser.status;

      // RADIUS re-sync must respect the user's effective status:
      // - active: full sync (password, profile group, static IP)
      // - isolated: allow auth but use isolir group, no static IP
      // - blocked/stop: keep RADIUS tables empty � user must remain unreachable
      if (effectiveStatus === 'blocked' || effectiveStatus === 'stop') {
        // Tables already cleared by deleteMany above � do NOT re-add any entries
      } else if (effectiveStatus === 'isolated') {
        // Keep login allowed but restrict to isolir group
        await prisma.radcheck.create({
          data: { username: newUsername, attribute: 'Cleartext-Password', op: ':=', value: data.password || currentUser.password, nas_identifier: nasIdentifier },
        });
        // NOTE: NAS-IP-Address NOT stored in radcheck (breaks auth in VPN/NAT setups)
        await prisma.radusergroup.create({
          data: { username: newUsername, groupname: 'isolir', priority: 1, nas_identifier: nasIdentifier },
        });
        // No Framed-IP-Address � isolated users get IP from pool-isolir
      } else {
        // active (default): full sync
        await prisma.radcheck.create({
          data: { username: newUsername, attribute: 'Cleartext-Password', op: ':=', value: data.password || currentUser.password, nas_identifier: nasIdentifier },
        });
        // NOTE: NAS-IP-Address NOT stored in radcheck (breaks auth in VPN/NAT setups)
        await prisma.radusergroup.create({
          data: { username: newUsername, groupname: newProfile.groupName, priority: 0, nas_identifier: nasIdentifier },
        });
        const finalIp = data.ipAddress !== undefined ? data.ipAddress : currentUser.ipAddress;
        if (finalIp) {
          await prisma.radreply.create({
            data: { username: newUsername, attribute: 'Framed-IP-Address', op: ':=', value: finalIp, nas_identifier: nasIdentifier },
          });
        }
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
                username: routerRow.username || '',
                password: routerRow.password || '',
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

      // Update PPP Secret in MikroTik (conditional by router authMode)
      if (finalRouterId) {
        try {
          const router = await prisma.router.findUnique({
            where: { id: finalRouterId },
            select: { authMode: true },
          });
          const { shouldCreate, disabled } = shouldCreatePppSecret(router?.authMode);
          if (shouldCreate) {
            const mtProfile = await getMikrotikProfileName(newProfile.id);
            const action = (oldUsername && oldUsername !== newUsername) ? 'rename' : 'update';
            const secretParams: any = {
              username: oldUsername || newUsername,
              password: data.password || currentUser.password,
              profile: mtProfile || undefined,
              disabled: effectiveStatus === 'isolated' || effectiveStatus === 'blocked' || effectiveStatus === 'stop' ? true : disabled,
              comment: `Salfanet-${id.slice(0, 8)}`,
            };
            if (action === 'rename') secretParams.newUsername = newUsername;
            managePppSecret(finalRouterId, action, secretParams).then((r) => {
              console.log(`[PPP_SECRET] ${action} for "${newUsername}" on router ${finalRouterId}: ${r.message}`)
            }).catch((e) => {
              console.error(`[PPP_SECRET] ${action} failed for "${newUsername}":`, e?.message || e)
            });
          }
        } catch (e: any) {
          console.error(`[PPP_SECRET] update lookup router authMode failed:`, e?.message || e);
        }
      }
    } catch (syncError) {
      console.error('RADIUS re-sync error:', syncError);
    }
  }

  // Status change: CoA disconnect
  if (data.status && data.status !== currentUser.status) {
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

// ─── Delete ───────────────────────────────────────────────────────────────────

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
