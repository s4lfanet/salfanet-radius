import { NextResponse } from 'next/server'
import { requirePermission } from '@/server/middleware/api-auth'
import { fetchAllVoucherStatusesFromMikrotik } from '@/server/services/mikrotik/hotspot-voucher.service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/hotspot/voucher/sync-status
 * Fetches voucher status from all local-only MikroTik routers and updates DB.
 * Can be called manually (cron job calls the service in-process instead).
 */
export async function POST() {
  const authCheck = await requirePermission('vouchers.view')
  if (!authCheck.authorized) return authCheck.response
  try {
    const result = await fetchAllVoucherStatusesFromMikrotik()

    const totalUpdated = result.results.reduce((sum, r) => sum + r.updated, 0)
    const totalErrors = result.results.reduce((sum, r) => sum + r.errors.length, 0)

    return NextResponse.json({
      success: true,
      message: `Synced ${result.totalRouters} router(s), updated ${totalUpdated} voucher(s)${totalErrors > 0 ? `, ${totalErrors} error(s)` : ''}`,
      totalRouters: result.totalRouters,
      totalUpdated,
      results: result.results.map(r => ({
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
