import { NextResponse } from 'next/server'
import { requirePermission } from '@/server/middleware/api-auth'
import { fetchAllVoucherStatusesFromMikrotik } from '@/server/services/mikrotik/hotspot-voucher.service'
import { syncVoucherStatusFromRadius } from '@/server/services/radius/hotspot-sync.service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/hotspot/voucher/sync-status
 * Fetches voucher status from all MikroTik routers (API) + RADIUS radacct and updates DB.
 * Can be called manually (cron job calls the service in-process instead).
 */
export async function POST() {
  const authCheck = await requirePermission('vouchers.view')
  if (!authCheck.authorized) return authCheck.response
  try {
    const [mtResult, radiusResult] = await Promise.all([
      fetchAllVoucherStatusesFromMikrotik(),
      syncVoucherStatusFromRadius(),
    ])

    const totalUpdated = mtResult.results.reduce((sum, r) => sum + r.updated, 0)
    const totalErrors = mtResult.results.reduce((sum, r) => sum + r.errors.length, 0) + radiusResult.errors.length

    return NextResponse.json({
      success: true,
      message: `Synced ${mtResult.totalRouters} router(s), updated ${totalUpdated} MT + ${radiusResult.activated} RADIUS voucher(s)${totalErrors > 0 ? `, ${totalErrors} error(s)` : ''}`,
      totalRouters: mtResult.totalRouters,
      totalUpdated,
      radiusActivated: radiusResult.activated,
      radiusExpired: radiusResult.expired,
      results: mtResult.results.map(r => ({
        routerId: r.routerId,
        routerName: r.routerName,
        updated: r.updated,
        errors: r.errors,
      })),
    })
  } catch (error) {
    console.error('Sync voucher status error:', error)
    return NextResponse.json(
      { error: 'Failed to sync voucher status: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 },
    )
  }
}
