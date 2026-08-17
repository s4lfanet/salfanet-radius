import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { cleanupAllOrphanedMikrotikUsers } from '@/server/services/mikrotik/hotspot-voucher.service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/hotspot/voucher/cleanup-mikrotik
 * Removes orphaned hotspot users from MikroTik that no longer exist in DB.
 *
 * Body options:
 *   - profileName: string (optional) — only cleanup users with this profile
 *   - dryRun: boolean (optional) — if true, only report orphans without removing
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const options: { profileName?: string; dryRun?: boolean } = {}

    if (body.profileName) options.profileName = String(body.profileName)
    if (body.dryRun === true) options.dryRun = true

    const result = await cleanupAllOrphanedMikrotikUsers(options)

    const totalOrphaned = result.results.reduce((sum, r) => sum + r.orphanedCount, 0)
    const totalRemoved = result.results.reduce((sum, r) => sum + r.removedCount, 0)
    const totalErrors = result.results.reduce((sum, r) => sum + r.errors.length, 0)

    return NextResponse.json({
      success: true,
      message: options.dryRun
        ? `Dry run: found ${totalOrphaned} orphaned user(s) across ${result.totalRouters} router(s)`
        : `Removed ${totalRemoved} orphaned user(s) across ${result.totalRouters} router(s)${totalErrors > 0 ? `, ${totalErrors} error(s)` : ''}`,
      totalRouters: result.totalRouters,
      totalOrphaned,
      totalRemoved,
      dryRun: options.dryRun ?? false,
      results: result.results,
    })
  } catch (error) {
    console.error('Cleanup MikroTik error:', error)
    return NextResponse.json(
      { error: 'Failed to cleanup: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 },
    )
  }
}
