/**
 * Hotspot Voucher service — business logic extracted from route handlers.
 */

import { prisma } from '@/server/db/client';
import { logActivity } from '@/server/services/activity-log.service';
import {
  removeVoucherFromRadius,
} from '@/server/services/radius/hotspot-sync.service';
import { formatInTimeZone } from 'date-fns-tz';
import { WIB_TIMEZONE } from '@/lib/timezone';
import type { Session } from 'next-auth';

// ─── Code generation helpers ──────────────────────────────────────────────────

export const CODE_TYPES: Record<string, { name: string; chars: string }> = {
  'alpha-upper': { name: 'ABCDEFGHJKLMN', chars: 'ABCDEFGHJKLMNPQRSTUVWXYZ' },
  'alpha-lower': { name: 'abcdefghjklmnp', chars: 'abcdefghjklmnpqrstuvwxyz' },
  'alpha-mixed': {
    name: 'AbCdEfGhJKLMN',
    chars: 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjklmnpqrstuvwxyz',
  },
  'alpha-camel': {
    name: 'aBcDeFgHjKmn',
    chars: 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjklmnpqrstuvwxyz',
  },
  numeric: { name: '123456789563343', chars: '123456789' },
  'alphanumeric-lower': {
    name: '123456abcdefgkh',
    chars: 'abcdefghjklmnpqrstuvwxyz123456789',
  },
  'alphanumeric-upper': {
    name: '456789ABCDEFGHJ',
    chars: 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789',
  },
  'alphanumeric-mixed': {
    name: '56789aBcDefgiJKlm',
    chars: 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjklmnpqrstuvwxyz123456789',
  },
};

