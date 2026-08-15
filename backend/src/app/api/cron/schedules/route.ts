import { NextResponse } from 'next/server'
import { requirePermission } from '@/server/middleware/api-auth'
import { getAllScheduleConfigs, CRON_JOB_MAP } from '@/server/cron/jobs'
import { prisma } from '@/server/db/client'

export async function GET() {
  const authCheck = await requirePermission('settings.cron')
  if (!authCheck.authorized) return authCheck.response

  try {
    const schedules = await getAllScheduleConfigs()
    return NextResponse.json({ success: true, schedules })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const authCheck = await requirePermission('settings.cron')
  if (!authCheck.authorized) return authCheck.response

  try {
    const body = await request.json()
    const { jobType, schedule, enabled } = body

    if (!jobType || !schedule) {
      return NextResponse.json({ error: 'jobType and schedule required' }, { status: 400 })
    }

    const def = CRON_JOB_MAP.get(jobType)
    if (!def) {
      return NextResponse.json({ error: `Unknown job type: ${jobType}` }, { status: 400 })
    }

    // Validate cron expression (basic check)
    const parts = schedule.trim().split(/\s+/)
    if (parts.length !== 5) {
      return NextResponse.json({ error: 'Invalid cron expression — must have 5 fields' }, { status: 400 })
    }

    await prisma.cronScheduleConfig.upsert({
      where: { jobType },
      create: {
        jobType,
        schedule,
        enabled: enabled ?? true,
        updatedBy: authCheck.session.user?.email || 'admin',
      },
      update: {
        schedule,
        enabled: enabled ?? true,
        updatedBy: authCheck.session.user?.email || 'admin',
      },
    })

    return NextResponse.json({
      success: true,
      message: `Schedule for ${jobType} updated. Restart cron runner to apply.`,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const authCheck = await requirePermission('settings.cron')
  if (!authCheck.authorized) return authCheck.response

  try {
    const { searchParams } = new URL(request.url)
    const jobType = searchParams.get('jobType')
    if (!jobType) return NextResponse.json({ error: 'jobType required' }, { status: 400 })

    await prisma.cronScheduleConfig.delete({ where: { jobType } })

    return NextResponse.json({
      success: true,
      message: `${jobType} reverted to default schedule. Restart cron runner to apply.`,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 })
  }
}
