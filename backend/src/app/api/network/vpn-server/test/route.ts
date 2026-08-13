import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { MikroTikConnection } from '@/server/services/mikrotik/client'

// POST - Test MikroTik connection
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

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
