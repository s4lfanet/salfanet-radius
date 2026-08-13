import { NextResponse } from 'next/server'

export default function Home() {
  return null
}

export function GET() {
  return NextResponse.json({ message: 'Salfanet API Server' })
}
