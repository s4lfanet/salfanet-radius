import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { prisma } from '@/server/db/client'
import { unauthorized } from '@/lib/api-response'
import { CRON_JOBS } from '@/server/jobs/jobs.config'

// GET — return all jobs with their current schedule (DB override or default)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()

  const overrides = await prisma.cronScheduleConfig.findMany()
  const overrideMap = Object.fromEntries(overrides.map(o => [o.jobType, o]))

  const schedules = CRON_JOBS.map(job => {
    const override = overrideMap[job.type]
    return {
      jobType: job.type,
      name: job.name,
      description: job.description,
      defaultSchedule: job.schedule,
      defaultScheduleLabel: job.scheduleLabel,
      schedule: override?.schedule ?? job.schedule,
      enabled: override?.enabled ?? job.enabled,
      hasOverride: !!override,
      updatedAt: override?.updatedAt ?? null,
    }
  })

  return NextResponse.json({ success: true, schedules })
}

// PUT — update schedule for a specific job type
export async function PUT(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()

  // Only superadmin can edit schedules
  if ((session.user as any)?.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { jobType, schedule, enabled } = body

  if (!jobType) {
    return NextResponse.json({ error: 'jobType is required' }, { status: 400 })
  }

  const job = CRON_JOBS.find(j => j.type === jobType)
  if (!job) {
    return NextResponse.json({ error: `Unknown job type: ${jobType}` }, { status: 400 })
  }

  // Validate cron expression if provided (basic check)
  if (schedule && schedule !== 'dynamic') {
    const parts = schedule.trim().split(/\s+/)
    if (parts.length < 5 || parts.length > 6) {
      return NextResponse.json({ error: 'Invalid cron expression (must have 5-6 parts)' }, { status: 400 })
    }
  }

  const updated = await prisma.cronScheduleConfig.upsert({
    where: { jobType },
    update: {
      ...(schedule !== undefined && { schedule }),
      ...(enabled !== undefined && { enabled }),
      updatedBy: (session.user as any)?.email ?? 'admin',
    },
    create: {
      jobType,
      schedule: schedule ?? job.schedule,
      enabled: enabled ?? job.enabled,
      updatedBy: (session.user as any)?.email ?? 'admin',
    },
  })

  return NextResponse.json({ success: true, config: updated })
}

// DELETE — remove override (revert to default schedule)
export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()

  if ((session.user as any)?.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const jobType = searchParams.get('jobType')
  if (!jobType) return NextResponse.json({ error: 'jobType required' }, { status: 400 })

  await prisma.cronScheduleConfig.deleteMany({ where: { jobType } })
  return NextResponse.json({ success: true })
}
