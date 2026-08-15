import { NextResponse } from 'next/server'
import { requirePermission } from '@/server/middleware/api-auth'
import { prisma } from '@/server/db/client'
import { removeVoucherFromRadius } from '@/server/services/radius/hotspot-sync.service'

export async function POST() {
  try {
    const authCheck = await requirePermission('vouchers.delete')
    if (!authCheck.authorized) return authCheck.response
    // Get expired voucher codes before deletion
    const expiredVouchers = await prisma.hotspotVoucher.findMany({
      where: { status: 'EXPIRED' },
      select: { code: true }
    })

    // Delete expired vouchers
    const result = await prisma.hotspotVoucher.deleteMany({
      where: {
        status: 'EXPIRED'
      }
    })

    // Remove from RADIUS
    for (const v of expiredVouchers) {
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
    console.error('Delete expired vouchers error:', error)
    return NextResponse.json(
      { error: 'Failed to delete expired vouchers' },
      { status: 500 }
    )
  }
}
