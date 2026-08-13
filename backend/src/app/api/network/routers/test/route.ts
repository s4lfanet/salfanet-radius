import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { MikroTikConnection } from '@/server/services/mikrotik/client'

// POST - Test router connection
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const { ipAddress, username, password, port } = await request.json()

    if (!ipAddress || !username || !password) {
      return NextResponse.json(
        { error: 'IP Address, Username, and Password are required' },
        { status: 400 }
      )
    }

    const primaryPort = parseInt(port) || 8728

    // Try API connection (non-SSL)
    const mtik = new MikroTikConnection({
      host: ipAddress,
      username,
      password,
      port: primaryPort,
      timeout: 8000,
      tls: false,
    })
    const result = await mtik.testConnection()

    if (result.success) {
      return NextResponse.json({ ...result, usedPort: primaryPort })
    }

    // Failed — return error with diagnosis
    const primaryError = result.message
    return NextResponse.json({
      success: false,
      message: `Port ${primaryPort}: ${primaryError}`,
      diagnosis: primaryError.includes('timed out') || primaryError.includes('firewall')
        ? 'firewall_block'
        : primaryError.includes('ECONNREFUSED')
        ? 'port_refused'
        : primaryError.includes('wrong password') || primaryError.includes('cannot log in')
        ? 'auth_failed'
        : 'unknown',
    })

  } catch (error: any) {
    console.error('Test router connection error:', error)
    return NextResponse.json({
      success: false,
      message: error.message || 'Connection test failed',
    })
  }
}
