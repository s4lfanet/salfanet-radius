import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Submit registration request — ported from /api/registrations POST.
   * Public endpoint: creates PENDING registration, validates phone uniqueness & referral code.
   */
  async createRegistration(body: {
    name: string;
    phone: string;
    email?: string;
    address: string;
    profileId: string;
    notes?: string;
    referralCode?: string;
    latitude?: number;
    longitude?: number;
    idCardNumber?: string;
    idCardPhoto?: string;
    areaId?: string;
  }) {
    const { name, phone, address, profileId, referralCode } = body;

    if (!name || !phone || !address || !profileId) {
      throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
    }

    const existing = await this.prisma.registrationRequest.findUnique({ where: { phone } });
    if (existing) {
      throw new HttpException('Phone number already registered', HttpStatus.BAD_REQUEST);
    }

    const profile = await this.prisma.pppoeProfile.findUnique({ where: { id: profileId } });
    if (!profile) {
      throw new HttpException('Invalid profile selected', HttpStatus.BAD_REQUEST);
    }

    let validReferralCode: string | null = null;
    if (referralCode) {
      const referrer = await this.prisma.pppoeUser.findUnique({
        where: { referralCode: referralCode.toUpperCase() },
        select: { id: true },
      });
      if (referrer) validReferralCode = referralCode.toUpperCase();
    }

    const registration = await this.prisma.registrationRequest.create({
      data: {
        id: crypto.randomUUID(),
        name, phone,
        email: body.email || null,
        address,
        profileId,
        notes: body.notes || null,
        referralCode: validReferralCode,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        idCardNumber: body.idCardNumber || null,
        idCardPhoto: body.idCardPhoto || null,
        areaId: body.areaId || null,
        status: 'PENDING',
      },
      include: { profile: true },
    });

    // WhatsApp notifications deferred to notification integration batch

    return {
      success: true,
      message: 'Registration submitted successfully',
      registration: {
        id: registration.id,
        name: registration.name,
        phone: registration.phone,
        profile: registration.profile.name,
        status: registration.status,
      },
    };
  }
}
