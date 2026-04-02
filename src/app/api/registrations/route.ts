import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { WhatsAppService } from '@/server/services/notifications/whatsapp.service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, phone, email, address, profileId, notes, referralCode, latitude, longitude, idCardNumber, idCardPhoto, areaId } = body;

    // Validate required fields
    if (!name || !phone || !address || !profileId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if phone already registered
    const existingRegistration = await prisma.registrationRequest.findUnique({
      where: { phone },
    });

    if (existingRegistration) {
      return NextResponse.json(
        { error: 'Phone number already registered' },
        { status: 400 }
      );
    }

    // Check if profile exists
    const profile = await prisma.pppoeProfile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      return NextResponse.json(
        { error: 'Invalid profile selected' },
        { status: 400 }
      );
    }

    // Validate referral code if provided
    let validReferralCode: string | null = null;
    if (referralCode) {
      const referrer = await prisma.pppoeUser.findUnique({
        where: { referralCode: referralCode.toUpperCase() },
        select: { id: true },
      });
      if (referrer) {
        validReferralCode = referralCode.toUpperCase();
      }
    }

    // Create registration request
    const registration = await prisma.registrationRequest.create({
      data: {
        id: crypto.randomUUID(),
        name,
        phone,
        email: email || null,
        address,
        profileId,
        notes: notes || null,
        referralCode: validReferralCode,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        idCardNumber: idCardNumber || null,
        idCardPhoto: idCardPhoto || null,
        areaId: areaId || null,
        status: 'PENDING',
      },
      include: {
        profile: true,
      },
    });

    // Notify admin via WhatsApp (fire-and-forget)
    prisma.company.findFirst({
      select: { adminPhone: true, name: true, baseUrl: true },
    }).then(async (company) => {
      if (!company?.adminPhone) return;
      try {
        const refInfo = validReferralCode ? `\n🎁 Kode Referral: *${validReferralCode}*` : '';
        const adminUrl = `${company.baseUrl || ''}/admin/pppoe/registrations`;
        const message =
          `📋 *Pendaftaran Baru Masuk!*\n\n` +
          `👤 Nama: *${name}*\n` +
          `📞 HP: *${phone}*\n` +
          `📦 Paket: *${registration.profile.name}*\n` +
          `📍 Alamat: ${address}${refInfo}\n\n` +
          `Silakan buka panel admin untuk menyetujui:\n${adminUrl}`;
        await WhatsAppService.sendMessage({ phone: company.adminPhone, message });
      } catch (_) { /* intentionally silent */ }
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'Registration submitted successfully',
      registration: {
        id: registration.id,
        name: registration.name,
        phone: registration.phone,
        profile: registration.profile.name,
        status: registration.status,
      },
    });
  } catch (error: any) {
    console.error('Registration submission error:', error);
    return NextResponse.json(
      { error: 'Failed to submit registration' },
      { status: 500 }
    );
  }
}
