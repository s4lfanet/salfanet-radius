import { NextResponse } from 'next/server'
import { requirePermission } from '@/server/middleware/api-auth'
import { readFile } from 'fs/promises'

const L2TP_INFO_FILE = '/etc/salfanet/l2tp/l2tp-server-info.json'

export async function GET() {
  const authCheck = await requirePermission('network.view')
  if (!authCheck.authorized) return authCheck.response

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
