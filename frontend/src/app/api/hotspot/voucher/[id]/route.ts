import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { prisma } from '@/server/db/client'
import { WhatsAppService } from '@/server/services/notifications/whatsapp.service'
import { removeVoucherFromRadius } from '@/server/services/radius/hotspot-sync.service'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const voucher = await prisma.hotspotVoucher.findUnique({
      where: { id },
      include: { profile: { select: { name: true } } },
    })

    if (!voucher) {
      return NextResponse.json({ error: 'Voucher not found' }, { status: 404 })
    }

    await prisma.hotspotVoucher.delete({ where: { id } })

    // Notify agent if this voucher belonged to one
    if (voucher.agentId) {
      try {
        await prisma.agentNotification.create({
          data: {
            id: Math.random().toString(36).substring(2, 15),
            agentId: voucher.agentId,
            type: 'voucher_deleted',
            title: 'Voucher Dihapus',
            message: `Admin telah menghapus voucher ${voucher.code} (${voucher.profile.name}).`,
            link: null,
          },
        })
      } catch (_) {
        // non-critical
      }
    }

    // Remove from RADIUS - fire and forget so DB delete is not blocked
    removeVoucherFromRadius(voucher.code).catch(error => {
      console.error('Failed to remove from RADIUS:', error)
    })

    return NextResponse.json({ message: 'Voucher deleted successfully' })
  } catch (error) {
    console.error('Delete voucher [id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { phone, vouchers } = await request.json()

    if (!vouchers || !Array.isArray(vouchers) || vouchers.length === 0) {
      return NextResponse.json({ error: 'No vouchers selected' }, { status: 400 })
    }

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }

    // Get company info
    const company = await prisma.company.findFirst()
    const companyName = company?.name || 'SALFANET'
    const companyPhone = company?.phone || ''

    // Build voucher message
    let message = '🎟️ *Voucher Hotspot Internet*\n\n'
    message += `Halo! Berikut adalah voucher internet Anda:\n\n`
    message += `━━━━━━━━━━━━━━━━━━\n\n`
    
    vouchers.forEach((v: any, idx: number) => {
      message += `*Voucher ${idx + 1}*\n`
      message += `🔑 Code: *${v.code}*\n`
      message += `📦 Paket: ${v.profileName}\n`
      message += `💰 Harga: Rp ${v.price.toLocaleString('id-ID')}\n`
      message += `⏳ Masa Aktif: ${v.validity}\n\n`
    })

    message += `━━━━━━━━━━━━━━━━━━\n\n`
    message += `📌 *Cara Menggunakan:*\n`
    message += `1. Hubungkan ke WiFi hotspot kami\n`
    message += `2. Buka browser, akan muncul halaman login\n`
    message += `3. Masukkan kode voucher\n`
    message += `4. Klik Login dan nikmati internet!\n\n`
    message += `⚠️ *Penting:*\n`
    message += `• Voucher akan aktif setelah login pertama\n`
    message += `• Simpan kode voucher dengan baik\n`
    message += `• Masa aktif dihitung sejak login pertama\n\n`
    message += `📞 Butuh bantuan? Hubungi: ${companyPhone}\n\n`
    message += `Terima kasih! 🙏\n${companyName}`

    // Send WhatsApp
    await WhatsAppService.sendMessage({
      phone,
      message
    })

    return NextResponse.json({
      success: true,
      message: 'WhatsApp sent successfully'
    })
  } catch (error) {
    console.error('Send WhatsApp error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
