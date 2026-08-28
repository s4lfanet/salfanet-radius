/**
 * PPPoE User service â€” business logic extracted from route handlers.
 * All DB mutations, RADIUS sync, notifications and activity logging live here.
 */

import { prisma } from '@/server/db/client';
import { logActivity } from '@/server/services/activity-log.service';
import { sendAdminCreateUser } from '@/server/services/notifications/whatsapp-templates.service';
import { changePPPoERateLimit } from '@/server/services/mikrotik/rate-limit';
import { managePppSecret, shouldCreatePppSecret, getMikrotikProfileName, batchListPppActive, kickPppoeSession } from '@/server/services/mikrotik/ppp-secret.service';
import { invalidateKey, invalidatePattern, CACHE_KEYS } from '@/server/cache/redis';
import { toUTC } from '@/lib/timezone';
import { generateUniqueReferralCode } from '@/server/services/referral.service';
import { generateInvoiceNumber } from '@/server/services/billing/invoice.service';
import { reloadFreeRadius } from '@/server/services/radius/freeradius.service';
import { randomBytes } from 'crypto';
import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';

// ─── MAC address validation ──────────────────────────────────────────────────
/**
 * Detect placeholder/fake MAC addresses that should not be stored.
 * Returns true if the MAC is a placeholder (00:00:00:00:00:00, AA:BB:CC:DD:EE:FF, etc).
 */
function isPlaceholderMac(mac: string | null | undefined): boolean {
  if (!mac) return false;
  const normalized = mac.trim().toUpperCase();
  if (normalized === '') return false;
  const placeholders = [
    '00:00:00:00:00:00',
    'FF:FF:FF:FF:FF:FF',
    'AA:BB:CC:DD:EE:FF',
    '11:22:33:44:55:66',
    'DE:AD:BE:EF:DE:AD',
  ];
  if (placeholders.includes(normalized)) return true;
  // All zeros or all same hex pairs
  const parts = normalized.split(/[:-]/);
  if (parts.length === 6 && parts.every(p => p === parts[0])) return true;
  return false;
}

/**
 * Clean MAC address — return null if it's a placeholder or empty.
 */
function cleanMac(mac: string | null | undefined): string | null {
  if (!mac || !mac.trim()) return null;
  if (isPlaceholderMac(mac)) return null;
  return mac.trim();
}

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  registeredByTechnicianId?: string;
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
  discount?: number | string;
  discountNote?: string | null;
  connectionType?: string;  // PPPOE | STATIC_IP | HOTSPOT — changing this triggers MikroTik sync
}

// â”€â”€â”€ List â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ListPppoeUsersParams {
  status?: string | null;
  search?: string | null;
  profileId?: string | null;
  routerId?: string | null;
  areaId?: string | null;
  page?: number | null;
  limit?: number | null;
  sortBy?: string | null;
  sortOrder?: 'asc' | 'desc' | null;
}

