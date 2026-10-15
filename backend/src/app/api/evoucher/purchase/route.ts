import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { randomBytes } from 'crypto';
import { sendVoucherOrderMessage } from '@/server/services/notifications/voucher-order-notify.service';
import { formatWIB } from '@/lib/timezone';

// Generate secure payment token
function generatePaymentToken(): string {
  return randomBytes(32).toString('hex');
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  
  try {
    const body = await request.json();
    const { profileId, notificationMethod = 'both' } = body;
    const customerName = String(body.customerName ?? '').trim();
    const quantity = Number(body.quantity ?? 1);
    // Keep only the contacts for the channels the buyer chose: the voucher
    // codes later go to every contact stored on the order.
    const wantsWa = notificationMethod === 'whatsapp' || notificationMethod === 'both';
    const wantsEmail = notificationMethod === 'email' || notificationMethod === 'both';
    const customerPhone = wantsWa ? String(body.customerPhone ?? '').trim() : '';
    const customerEmail = wantsEmail ? String(body.customerEmail ?? '').trim() : '';

    console.log(`[E-Voucher] Purchase request from ${clientIp}: profile ${profileId}, qty ${quantity}, via ${notificationMethod}`);

    if (!profileId || !customerName || !['whatsapp', 'email', 'both'].includes(notificationMethod)) {
      return NextResponse.json({ error: 'Nama dan paket wajib diisi' }, { status: 400 });
    }
    if (wantsWa && !/^\+?\d[\d\s-]{7,16}$/.test(customerPhone)) {
      return NextResponse.json({ error: 'Nomor WhatsApp tidak valid' }, { status: 400 });
    }
    if (wantsEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return NextResponse.json({ error: 'Alamat email tidak valid' }, { status: 400 });
    }
    // The total is price x quantity, so a zero, negative or fractional
    // quantity would make a free or negative order.
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return NextResponse.json({ error: 'Jumlah voucher harus 1 sampai 20' }, { status: 400 });
    }

    // Validate profile exists and has e-voucher access
    const profile = await prisma.hotspotProfile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    if (!profile.eVoucherAccess || !profile.isActive) {
      return NextResponse.json(
        { error: 'Profile not available for e-voucher' },
        { status: 403 }
      );
    }

    // Order number EVC-yyyyMMdd-NNNN on the company's calendar day. The
    // webhook reads the first three dash-separated parts, so the format
    // must stay three parts.
    const day = formatWIB(new Date(), 'yyyyMMdd');
    const count = await prisma.voucherOrder.count({
      where: { orderNumber: { startsWith: `EVC-${day}-` } },
    });
    const numberFor = (n: number) => `EVC-${day}-${String(n).padStart(4, '0')}`;

    // Calculate total amount
    const totalAmount = profile.sellingPrice * quantity;

    // Get company base URL for payment link
    const company = await prisma.company.findFirst();
    const baseUrl = company?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Generate payment token and link
    const paymentToken = generatePaymentToken();
    const paymentLink = `${baseUrl}/evoucher/pay/${paymentToken}`;

    // Two purchases at the same moment count the same total; on a clash
    // (orderNumber is unique) take the next number instead of failing.
    let order;
    for (let attempt = 1; ; attempt++) {
      try {
        order = await prisma.voucherOrder.create({
          data: {
            id: crypto.randomUUID(),
            orderNumber: numberFor(count + attempt),
            profileId: profile.id,
            quantity,
            customerName,
            customerPhone,
            customerEmail: customerEmail || null,
            totalAmount,
            status: 'PENDING',
            paymentToken,
            paymentLink,
          },
          include: {
            profile: {
              select: {
                name: true,
                speed: true,
                validityValue: true,
                validityUnit: true,
              },
            },
          },
        });
        break;
      } catch (e) {
        const clash = (e as { code?: string })?.code === 'P2002';
        if (!clash || attempt >= 10) throw e;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Voucher order created: ${order.orderNumber} for ${customerName} (${duration}ms)`);
    console.log(`Payment Link: ${paymentLink}`);

    await sendVoucherOrderMessage('payment-link', order);

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        paymentToken: order.paymentToken,
        paymentLink: order.paymentLink,
        totalAmount: order.totalAmount,
        profile: order.profile,
      },
      message: 'Order created successfully. Please proceed to payment.',
    }, { status: 201 });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ E-voucher purchase error:', error);
    console.error('Duration:', duration + 'ms');
    console.error('Client IP:', clientIp);
    
    return NextResponse.json(
      { error: 'Failed to create order', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