function generateVoucherCode(length: number, prefix = '', codeType = 'alpha-upper'): string {
  const chars = CODE_TYPES[codeType]?.chars ?? CODE_TYPES['alpha-upper'].chars;
  let code = prefix;
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generatePassword(length: number, codeType = 'alpha-upper'): string {
  const chars = CODE_TYPES[codeType]?.chars ?? CODE_TYPES['alpha-upper'].chars;
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function generateBatchCode(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const time =
    String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
  return `BATCH-${year}${month}${day}-${time}`;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export interface ListVouchersParams {
  profileId?: string | null;
  batchCode?: string | null;
  status?: string | null;
  routerId?: string | null;
  agentId?: string | null;
  page?: number;
  limit?: number;
}

export async function listVouchers(params: ListVouchersParams) {
  const { page = 1, limit = 100 } = params;

  const where: Record<string, unknown> = {};
  if (params.profileId && params.profileId !== 'all') where.profileId = params.profileId;
  if (params.batchCode && params.batchCode !== 'all') where.batchCode = params.batchCode;
  if (params.routerId && params.routerId !== 'all') where.routerId = params.routerId;
  if (params.agentId && params.agentId !== 'all') where.agentId = params.agentId;
  if (params.status && params.status !== 'all' && ['WAITING', 'ACTIVE', 'EXPIRED'].includes(params.status)) {
    where.status = params.status;
  }

  // Stats use same filters minus status
  const statsWhere = { ...where };
  delete statsWhere.status;

  const [totalAll, waitingCount, activeCount, expiredCount, vouchersForValue, total] =
    await Promise.all([
      prisma.hotspotVoucher.count({ where: statsWhere }),
      prisma.hotspotVoucher.count({ where: { ...statsWhere, status: 'WAITING' } }),
      prisma.hotspotVoucher.count({ where: { ...statsWhere, status: 'ACTIVE' } }),
      prisma.hotspotVoucher.count({ where: { ...statsWhere, status: 'EXPIRED' } }),
      prisma.hotspotVoucher.findMany({
        where: statsWhere,
        include: { profile: { select: { sellingPrice: true } } },
      }),
      prisma.hotspotVoucher.count({ where }),
    ]);

  const totalValue = vouchersForValue.reduce(
    (sum: number, v: { profile: { sellingPrice: number } }) => sum + v.profile.sellingPrice,
    0
  );

  const skip = (page - 1) * limit;
  const vouchers = await prisma.hotspotVoucher.findMany({
    where,
    include: {
      profile: {
        select: {
          name: true,
          sellingPrice: true,
          validityValue: true,
          validityUnit: true,
          usageQuota: true,
          usageDuration: true,
        },
      },
      router: { select: { id: true, name: true, shortname: true } },
      agent: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { createdAt: 'desc' },
    skip,
    take: limit,
  });

  const batches = await prisma.hotspotVoucher.findMany({
    select: { batchCode: true },
    distinct: ['batchCode'],
    orderBy: { batchCode: 'desc' },
  });

  const codeTypes = Object.entries(CODE_TYPES).map(([key, value]) => ({
    value: key,
    label: value.name,
  }));

  const vouchersWithLocalTime = vouchers.map((v) => ({
    ...v,
    profile: {
      ...v.profile,
      usageQuota: v.profile.usageQuota ? Number(v.profile.usageQuota) : null,
    },
    createdAt: formatInTimeZone(v.createdAt, WIB_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
    updatedAt: formatInTimeZone(v.updatedAt, WIB_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
    firstLoginAt: v.firstLoginAt ? formatInTimeZone(v.firstLoginAt, WIB_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss.SSS") : null,
    expiresAt: v.expiresAt ? formatInTimeZone(v.expiresAt, WIB_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss.SSS") : null,
  }));

  return {
    vouchers: vouchersWithLocalTime,
    batches: batches.map((b) => b.batchCode).filter(Boolean),
    codeTypes,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    pageSize: limit,
    stats: {
      total: totalAll,
      waiting: waitingCount,
      active: activeCount,
      expired: expiredCount,
      totalValue,
    },
  };
}

// ─── Generate ─────────────────────────────────────────────────────────────────

export interface GenerateVouchersInput {
  quantity: number;
  profileId: string;
  routerId?: string;
  agentId?: string;
  codeLength?: number;
  prefix?: string;
  voucherType?: string;
  codeType?: string;
  lockMac?: boolean;
  batchCode?: string; // optional: reuse an existing batchCode for multi-chunk generation
}

export async function generateVouchers(data: GenerateVouchersInput, session: Session | null) {
  const {
    quantity,
    profileId,
    routerId,
    agentId,
    codeLength = 6,
    prefix = '',
    voucherType = 'same',
    codeType = 'alpha-upper',
    lockMac = false,
    batchCode: inputBatchCode,
  } = data;

  if (quantity > 25000) {
    throw Object.assign(new Error('Cannot generate more than 25000 vouchers at once'), {
      code: 'VALIDATION',
    });
  }

  const profile = await prisma.hotspotProfile.findUnique({ where: { id: profileId } });
  if (!profile) throw Object.assign(new Error('Profile not found'), { code: 'NOT_FOUND' });

  if (routerId) {
    const router = await prisma.router.findUnique({ where: { id: routerId } });
    if (!router) throw Object.assign(new Error('Router not found'), { code: 'NOT_FOUND' });
  }

  if (agentId) {
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' });
  }

  const batchCode = inputBatchCode || generateBatchCode();
  const codes = new Set<string>();
  const voucherData = [];

  for (let i = 0; i < quantity; i++) {
    let code = '';
    let attempts = 0;
    do {
      code = generateVoucherCode(codeLength, prefix, codeType);
      attempts++;
      if (attempts > 100) {
        throw new Error('Failed to generate unique voucher codes. Try different prefix or length.');
      }
    } while (codes.has(code));

    codes.add(code);
    const password = voucherType === 'different' ? generatePassword(codeLength, codeType) : null;

    voucherData.push({
      id: crypto.randomUUID(),
      code,
      password,
      profileId,
      routerId: routerId || null,
      agentId: agentId || null,
      voucherType,
      codeType,
      batchCode,
      status: 'WAITING' as const,
    });
  }

  const result = await prisma.hotspotVoucher.createMany({
    data: voucherData,
    skipDuplicates: true,
  });

  // RADIUS sync — batch mode (3 createMany instead of quantity × 7 queries)
  let syncCount = 0;
  try {
    const profileName = profile.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const mikrotikProfile = profile.groupProfile || 'SALFANET';

    let sessionTimeout = 0;
    switch (profile.validityUnit) {
      case 'MINUTES': sessionTimeout = profile.validityValue * 60; break;
      case 'HOURS':   sessionTimeout = profile.validityValue * 3600; break;
      case 'DAYS':    sessionTimeout = profile.validityValue * 86400; break;
      case 'MONTHS':  sessionTimeout = profile.validityValue * 30 * 86400; break;
    }

    const radcheckRows: { username: string; attribute: string; op: string; value: string }[] = [];
    const radusergroupRows: { username: string; groupname: string; priority: number }[] = [];
    const radgroupreplyRows: { groupname: string; attribute: string; op: string; value: string }[] = [];

    for (const v of voucherData) {
      const uniqueGroup = `hotspot-${profileName}-${v.code}`;
      const pwd = v.password || v.code;
      radcheckRows.push({ username: v.code, attribute: 'Cleartext-Password', op: ':=', value: pwd });
      radusergroupRows.push({ username: v.code, groupname: uniqueGroup, priority: 1 });
      radgroupreplyRows.push(
        { groupname: uniqueGroup, attribute: 'Mikrotik-Group',      op: ':=', value: mikrotikProfile },
        { groupname: uniqueGroup, attribute: 'Mikrotik-Rate-Limit', op: ':=', value: profile.speed },
        { groupname: uniqueGroup, attribute: 'Session-Timeout',     op: ':=', value: sessionTimeout.toString() },
      );
    }

    await prisma.radcheck.createMany({ data: radcheckRows, skipDuplicates: true });
    await prisma.radusergroup.createMany({ data: radusergroupRows, skipDuplicates: true });
    await prisma.radgroupreply.createMany({ data: radgroupreplyRows, skipDuplicates: false });
    syncCount = result.count;
  } catch (syncError) {
    console.error('RADIUS batch sync error:', syncError);
  }

  // Activity log
  try {
    await logActivity({
      userId: (session?.user as never as { id: string })?.id,
      username: (session?.user as never as { username: string })?.username || 'Admin',
      userRole: (session?.user as never as { role: string })?.role,
      action: 'GENERATE_VOUCHERS',
      description: `Generated ${result.count} vouchers in batch ${batchCode}`,
      module: 'hotspot',
      status: 'success',
      metadata: { batchCode, profileId, quantity: result.count },
    });
  } catch (logError) {
    console.error('Activity log error:', logError);
  }

  // Notify agent if vouchers were assigned to one
  if (agentId && result.count > 0) {
    try {
      await prisma.agentNotification.create({
        data: {
          agentId,
          type: 'voucher_generated',
          title: 'Voucher Ditambahkan Admin',
          message: `Admin menambahkan ${result.count} voucher ${profile.name} ke akun Anda (batch: ${batchCode}).`,
        },
      });
    } catch (notifError) {
      console.error('Failed to notify agent about voucher generation:', notifError);
    }
  }

  return { count: result.count, batchCode, syncCount };
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteVouchers(params: { id?: string; batchCode?: string }) {
  const { id, batchCode } = params;

  if (batchCode) {
    const vouchersToDelete = await prisma.hotspotVoucher.findMany({
      where: { batchCode },
      select: {
        code: true,
        agentId: true,
        profile: { select: { name: true } },
      },
    });

    const result = await prisma.hotspotVoucher.deleteMany({ where: { batchCode } });

    // Notify agents
    const agentIds = [...new Set(vouchersToDelete.filter((v) => v.agentId).map((v) => v.agentId))];
    for (const agentIdValue of agentIds) {
      if (agentIdValue) {
        const count = vouchersToDelete.filter((v) => v.agentId === agentIdValue).length;
        const profileName = vouchersToDelete.find((v) => v.agentId === agentIdValue)?.profile.name ?? 'Unknown';
        try {
          await prisma.agentNotification.create({
            data: {
              id: Math.random().toString(36).substring(2, 15),
              agentId: agentIdValue,
              type: 'voucher_deleted',
              title: 'Voucher Dihapus',
              message: `Admin telah menghapus ${count} voucher ${profileName} dari batch ${batchCode}.`,
              link: null,
            },
          });
        } catch (err) {
          console.error('Failed to create agent notification:', err);
        }
      }
    }

    // RADIUS cleanup - fire and forget so DB delete is not blocked
    for (const v of vouchersToDelete) {
      removeVoucherFromRadius(v.code).catch(err => {
        console.error(`Failed to remove ${v.code} from RADIUS:`, err);
      });
    }

    return { count: result.count };
  }

  if (id) {
    const voucher = await prisma.hotspotVoucher.findUnique({ where: { id } });
    if (!voucher) throw Object.assign(new Error('Voucher not found'), { code: 'NOT_FOUND' });

    await prisma.hotspotVoucher.delete({ where: { id } });

    // Notify agent
    if (voucher.agentId) {
      try {
        const withProfile = await prisma.hotspotVoucher
          .findFirst({ where: { code: voucher.code }, include: { profile: { select: { name: true } } } })
          .catch(() => null);
        await prisma.agentNotification.create({
          data: {
            id: Math.random().toString(36).substring(2, 15),
            agentId: voucher.agentId,
            type: 'voucher_deleted',
            title: 'Voucher Dihapus',
            message: `Admin telah menghapus voucher ${voucher.code} (${withProfile?.profile.name ?? 'Unknown'}).`,
            link: null,
          },
        });
      } catch (err) {
        console.error('Failed to create agent notification:', err);
      }
    }

    // RADIUS cleanup - fire and forget so DB delete is not blocked
    removeVoucherFromRadius(voucher.code).catch(err => {
      console.error('Failed to remove from RADIUS:', err);
    });

    return { count: 1 };
  }

  throw Object.assign(new Error('Voucher ID or Batch Code required'), { code: 'VALIDATION' });
}

// ─── Patch (bulk update) ──────────────────────────────────────────────────────

export async function patchVouchers(
  ids: string[],
  fields: {
    profileId?: string;
    routerId?: string | null;
    agentId?: string | null;
    clearAgent?: boolean;
    clearRouter?: boolean;
  },
  session: Session | null
) {
  const updateData: Record<string, unknown> = {};
  if (fields.profileId) updateData.profileId = fields.profileId;
  if (fields.routerId) updateData.routerId = fields.routerId;
  else if (fields.clearRouter) updateData.routerId = null;
  if (fields.agentId) updateData.agentId = fields.agentId;
  else if (fields.clearAgent) updateData.agentId = null;

  if (Object.keys(updateData).length === 0) {
    throw Object.assign(new Error('No fields to update'), { code: 'VALIDATION' });
  }

  const result = await prisma.hotspotVoucher.updateMany({
    where: { id: { in: ids } },
    data: updateData,
  });

  try {
    await logActivity({
      action: 'UPDATE',
      module: 'voucher',
      description: `Updated ${result.count} voucher(s): ${Object.keys(updateData).join(', ')}`,
      userId: (session?.user as never as { id: string })?.id,
      username: (session?.user as never as { username: string })?.username || 'Admin',
      userRole: (session?.user as never as { role: string })?.role,
      status: 'success',
    });
  } catch (logError) {
    console.error('Activity log error:', logError);
  }

  // Notify agent when vouchers are assigned to them
  if (fields.agentId && result.count > 0) {
    try {
      const sampleVoucher = await prisma.hotspotVoucher.findFirst({
        where: { id: { in: ids } },
        select: { profile: { select: { name: true } } },
      });
      const profileName = sampleVoucher?.profile?.name || 'Voucher';
      await prisma.agentNotification.create({
        data: {
          agentId: fields.agentId,
          type: 'voucher_generated',
          title: 'Voucher Ditambahkan Admin',
          message: `Admin menambahkan ${result.count} voucher ${profileName} ke akun Anda.`,
        },
      });
    } catch (notifError) {
      console.error('Failed to notify agent about voucher assignment:', notifError);
    }
  }

  return { updated: result.count };
}
