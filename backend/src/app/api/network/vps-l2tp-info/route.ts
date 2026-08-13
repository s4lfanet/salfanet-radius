import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { readFile } from 'fs/promises'

const L2TP_INFO_FILE = '/etc/salfanet/l2tp/l2tp-server-info.json'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const raw = await readFile(L2TP_INFO_FILE, 'utf8')
    const info = JSON.parse(raw)
    return NextResponse.json({ installed: true, ...info })
  } catch {
    return NextResponse.json({
      installed: false,
      message: 'L2TP/IPsec server belum di-install di VPS ini. Jalankan install-l2tp-server.sh dulu.',
    })
  }
}
