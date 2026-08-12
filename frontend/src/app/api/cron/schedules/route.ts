import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { unauthorized } from '@/lib/api-response'

// Cron schedules now managed by NestJS backend
// This legacy route delegates to the backend API

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()

  const token = (session as any).accessToken || ''
  const res = await fetch(`${BACKEND_URL}/api/v1/cron/schedules`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  return NextResponse.json(data)
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if ((session.user as any)?.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const token = (session as any).accessToken || ''
  const res = await fetch(`${BACKEND_URL}/api/v1/cron/schedules`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return unauthorized()
  if ((session.user as any)?.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const jobType = searchParams.get('jobType')
  if (!jobType) return NextResponse.json({ error: 'jobType required' }, { status: 400 })

  const token = (session as any).accessToken || ''
  const res = await fetch(`${BACKEND_URL}/api/v1/cron/schedules?jobType=${encodeURIComponent(jobType)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
