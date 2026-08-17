import { NextResponse } from 'next/server'
import { requirePermission } from '@/server/middleware/api-auth'
import { syncHotspotProfileToAllLocalRouters, syncAllHotspotProfilesToLocalRouters } from '@/server/services/mikrotik/hotspot-profile.service'

export const dynamic = 'force-dynamic'

// POST /api/hotspot/profiles/sync
// Body: { profileId?: string } — if profileId is provided, sync that profile only.
// If no profileId, sync ALL active profiles to all local routers.
export async function POST(request: Request) {
  try {
    const authCheck = await requirePermission('hotspot.manage')
    if (!authCheck.authorized) return authCheck.response

    const body = await request.json().catch(() => ({}))
    const { profileId } = body

    if (profileId) {
      const result = await syncHotspotProfileToAllLocalRouters(profileId)
      return NextResponse.json({
        success: true,
        message: `Synced profile to ${result.total} local router(s): ${result.success} success, ${result.failed} failed`,
        total: result.total,
        successCount: result.success,
        failedCount: result.failed,
        results: result.results,
      })
    }

    // Sync all profiles
    const result = await syncAllHotspotProfilesToLocalRouters()
    return NextResponse.json({
      success: true,
      message: `Synced ${result.totalProfiles} profile(s) to ${result.totalRouters} local router(s)`,
      totalProfiles: result.totalProfiles,
      totalRouters: result.totalRouters,
      results: result.results,
    })
  } catch (error) {
    console.error('Sync hotspot profiles error:', error)
    return NextResponse.json(
      { error: 'Failed to sync profiles: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 },
    )
  }
}
