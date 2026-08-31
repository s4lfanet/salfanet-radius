import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { removeBatchVouchersFromMikrotik } from '@/server/services/mikrotik/hotspot-voucher.service';
import { createAgentNotificationAndPush } from '@/server/services/agent-notification.service';

// POST - Hapus multiple vouchers
export async function POST(request: NextRequest) {
  try {
    const authCheck = await requirePermission('vouchers.delete');
    if (!authCheck.authorized) return authCheck.response;
    const body = await request.json();
    const { voucherIds } = body;

    if (!voucherIds || !Array.isArray(voucherIds) || voucherIds.length === 0) {
      return NextResponse.json({ error: 'Voucher IDs array is required' }, { status: 400 });
    }

    // Get voucher codes untuk hapus dari radcheck
    const vouchers = await prisma.hotspotVoucher.findMany({
      where: { id: { in: voucherIds } },
      select: { id: true, code: true, agentId: true, routerId: true, profile: { select: { name: true } } },
    });

    const voucherCodes = vouchers.map(v => v.code);

    // Hapus dari radcheck
    if (voucherCodes.length > 0) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM radcheck WHERE username IN (${voucherCodes.map(() => '?').join(',')})`,
        ...voucherCodes
      );
    }

    // Hapus vouchers
    const result = await prisma.hotspotVoucher.deleteMany({
      where: { id: { in: voucherIds } },
    });

    // Notify agents whose vouchers were deleted
    const agentVouchers = vouchers.filter(v => v.agentId);
    const agentGrouped = agentVouchers.reduce<Record<string, { count: number; profileName: string }>>((acc, v) => {
      if (v.agentId) {
        if (!acc[v.agentId]) acc[v.agentId] = { count: 0, profileName: v.profile.name };
        acc[v.agentId].count++;
      }
      return acc;
    }, {});
    for (const [agentId, info] of Object.entries(agentGrouped)) {
      try {
        await createAgentNotificationAndPush(agentId, {
          type: 'voucher_deleted',
          title: 'Voucher Dihapus',
          message: `Admin telah menghapus ${info.count} voucher ${info.profileName} dari akun Anda.`,
        });
      } catch (_) { /* non-critical */ }
    }

    // MikroTik local cleanup - batch remove per router
    const routerGroups = new Map<string, string[]>();
    for (const v of vouchers) {
      const rid = v.routerId || 'all';
      if (!routerGroups.has(rid)) routerGroups.set(rid, []);
      routerGroups.get(rid)!.push(v.code);
    }
    for (const [rid, codes] of routerGroups) {
      try {
        if (rid === 'all') {
          const { removeVoucherFromAllMikrotik } = await import('@/server/services/mikrotik/hotspot-voucher.service');
          for (const code of codes) {
            await removeVoucherFromAllMikrotik(code);
          }
        } else {
          await removeBatchVouchersFromMikrotik(rid, codes);
        }
      } catch (err) {
        console.error('[DELETE-MULTIPLE] MikroTik cleanup failed for router', rid, err);
      }
    }

    return NextResponse.json({
      success: true,
      deleted: result.count,
      message: `${result.count} voucher(s) deleted successfully`,
    });
  } catch (error) {
    console.error('Delete multiple vouchers error:', error);
    return NextResponse.json({ error: 'Failed to delete vouchers' }, { status: 500 });
  }
}
