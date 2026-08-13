import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { prisma } from '@/server/db/client'
import { syncVoucherToRadius } from '@/server/services/radius/hotspot-sync.service'

/**
 * POST /api/hotspot/voucher/resync
 * Re-sync all vouchers to RADIUS with correct structure
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const vouchers = await prisma.hotspotVoucher.findMany({
      where: {
        status: { in: ['WAITING', 'ACTIVE'] }
      }
    })

    let successCount = 0
    const errors = []

    for (const voucher of vouchers) {
      try {
        await syncVoucherToRadius(voucher.id)
        successCount++
      } catch (error: any) {
        errors.push({
          code: voucher.code,
          error: error.message
        })
      }
    }

    return NextResponse.json({
      success: true,
      total: vouchers.length,
      synced: successCount,
      failed: errors.length,
      errors
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}
