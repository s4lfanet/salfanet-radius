import { NextResponse } from 'next/server'
import { getAppVersion } from '@/server/app-version'

export async function GET() {
  return NextResponse.json({
    name: 'Salfanet Radius API',
    version: getAppVersion(),
    status: 'ok',
    timestamp: new Date().toISOString(),
    // Lets a client tell that the backend restarted (the company page waits for it).
    uptimeSeconds: Math.round(process.uptime()),
  })
}
