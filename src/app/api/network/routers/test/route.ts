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
    const { ipAddress, username, password, port, apiPort } = await request.json()

    if (!ipAddress || !username || !password) {
      return NextResponse.json(
        { error: 'IP Address, Username, and Password are required' },
        { status: 400 }
      )
    }

    const primaryPort = parseInt(port) || 8728
    const sslPort = parseInt(apiPort) || 8729

    // --- Try primary port (non-SSL) ---
    const mtik = new MikroTikConnection({
      host: ipAddress,
      username,
      password,
      port: primaryPort,
      timeout: 10000,
      tls: false,
    })
    const result = await mtik.testConnection()

    if (result.success) {
      return NextResponse.json({ ...result, usedPort: primaryPort, usedTls: false })
    }

    // --- Fallback: try SSL port (API-SSL) ---
    const primaryError = result.message
    const mtikSsl = new MikroTikConnection({
      host: ipAddress,
      username,
      password,
      port: sslPort,
      timeout: 10000,
      tls: true,
    })
    const sslResult = await mtikSsl.testConnection()

    if (sslResult.success) {
      return NextResponse.json({ ...sslResult, usedPort: sslPort, usedTls: true })
    }

    // Both failed — return combined error with port details
    return NextResponse.json({
      success: false,
      message: `Port ${primaryPort}: ${primaryError} | Port ${sslPort} (SSL): ${sslResult.message}`,
    })

  } catch (error: any) {
    console.error('Test router connection error:', error)
    return NextResponse.json({
      success: false,
      message: error.message || 'Connection test failed',
    })
  }
}
