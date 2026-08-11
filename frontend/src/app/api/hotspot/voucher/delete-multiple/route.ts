import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';

// POST - Hapus multiple vouchers
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { voucherIds } = body;

    if (!voucherIds || !Array.isArray(voucherIds) || voucherIds.length === 0) {
      return NextResponse.json({ error: 'Voucher IDs array is required' }, { status: 400 });
    }

    // Get voucher codes untuk hapus dari radcheck
    const vouchers = await prisma.hotspotVoucher.findMany({
      where: { id: { in: voucherIds } },
      select: { id: true, code: true, agentId: true, profile: { select: { name: true } } },
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
        await prisma.agentNotification.create({
          data: {
            id: Math.random().toString(36).substring(2, 15),
            agentId,
            type: 'voucher_deleted',
            title: 'Voucher Dihapus',
            message: `Admin telah menghapus ${info.count} voucher ${info.profileName} dari akun Anda.`,
            link: null,
          },
        });
      } catch (_) { /* non-critical */ }
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
