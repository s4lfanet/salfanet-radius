import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Test Gateway Connectivity (ICMP Ping)
 * For non-MikroTik routers/gateways like VPS RADIUS server
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { ipAddress } = await request.json()

    if (!ipAddress) {
      return NextResponse.json(
        { success: false, message: 'IP Address is required' },
        { status: 400 }
      )
    }

    // Validate IP address format
    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/
    if (!ipRegex.test(ipAddress)) {
      return NextResponse.json(
        { success: false, message: 'Invalid IP address format' },
        { status: 400 }
      )
    }

    try {
      // Test ping (3 packets, 2 second timeout)
      const isWindows = process.platform === 'win32'
      const pingCommand = isWindows
        ? `ping -n 3 -w 2000 ${ipAddress}`
        : `ping -c 3 -W 2 ${ipAddress}`

      const { stdout, stderr } = await execAsync(pingCommand)

      // Check if ping was successful
      const success = isWindows
        ? !stdout.includes('Request timed out') && !stdout.includes('unreachable')
        : stdout.includes('3 received') || stdout.includes('3 packets received')

      if (success) {
        // Extract latency if available
        const latencyMatch = stdout.match(/time[=<](\d+(?:\.\d+)?)ms/i)
        const latency = latencyMatch ? latencyMatch[1] : 'N/A'

        return NextResponse.json({
          success: true,
          message: `Gateway is reachable (latency: ${latency}ms)`,
          details: {
            ipAddress,
            latency,
            timestamp: new Date().toISOString(),
          },
        })
      } else {
        return NextResponse.json({
          success: false,
          message: `Gateway is unreachable (${ipAddress})`,
          details: stderr || 'No response from host',
        })
      }
    } catch (error: any) {
      // Command failed (usually means host unreachable)
      return NextResponse.json({
        success: false,
        message: `Gateway is unreachable: ${error.message}`,
        details: error.stderr || error.message,
      })
    }
  } catch (error: any) {
    console.error('Gateway test error:', error)
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to test gateway' },
      { status: 500 }
    )
  }
}
