import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyCollector } from '@/server/auth/collector-auth';
import { WhatsAppService } from '@/server/services/notifications/whatsapp.service';
import { getCurrentTimezone } from '@/lib/timezone';

/**
 * POST /api/collector/send-invoice
 * Send paid invoice confirmation to customer via WhatsApp
 *
 * Body: { invoiceId: string }
 */
export async function POST(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { invoiceId } = await req.json();
    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            username: true,
            customerId: true,
            area: { select: { name: true } },
            profile: { select: { name: true } },
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice tidak ditemukan' }, { status: 404 });
    }

    // Area ownership check
    const collectorAccount = await prisma.adminUser.findUnique({
      where: { id: collector.id },
      select: { areaId: true },
    });

    if (!collectorAccount?.areaId || invoice.user?.areaId !== collectorAccount.areaId) {
      return NextResponse.json({ error: 'Invoice bukan di area Anda' }, { status: 403 });
    }

    if (invoice.status !== 'PAID') {
      return NextResponse.json({ error: 'Invoice belum lunas' }, { status: 400 });
    }

    const customerPhone = invoice.user?.phone || invoice.customerPhone;
    if (!customerPhone) {
      return NextResponse.json({ error: 'Nomor telepon pelanggan tidak ditemukan' }, { status: 400 });
    }

    const company = await prisma.company.findFirst();
    const companyName = company?.name || 'SALFANET RADIUS';
    const companyPhone = company?.phone || '';

    const paidDate = invoice.paidAt
      ? new Date(invoice.paidAt).toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          timeZone: getCurrentTimezone(),
        })
      : '-';

    const amount = `Rp ${invoice.amount.toLocaleString('id-ID')}`;

    const message = `*BUKTI PEMBAYARAN LUNAS*

*Nama:* ${invoice.user?.name || invoice.customerName || '-'}
*ID Pelanggan:* ${invoice.user?.customerId || '-'}
*No Invoice:* ${invoice.invoiceNumber}
*Tanggal Bayar:* ${paidDate}
*Jumlah:* ${amount}
*Metode:* ${invoice.paymentMethod || 'Tunai'}
*Dikumpulkan oleh:* ${collector.name}

Terima kasih atas pembayaran Anda.
${companyName}
Telp: ${companyPhone}`;

    // Check if WhatsApp provider is available
    const activeProviders = await prisma.whatsapp_providers.findMany({
      where: { isActive: true },
    });

    if (activeProviders.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Layanan WhatsApp belum dikonfigurasi. Hubungi admin.',
      }, { status: 400 });
    }

    await WhatsAppService.sendMessage({
      phone: customerPhone,
      message,
    });

    return NextResponse.json({
      success: true,
      message: `Bukti pembayaran lunas terkirim ke ${customerPhone} via WhatsApp`,
    });
  } catch (error: any) {
    console.error('Collector send-invoice error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Gagal mengirim invoice',
    }, { status: 500 });
  }
}
