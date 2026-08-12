import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { unauthorized } from '@/lib/api-response'
import { getAllScheduleConfigs, CRON_JOB_MAP } from '@/server/cron/jobs'
import { prisma } from '@/server/db/client'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()

  try {
    const schedules = await getAllScheduleConfigs()
    return NextResponse.json({ success: true, schedules })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if ((session.user as any)?.role !== 'SUPERADMIN' && (session.user as any)?.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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
        updatedBy: (session.user as any)?.email || 'admin',
      },
      update: {
        schedule,
        enabled: enabled ?? true,
        updatedBy: (session.user as any)?.email || 'admin',
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
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if ((session.user as any)?.role !== 'SUPERADMIN' && (session.user as any)?.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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
