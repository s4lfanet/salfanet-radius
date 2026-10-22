import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { randomInt } from 'crypto';
import { WhatsAppService } from '@/server/services/notifications/whatsapp.service';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, RateLimitPresets.strict);
    if (limited) {
      return NextResponse.json({ error: 'Terlalu banyak percobaan. Coba lagi sebentar lagi.' }, { status: 429 });
    }

    const { phoneNumber } = await req.json();

    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    // Normalize phone number (remove spaces, dashes, etc)
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    
    // Ensure it starts with country code
    const formattedPhone = normalizedPhone.startsWith('62') 
      ? normalizedPhone 
      : normalizedPhone.startsWith('0')
      ? '62' + normalizedPhone.substring(1)
      : '62' + normalizedPhone;

    // Only numbers an admin registered in Kelola Teknisi get a code. This
    // used to create an active technician for any unknown number, so anyone
    // could sign up with their own WhatsApp and reach every customer.
    const technician = await prisma.technician.findUnique({
      where: { phoneNumber: formattedPhone },
    });

    if (!technician) {
      return NextResponse.json(
        { error: 'Nomor ini belum terdaftar sebagai teknisi. Minta admin menambahkannya di Kelola Teknisi.' },
        { status: 404 }
      );
    }

    if (!technician.isActive) {
      return NextResponse.json(
        { error: 'Akun teknisi ini dinonaktifkan.' },
        { status: 403 }
      );
    }

    // Generate 6-digit OTP
    const otpCode = randomInt(100000, 1000000).toString();

    // Expire old OTPs for this technician
    await prisma.technicianOtp.updateMany({
      where: {
        technicianId: technician.id,
        isUsed: false,
      },
      data: {
        isUsed: true,
      },
    });

    // Create new OTP (expires in 5 minutes)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    await prisma.technicianOtp.create({
      data: {
        technicianId: technician.id,
        phoneNumber: formattedPhone,
        otpCode,
        expiresAt,
      },
    });

    // Send OTP via WhatsApp using WhatsAppService
    try {
      // Get company name
      const company = await prisma.company.findFirst();
      const companyName = company?.name || 'SALFANET RADIUS';
      
      const message = `*Kode OTP Teknisi*\n\nKode OTP Anda: *${otpCode}*\n\nKode ini berlaku selama *5 menit*.\nJangan bagikan kode ini kepada siapa pun.\n\n_Pesan otomatis dari sistem ${companyName}_`;

      const sent = await WhatsAppService.sendMessage({
        phone: formattedPhone,
        message: message,
      });
      if (!sent.success) throw new Error(sent.error);

      // P0 security: never log OTP codes to console
      console.log(`✅ OTP sent via WhatsApp to ${formattedPhone}`);
    } catch (error) {
      // The technician cannot sign in without the code, so say so instead
      // of reporting success for a message that never left.
      console.error('❌ Failed to send WhatsApp OTP:', error);
      return NextResponse.json(
        { error: 'Kode OTP gagal dikirim lewat WhatsApp. Pastikan WhatsApp sistem tersambung, lalu coba lagi.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Kode OTP dikirim ke WhatsApp Anda.',
      phoneNumber: formattedPhone,
      // P0 security: never return OTP code in API response, even in development
    });
  } catch (error) {
    console.error('Request OTP error:', error);
    return NextResponse.json(
      { error: 'Failed to send OTP' },
      { status: 500 }
    );
  }
}
