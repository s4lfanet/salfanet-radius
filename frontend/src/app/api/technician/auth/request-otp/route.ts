import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { WhatsAppService } from '@/server/services/notifications/whatsapp.service';

export async function POST(req: NextRequest) {
  try {
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

    // Find or create technician
    let technician = await prisma.technician.findUnique({
      where: { phoneNumber: formattedPhone },
    });

    if (!technician) {
      // Create new technician with default name (can be updated later)
      technician = await prisma.technician.create({
        data: {
          phoneNumber: formattedPhone,
          name: `Teknisi ${formattedPhone.substring(formattedPhone.length - 4)}`,
          isActive: true,
        },
      });
    }

    if (!technician.isActive) {
      return NextResponse.json(
        { error: 'Technician account is inactive' },
        { status: 403 }
      );
    }

    // Check if OTP is required
    if (!technician.requireOtp) {
      return NextResponse.json(
        { 
          message: 'OTP not required for this account',
          requireOtp: false,
          technician: {
            id: technician.id,
            name: technician.name,
            phoneNumber: technician.phoneNumber,
          }
        },
        { status: 200 }
      );
    }

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

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
      
      const message = `?? *Kode OTP Teknisi*\n\nKode OTP Anda: *${otpCode}*\n\nKode ini berlaku selama *5 menit*.\nJangan bagikan kode ini kepada siapa pun.\n\n_Pesan otomatis dari sistem ${companyName}_`;

      await WhatsAppService.sendMessage({
        phone: formattedPhone,
        message: message,
      });

      console.log(`? OTP sent via WhatsApp to ${formattedPhone}: ${otpCode}`);
    } catch (error) {
      console.error('? Failed to send WhatsApp OTP:', error);
      // Continue even if WhatsApp fails - OTP is still created
      // User can check console for OTP in development
    }

    return NextResponse.json({
      success: true,
      message: 'OTP sent to your WhatsApp number',
      phoneNumber: formattedPhone,
      // In development, include OTP in response
      ...(process.env.NODE_ENV === 'development' && { otpCode }),
    });
  } catch (error) {
    console.error('Request OTP error:', error);
    return NextResponse.json(
      { error: 'Failed to send OTP' },
      { status: 500 }
    );
  }
}
