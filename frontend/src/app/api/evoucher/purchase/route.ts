import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { randomBytes } from 'crypto';

// Generate secure payment token
function generatePaymentToken(): string {
  return randomBytes(32).toString('hex');
}

// Send payment link notification
async function sendPaymentLinkNotification(order: any, notificationMethod: string) {
  try {
    const company = await prisma.company.findFirst();
    
    // Format validity
    const validityUnit: { [key: string]: string } = {
      MINUTES: 'Menit',
      HOURS: 'Jam', 
      DAYS: 'Hari',
      MONTHS: 'Bulan'
    };
    const duration = `${order.profile.validityValue} ${validityUnit[order.profile.validityUnit] || order.profile.validityUnit}`;
    
    // Format expiry time (24 hours from now)
    const expiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const expiryTime = expiryDate.toLocaleString('id-ID', { 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta'
    });

    const variables = {
      customerId: '',
      customerName: order.customerName,
      phone: order.customerPhone,
      orderToken: order.orderNumber,
      profileName: order.profile.name,
      price: new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(order.totalAmount / order.quantity),
      quantity: order.quantity.toString(),
      totalAmount: new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(order.totalAmount),
      paymentLink: order.paymentLink,
      expiryTime: expiryTime,
      companyName: company?.name || 'ISP',
      companyPhone: company?.phone || '-',
    };

    // Send WhatsApp notification
    if (notificationMethod === 'whatsapp' || notificationMethod === 'both') {
      try {
        const waTemplate = await prisma.whatsapp_templates.findFirst({
          where: { type: 'voucher-payment-link', isActive: true }
        });

        if (waTemplate && order.customerPhone) {
          let message = waTemplate.message;
          Object.entries(variables).forEach(([key, value]) => {
            message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
          });

          await fetch(`${company?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/whatsapp/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: order.customerPhone,
              message: message,
            }),
          });
          console.log('✅ WhatsApp notification sent to', order.customerPhone);
        }
      } catch (error) {
        console.error('❌ WhatsApp notification error:', error);
      }
    }

    // Send Email notification  
    if (notificationMethod === 'email' || notificationMethod === 'both') {
      try {
        const emailTemplate = await prisma.emailTemplate.findFirst({
          where: { type: 'voucher-payment-link', isActive: true }
        });

        if (emailTemplate && order.customerEmail) {
          let subject = emailTemplate.subject;
          let htmlBody = emailTemplate.htmlBody;
          
          Object.entries(variables).forEach(([key, value]) => {
            subject = subject.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
            htmlBody = htmlBody.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
          });

          const emailSettings = await prisma.emailSettings.findFirst();
          if (emailSettings?.enabled) {
            const nodemailer = require('nodemailer');
            const transporter = nodemailer.createTransport({
              host: emailSettings.smtpHost,
              port: emailSettings.smtpPort,
              secure: emailSettings.smtpSecure,
              auth: {
                user: emailSettings.smtpUser,
                pass: emailSettings.smtpPassword,
              },
            });

            await transporter.sendMail({
              from: `"${emailSettings.fromName}" <${emailSettings.fromEmail}>`,
              to: order.customerEmail,
              subject: subject,
              html: htmlBody,
            });
            console.log('✅ Email notification sent to', order.customerEmail);
          }
        }
      } catch (error) {
        console.error('❌ Email notification error:', error);
      }
    }
  } catch (error) {
    console.error('❌ Notification error:', error);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  
  try {
    const body = await request.json();
    const { profileId, customerName, customerPhone, customerEmail, notificationMethod = 'both', quantity = 1 } = body;
    
    console.log('=== E-VOUCHER PURCHASE REQUEST ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Client IP:', clientIp);
    console.log('Customer:', customerName, '|', customerPhone, '|', customerEmail);
    console.log('Profile ID:', profileId);
    console.log('Quantity:', quantity);
    console.log('Notification Method:', notificationMethod);

    if (!profileId || !customerName || !customerPhone) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
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

    // Generate order number
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const count = await prisma.voucherOrder.count({
      where: {
        orderNumber: {
          startsWith: `EVC-${year}${month}${day}-`,
        },
      },
    });
    const orderNumber = `EVC-${year}${month}${day}-${String(count + 1).padStart(4, '0')}`;

    // Calculate total amount
    const totalAmount = profile.sellingPrice * quantity;

    // Get company base URL for payment link
    const company = await prisma.company.findFirst();
    const baseUrl = company?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Generate payment token and link
    const paymentToken = generatePaymentToken();
    const paymentLink = `${baseUrl}/evoucher/pay/${paymentToken}`;

    // Create voucher order
    const order = await prisma.voucherOrder.create({
      data: {
        id: crypto.randomUUID(),
        orderNumber,
        profileId: profile.id,
        quantity,
        customerName,
        customerPhone,
        customerEmail,
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

    const duration = Date.now() - startTime;
    console.log(`✅ Voucher order created: ${orderNumber} for ${customerName} (${duration}ms)`);
    console.log(`Payment Link: ${paymentLink}`);

    // Send notification based on preference
    await sendPaymentLinkNotification(order, notificationMethod);

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