export async function listPppoeUsers(params: ListPppoeUsersParams) {
  const whereClause: Record<string, unknown> = {};
  if (params.status) {
    whereClause.status = params.status;
  } else {
    whereClause.status = { not: 'stop' };
  }

  // Server-side search: username, name, phone, customerId
  if (params.search) {
    const q = params.search.trim();
    if (q) {
      whereClause.OR = [
        { username: { contains: q } },
        { name: { contains: q } },
        { phone: { contains: q } },
        { customerId: { contains: q } },
      ];
    }
  }

  // Server-side filters
  if (params.profileId) {
    whereClause.profileId = params.profileId;
  }
  if (params.routerId) {
    whereClause.routerId = params.routerId;
  }
  if (params.areaId) {
    whereClause.areaId = params.areaId;
  }

  // Pagination
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(500, Math.max(1, params.limit || 100));
  const skip = (page - 1) * limit;

  // Sorting
  const sortMap: Record<string, string> = {
    username: 'username',
    name: 'name',
    phone: 'phone',
    customerId: 'customerId',
    status: 'status',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    expiredAt: 'expiredAt',
  };
  const sortField = sortMap[params.sortBy || ''] || 'createdAt';
  const sortDir = params.sortOrder === 'asc' ? 'asc' : 'desc';

  const [users, total] = await Promise.all([
    prisma.pppoeUser.findMany({
      where: whereClause,
      include: {
        profile: true,
        router: true,
        area: true,
        odpAssignment: { include: { odp: true } },
        pppoeCustomer: { select: { id: true, customerId: true, name: true, phone: true, email: true } },
        registeredByTechnician: { select: { id: true, name: true } },
      },
      orderBy: { [sortField]: sortDir },
      skip,
      take: limit,
    }),
    prisma.pppoeUser.count({ where: whereClause }),
  ]);

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
  // Skip MikroTik polling for stopped users â€” they can't be online
  const localRouterIds = new Set<string>();
  if (params.status !== 'stop') {
    for (const u of users) {
      if (u.router && u.router.id) {
        const mode = u.router.authMode || 'local';
        if (mode === 'local') {
          localRouterIds.add(u.router.id);
        }
      }
    }
  }
  if (localRouterIds.size > 0) {
    const pppActiveNames = await batchListPppActive([...localRouterIds]);
    for (const name of pppActiveNames) {
      onlineSet.add(name);
    }
  }

  const mappedUsers = users.map(user => ({ ...user, isOnline: onlineSet.has(user.username) }));

  return {
    users: mappedUsers,
    count: mappedUsers.length,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
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
    registeredByTechnicianId,
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

  // Calculate expiredAt â€” must be in WIB-as-UTC format (same as nowWIB()) for correct cron comparison
  const now = new Date();
  let finalExpiredAt: Date;
  if (subscriptionType === 'POSTPAID') {
    finalExpiredAt = new Date(now);
    finalExpiredAt.setMonth(finalExpiredAt.getMonth() + 1);
    const validBillingDay = billingDay ? Math.min(Math.max(parseInt(String(billingDay)), 1), 31) : 1;
    finalExpiredAt.setDate(validBillingDay);
    finalExpiredAt.setHours(23, 59, 59, 999);
    finalExpiredAt = toUTC(finalExpiredAt); // Convert local WIB â†’ WIB-as-UTC for Prisma/MySQL
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
      finalExpiredAt = toUTC(finalExpiredAt); // Convert local WIB â†’ WIB-as-UTC for Prisma/MySQL
    }
  }

  // Verify router
  if (routerId) {
    const router = await prisma.router.findUnique({ where: { id: routerId } });
    if (!router) throw Object.assign(new Error('Router not found'), { code: 'NOT_FOUND' });
  }

  // Check duplicate NIK (idCardNumber) â€” warning only, not blocking
  if (idCardNumber) {
    const existingNik = await prisma.pppoeUser.findFirst({
      where: { idCardNumber },
      select: { username: true, name: true },
    });
    if (existingNik) {
      console.log(`[PSB] NIK "${idCardNumber}" sudah terdaftar atas nama: ${existingNik.name} (${existingNik.username}) â€” warning only`);
    }
  }

  // Check duplicate phone â€” warning only, not blocking
  if (resolvedPhone && resolvedPhone !== '-') {
    const existingPhone = await prisma.pppoeUser.findFirst({
      where: { phone: resolvedPhone },
      select: { username: true, name: true },
    });
    if (existingPhone) {
      console.log(`[PSB] No HP "${resolvedPhone}" sudah terdaftar atas nama: ${existingPhone.name} (${existingPhone.username}) â€” warning only`);
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
      macAddress: cleanMac(macAddress),
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
      ...(registeredByTechnicianId ? { registeredByTechnicianId } : {}),
    } as never,
  });

  // Resolve area name for notifications (before transaction)
  let areaName: string | undefined;
  if (areaId) {
    const area = await prisma.pppoeArea.findUnique({ where: { id: areaId }, select: { name: true } });
    areaName = area?.name;
  }

  // â”€â”€â”€ ATOMIC: DB create + RADIUS sync + invoice in single transaction â”€â”€â”€â”€â”€â”€
  // External side effects (MikroTik, WhatsApp, Email) are enqueued to the
  // external_task outbox table within the same transaction, ensuring they
  // are only created if the DB operation succeeds.
  let radiusSynced = false;

  if (!noPppoeAccount && password) {
    try {
      const nasIdentifier = routerId || null;

      await prisma.$transaction(async (tx) => {
        // RADIUS sync (DB-level â€” atomic with user creation)
        await tx.radcheck.deleteMany({ where: { username, nas_identifier: nasIdentifier } });
        await tx.radusergroup.deleteMany({ where: { username, nas_identifier: nasIdentifier } });
        await tx.radreply.deleteMany({ where: { username, nas_identifier: nasIdentifier } });

        await tx.radcheck.create({
          data: { username, attribute: 'Cleartext-Password', op: ':=', value: password, nas_identifier: nasIdentifier },
        });

        await tx.radusergroup.create({
          data: { username, groupname: profile.groupName, priority: 0, nas_identifier: nasIdentifier },
        });

        if (ipAddress) {
          await tx.radreply.create({
            data: { username, attribute: 'Framed-IP-Address', op: ':=', value: ipAddress, nas_identifier: nasIdentifier },
          });
        }

        await tx.pppoeUser.update({
          where: { id: user.id },
          data: { syncedToRadius: true, lastSyncAt: new Date() },
        });

        // â”€â”€â”€ Enqueue external tasks (same transaction) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const { enqueueTask } = await import('./external-task.service');

        // MikroTik sync — based on connectionType
        if (routerId) {
          const router = await tx.router.findUnique({
            where: { id: routerId },
            select: { authMode: true },
          });
          const { shouldCreate, disabled } = shouldCreatePppSecret(router?.authMode);
          const mtProfile = await getMikrotikProfileName(profileId);
          const effectiveConnType = connectionType || 'PPPOE';

          if (effectiveConnType === 'PPPOE' && shouldCreate) {
            // PPPoE: create PPP secret
            await enqueueTask(tx, 'pppoe_user', user.id, 'sync_mikrotik_create', {
              routerId,
              username,
              password,
              profile: mtProfile || undefined,
              disabled,
              comment: `Salfanet-${user.id.slice(0, 8)}`,
            });
          } else if (effectiveConnType === 'STATIC_IP') {
            // Static IP: create ARP entry on MikroTik
            await enqueueTask(tx, 'pppoe_user', user.id, 'sync_mikrotik_arp_create', {
              routerId,
              ipAddress: ipAddress || '',
              macAddress: macAddress || '',
              comment: `Salfanet-${user.id.slice(0, 8)}`,
            });
          } else if (effectiveConnType === 'HOTSPOT') {
            // Hotspot: create hotspot user on MikroTik
            await enqueueTask(tx, 'pppoe_user', user.id, 'sync_mikrotik_hotspot_create', {
              routerId,
              username,
              password,
              profile: mtProfile || undefined,
              ipAddress: ipAddress || '',
              disabled,
              comment: `Salfanet-${user.id.slice(0, 8)}`,
            });
          }
        }

        // FreeRADIUS reload
        await enqueueTask(tx, 'pppoe_user', user.id, 'reload_radius', {});

        // First invoice (if requested) â€” inside transaction
        const firstInvoice = (data as any).firstInvoice as 'none' | 'prorate' | 'full' | undefined;
        if (firstInvoice && firstInvoice !== 'none') {
          const userDiscount = typeof data.discount === 'number' ? data.discount : (parseInt(String(data.discount)) || 0);
          const baseAmount = Math.max(0, profile.price - userDiscount);
          let invoiceAmount = baseAmount;
          if (firstInvoice === 'prorate' && subscriptionType !== 'PREPAID') {
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
            invoiceAmount = Math.ceil((daysActive / daysInMonth) * baseAmount);
          }
          let taxRate: number | null = null;
          if (profile.ppnActive && profile.ppnRate > 0) {
            taxRate = Number(profile.ppnRate);
            invoiceAmount = Math.round(invoiceAmount + (invoiceAmount * taxRate / 100));
          }
          const invoiceId = crypto.randomUUID();
          const invoiceNumber = generateInvoiceNumber();
          const company = await tx.company.findFirst({ select: { baseUrl: true } });
          const baseUrl = company?.baseUrl || 'http://localhost:3000';
          const paymentToken = randomBytes(32).toString('hex');
          const paymentLink = `${baseUrl}/pay/${paymentToken}`;
          await tx.invoice.create({
            data: {
              id: invoiceId,
              invoiceNumber,
              userId: user.id,
              amount: invoiceAmount,
              baseAmount,
              ...(taxRate !== null && { taxRate }),
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
        }

        // WhatsApp notification
        await enqueueTask(tx, 'pppoe_user', user.id, 'send_wa', {
          template: 'admin_create_user',
          data: {
            customerName: resolvedName,
            customerPhone: resolvedPhone,
            customerId: user.customerId || undefined,
            username,
            password,
            profileName: profile.name,
            area: areaName,
            expiredAt: finalExpiredAt,
          },
          idempotencyKey: `create_user_${user.id}`,
        });

        // Email notification
        if (email) {
          await enqueueTask(tx, 'pppoe_user', user.id, 'send_email', {
            template: 'admin_create_user',
            data: {
              email,
              customerName: resolvedName,
              username,
              password,
              profileName: profile.name,
              area: areaName,
            },
            idempotencyKey: `create_user_email_${user.id}`,
          });
        }
      });

      radiusSynced = true;
    } catch (syncError) {
      console.error('RADIUS sync / external task enqueue error:', syncError);
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

  // Invalidate profiles cache (user count changed)
  try { await invalidateKey(CACHE_KEYS.profiles); } catch {}

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
      ...(data.macAddress !== undefined && { macAddress: cleanMac(data.macAddress) }),
      ...(data.comment !== undefined && { comment: data.comment }),
      ...(data.status && { status: data.status }),
      ...(data.subscriptionType && { subscriptionType: data.subscriptionType }),
      ...(data.billingDay !== undefined && { billingDay: Math.min(Math.max(parseInt(String(data.billingDay)), 1), 28) }),
      // expiredAt: if explicitly provided, save it directly with correct timezone handling.
      // Date-only string (YYYY-MM-DD) ? end of day WIB (23:59:59 WIB = 16:59:59 UTC).
      // No longer auto-recalculate expiredAt from billingDay on every edit ï¿½
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
      ...(data.discount !== undefined && { discount: parseInt(String(data.discount)) || 0 }),
      ...(data.discountNote !== undefined && { discountNote: data.discountNote || null }),
      ...(data.connectionType && { connectionType: data.connectionType as any }),
    } as never,
  });

  // Detect connectionType change
  const connectionTypeChanged = data.connectionType && data.connectionType !== currentUser.connectionType;
  const oldConnectionType = currentUser.connectionType;
  const newConnectionType = data.connectionType || currentUser.connectionType;

  // RADIUS re-sync if critical fields changed (including status change)
  // Also trigger on connectionType change: PPPOE needs radcheck/radusergroup, non-PPPOE needs them removed
  // Also trigger on forceSyncMikrotik: user explicitly requested PPP secret sync from edit page
  if (data.username || data.password || data.profileId || data.ipAddress !== undefined || data.routerId !== undefined || (data.status && data.status !== currentUser.status) || connectionTypeChanged || data.forceSyncMikrotik) {
    try {
      const oldUsername = currentUser.username;
      const newUsername = data.username || currentUser.username;
      const finalRouterId = data.routerId !== undefined ? data.routerId : currentUser.routerId;
      const nasIdentifier = finalRouterId || null;
      const oldNasIdentifier = currentUser.routerId || null;
      const effectiveStatus = data.status || currentUser.status;

      // ATOMIC: RADIUS sync + DB update in single transaction
      // External side effects (MikroTik, CoA, reload) are enqueued to outbox.
      await prisma.$transaction(async (tx) => {
        const nasIdentifiersToClean = [oldNasIdentifier, nasIdentifier];
        await tx.radcheck.deleteMany({
          where: {
            username: oldUsername,
            OR: [
              { nas_identifier: { in: nasIdentifiersToClean.filter((n): n is string => n !== null) } },
              { nas_identifier: null },
            ],
          },
        });
        await tx.radreply.deleteMany({
          where: {
            username: oldUsername,
            OR: [
              { nas_identifier: { in: nasIdentifiersToClean.filter((n): n is string => n !== null) } },
              { nas_identifier: null },
            ],
          },
        });
        await tx.radusergroup.deleteMany({
          where: {
            username: oldUsername,
            OR: [
              { nas_identifier: { in: nasIdentifiersToClean.filter((n): n is string => n !== null) } },
              { nas_identifier: null },
            ],
          },
        });

        if (oldUsername !== newUsername) {
          await tx.$executeRaw`UPDATE radacct SET username = ${newUsername} WHERE username = ${oldUsername}`;
          await tx.$executeRaw`UPDATE radpostauth SET username = ${newUsername} WHERE username = ${oldUsername}`;
        }

        if (effectiveStatus === 'blocked' || effectiveStatus === 'stop') {
          // Tables already cleared - do NOT re-add entries
        } else if (newConnectionType !== 'PPPOE') {
          // Non-PPPoE (STATIC_IP / HOTSPOT): no Cleartext-Password needed in RADIUS
          // For STATIC_IP: only add Framed-IP-Address in radreply (for RADIUS-assigned IP)
          if (newConnectionType === 'STATIC_IP') {
            const finalIp = data.ipAddress !== undefined ? data.ipAddress : currentUser.ipAddress;
            if (finalIp) {
              await tx.radreply.create({
                data: { username: newUsername, attribute: 'Framed-IP-Address', op: ':=', value: finalIp, nas_identifier: nasIdentifier },
              });
            }
          }
          // HOTSPOT: RADIUS auth handled differently (Hotspot User Manager or MikroTik local)
          // No radcheck/radusergroup entries needed here
        } else if (effectiveStatus === 'isolated') {
          await tx.radcheck.create({
            data: { username: newUsername, attribute: 'Cleartext-Password', op: ':=', value: data.password || currentUser.password, nas_identifier: nasIdentifier },
          });
          await tx.radusergroup.create({
            data: { username: newUsername, groupname: 'isolir', priority: 1, nas_identifier: nasIdentifier },
          });
        } else {
          await tx.radcheck.create({
            data: { username: newUsername, attribute: 'Cleartext-Password', op: ':=', value: data.password || currentUser.password, nas_identifier: nasIdentifier },
          });
          await tx.radusergroup.create({
            data: { username: newUsername, groupname: newProfile?.groupName || 'isolir', priority: 0, nas_identifier: nasIdentifier },
          });
          const finalIp = data.ipAddress !== undefined ? data.ipAddress : currentUser.ipAddress;
          if (finalIp) {
            await tx.radreply.create({
              data: { username: newUsername, attribute: 'Framed-IP-Address', op: ':=', value: finalIp, nas_identifier: nasIdentifier },
            });
          }
        }

        await tx.pppoeUser.update({
          where: { id },
          data: { syncedToRadius: true, lastSyncAt: new Date() },
        });

        // Enqueue external tasks (same transaction)
        const { enqueueTask } = await import('./external-task.service');

        // FreeRADIUS reload
        await enqueueTask(tx, 'pppoe_user', id, 'reload_radius', {});

        // CoA disconnect for credential change
        if ((data.username && data.username !== currentUser.username) || data.password) {
          await enqueueTask(tx, 'pppoe_user', id, 'coa_disconnect', { username: oldUsername });
        }

        // CoA disconnect for status change (block/isolate)
        if (data.status && data.status !== currentUser.status && ['blocked', 'stop', 'isolated'].includes(data.status)) {
          await enqueueTask(tx, 'pppoe_user', id, 'coa_disconnect', { username: newUsername });
        }

        // CoA disconnect for connectionType change — kick old session so user re-auth with new connection type
        if (connectionTypeChanged) {
          await enqueueTask(tx, 'pppoe_user', id + '_ct_coa', 'coa_disconnect', { username: oldUsername });
        }

        // MikroTik sync — handle connectionType transitions
        if (finalRouterId) {
          const router = await tx.router.findUnique({
            where: { id: finalRouterId },
            select: { authMode: true },
          });
          const { shouldCreate, disabled } = shouldCreatePppSecret(router?.authMode);
          const mtProfileRaw = newProfile ? await getMikrotikProfileName(newProfile.id) : null;
          const usernameChanged = oldUsername && oldUsername !== newUsername;
          // Isolated users: keep enabled but use 'isolir' profile (user can still login
          //   to get isolir profile with rate-limit). Stop/blocked: disable secret entirely.
          const mtDisabled = effectiveStatus === 'blocked' || effectiveStatus === 'stop' ? true : disabled;
          const mtProfile = effectiveStatus === 'isolated' ? 'isolir' : (mtProfileRaw || undefined);
          const finalIp = data.ipAddress !== undefined ? data.ipAddress : currentUser.ipAddress;
          const finalMac = cleanMac(data.macAddress !== undefined ? data.macAddress : currentUser.macAddress);

          if (connectionTypeChanged) {
            // Connection type transition — clean up old type's MikroTik entries, create new type's entries

            // 1. Remove old connection type's entries from MikroTik
            if (oldConnectionType === 'PPPOE') {
              // Was PPPoE: delete PPP secret
              await enqueueTask(tx, 'pppoe_user', id + '_old_secret', 'sync_mikrotik_delete', {
                routerId: finalRouterId, username: oldUsername,
              });
            } else if (oldConnectionType === 'STATIC_IP') {
              // Was Static IP: delete ARP entry
              await enqueueTask(tx, 'pppoe_user', id + '_old_arp', 'sync_mikrotik_arp_delete', {
                routerId: finalRouterId, ipAddress: currentUser.ipAddress || '', macAddress: currentUser.macAddress || '',
              });
            } else if (oldConnectionType === 'HOTSPOT') {
              // Was Hotspot: delete hotspot user
              await enqueueTask(tx, 'pppoe_user', id + '_old_hotspot', 'sync_mikrotik_hotspot_delete', {
                routerId: finalRouterId, username: oldUsername,
              });
            }

            // 2. Create new connection type's entries in MikroTik
            if (newConnectionType === 'PPPOE' && shouldCreate) {
              await enqueueTask(tx, 'pppoe_user', id, 'sync_mikrotik_create', {
                routerId: finalRouterId, username: newUsername,
                password: data.password || currentUser.password,
                profile: mtProfile || undefined, disabled: mtDisabled,
                comment: 'Salfanet-' + id.slice(0, 8),
              });
            } else if (newConnectionType === 'STATIC_IP') {
              await enqueueTask(tx, 'pppoe_user', id, 'sync_mikrotik_arp_create', {
                routerId: finalRouterId, ipAddress: finalIp || '', macAddress: finalMac || '',
                comment: 'Salfanet-' + id.slice(0, 8),
              });
            } else if (newConnectionType === 'HOTSPOT') {
              await enqueueTask(tx, 'pppoe_user', id, 'sync_mikrotik_hotspot_create', {
                routerId: finalRouterId, username: newUsername,
                password: data.password || currentUser.password,
                profile: mtProfile || undefined, ipAddress: finalIp || '',
                disabled: mtDisabled,
                comment: 'Salfanet-' + id.slice(0, 8),
              });
            }
          } else if (newConnectionType === 'PPPOE' && shouldCreate) {
            // No connectionType change — normal PPPoE PPP secret sync
            // Always use sync_mikrotik_create (idempotent upsert) — works even if secret was never created
            if (usernameChanged) {
              await enqueueTask(tx, 'pppoe_user', id + '_old', 'sync_mikrotik_delete', {
                routerId: finalRouterId, username: oldUsername,
              });
              await enqueueTask(tx, 'pppoe_user', id, 'sync_mikrotik_create', {
                routerId: finalRouterId, username: newUsername,
                password: data.password || currentUser.password,
                profile: mtProfile || undefined, disabled: mtDisabled,
                comment: 'Salfanet-' + id.slice(0, 8),
              });
            } else {
              // Use create (upsert) instead of update — handles case where secret doesn't exist yet
              await enqueueTask(tx, 'pppoe_user', id, 'sync_mikrotik_create', {
                routerId: finalRouterId, username: newUsername,
                password: data.password || currentUser.password,
                profile: mtProfile || undefined, disabled: mtDisabled,
                comment: 'Salfanet-' + id.slice(0, 8),
              });
            }
          } else if (newConnectionType === 'STATIC_IP' && !connectionTypeChanged) {
            // Static IP — update ARP entry if IP/MAC changed
            if (data.ipAddress !== undefined || data.macAddress !== undefined) {
              await enqueueTask(tx, 'pppoe_user', id, 'sync_mikrotik_arp_update', {
                routerId: finalRouterId,
                oldIpAddress: currentUser.ipAddress || '',
                newIpAddress: finalIp || '',
                macAddress: finalMac || '',
                comment: 'Salfanet-' + id.slice(0, 8),
              });
            }
          } else if (newConnectionType === 'HOTSPOT' && !connectionTypeChanged) {
            // Hotspot — update hotspot user if credentials changed
            if (data.username || data.password || data.ipAddress !== undefined) {
              await enqueueTask(tx, 'pppoe_user', id, 'sync_mikrotik_hotspot_update', {
                routerId: finalRouterId,
                oldUsername: oldUsername,
                newUsername: newUsername,
                password: data.password || currentUser.password,
                profile: mtProfile || undefined,
                ipAddress: finalIp || '',
                disabled: mtDisabled,
                comment: 'Salfanet-' + id.slice(0, 8),
              });
            }
          }
        }
      });
    } catch (syncError) {
      console.error('RADIUS re-sync error:', syncError);
    }
  }

  // CoA disconnect is now enqueued as external task in the transaction above

  // Activity log
  try {
    const changes: Record<string, unknown> = {};
    if (data.username !== user.username) changes.username = data.username;
    if (data.profileId !== user.profileId) changes.profileId = data.profileId;
    if (data.status !== currentUser.status) changes.status = data.status;
    if (connectionTypeChanged) changes.connectionType = { from: oldConnectionType, to: newConnectionType };

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

  // Invalidate profiles cache (user count may have changed if profileId changed)
  try { await invalidateKey(CACHE_KEYS.profiles); } catch {}

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

  // â”€â”€â”€ ATOMIC: RADIUS cleanup + user delete + external task enqueue â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // All DB operations in a single transaction. External side effects
  // (MikroTik kick, MikroTik secret delete) are enqueued to the outbox.
  try {
    await prisma.$transaction(async (tx) => {
      // RADIUS DB cleanup (radcheck, radreply, radusergroup, radacct)
      await tx.radcheck.deleteMany({ where: { username: user.username } });
      await tx.radreply.deleteMany({ where: { username: user.username } });
      await tx.radusergroup.deleteMany({ where: { username: user.username } });
      // Stop any open accounting sessions and mark them terminated
      await tx.radacct.updateMany({
        where: { username: user.username, acctstoptime: null },
        data: { acctstoptime: new Date() },
      });

      // Delete user from SalfaNet DB
      await tx.pppoeUser.delete({ where: { id } });

      // â”€â”€â”€ Enqueue external tasks (same transaction) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const { enqueueTask } = await import('./external-task.service');

      // MikroTik: kick active sessions
      await enqueueTask(tx, 'pppoe_user', id, 'coa_disconnect', {
        username: user.username,
      });

      // MikroTik: delete entry based on connectionType
      const connType = user.connectionType || 'PPPOE';
      if (user.routerId) {
        if (connType === 'PPPOE') {
          await enqueueTask(tx, 'pppoe_user', id, 'sync_mikrotik_delete', {
            routerId: user.routerId,
            username: user.username,
          });
        } else if (connType === 'STATIC_IP') {
          await enqueueTask(tx, 'pppoe_user', id, 'sync_mikrotik_arp_delete', {
            routerId: user.routerId,
            ipAddress: user.ipAddress || '',
            macAddress: user.macAddress || '',
          });
        } else if (connType === 'HOTSPOT') {
          await enqueueTask(tx, 'pppoe_user', id, 'sync_mikrotik_hotspot_delete', {
            routerId: user.routerId,
            username: user.username,
          });
        }
      } else {
        // No specific router: enqueue delete for all active routers
        const activeRouters = await tx.router.findMany({
          where: { isActive: true },
          select: { id: true },
        });
        for (const r of activeRouters) {
          // Use unique entityId per router to avoid unique constraint collision
          const op = connType === 'STATIC_IP' ? 'sync_mikrotik_arp_delete' :
                     connType === 'HOTSPOT' ? 'sync_mikrotik_hotspot_delete' :
                     'sync_mikrotik_delete';
          const payload: Record<string, unknown> = { routerId: r.id };
          if (connType === 'STATIC_IP') {
            payload.ipAddress = user.ipAddress || '';
            payload.macAddress = user.macAddress || '';
          } else {
            payload.username = user.username;
          }
          await enqueueTask(tx, 'pppoe_user', `${id}_${r.id}`, op, payload);
        }
      }
    });
  } catch (deleteError: any) {
    console.error('[DELETE] DB transaction error:', deleteError);
    // If the transaction failed, the user is NOT deleted â€” safe to retry
    throw deleteError;
  }

  // Invalidate profiles cache (user count changed)
  try { await invalidateKey(CACHE_KEYS.profiles); } catch {}

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
