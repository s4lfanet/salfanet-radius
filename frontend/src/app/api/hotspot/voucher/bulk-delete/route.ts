import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { prisma } from '@/server/db/client'
import { removeVoucherFromRadius } from '@/server/services/radius/hotspot-sync.service'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json()
    const { ids } = body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'Voucher IDs are required' },
        { status: 400 }
      )
    }

    // Get voucher codes before deletion
    const vouchers = await prisma.hotspotVoucher.findMany({
      where: { id: { in: ids } },
      select: { code: true, agentId: true, profile: { select: { name: true } } }
    })

    // Delete vouchers
    const result = await prisma.hotspotVoucher.deleteMany({
      where: {
        id: { in: ids }
      }
    })

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

    // Remove from RADIUS
    for (const v of vouchers) {
      try {
        await removeVoucherFromRadius(v.code)
      } catch (error) {
        console.error(`Failed to remove ${v.code} from RADIUS:`, error)
      }
    }

    return NextResponse.json({ 
      success: true, 
      count: result.count 
    })
  } catch (error) {
    console.error('Bulk delete vouchers error:', error)
    return NextResponse.json(
      { error: 'Failed to delete vouchers' },
      { status: 500 }
    )
  }
}
