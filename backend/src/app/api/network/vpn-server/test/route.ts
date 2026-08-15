import { NextResponse } from 'next/server'
import { requirePermission } from '@/server/middleware/api-auth'
import { MikroTikConnection } from '@/server/services/mikrotik/client'

// POST - Test MikroTik connection
export async function POST(request: Request) {
  const authCheck = await requirePermission('vpn.manage')
  if (!authCheck.authorized) return authCheck.response

  try {
    const { host, username, password, apiPort } = await request.json()

    const mtik = new MikroTikConnection({
      host,
      username,
      password,
      port: parseInt(apiPort) || 8728,
      timeout: 15000,
    })

    const result = await mtik.testConnection()

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: `Connection failed: ${error}`,
    })
  }
}
