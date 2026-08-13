import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    name: 'Salfanet Radius API',
    version: '0.1.0',
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
}
