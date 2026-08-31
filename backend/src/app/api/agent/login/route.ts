import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';
import { signAgentToken } from '@/server/auth/agent-jwt';
import { WhatsAppService } from '@/server/services/notifications/whatsapp.service';
import { nowWIB } from '@/lib/timezone';
import { z, parseBody } from '@/lib/parse-body';

const loginSchema = z.object({
  phone: z.string().min(8, 'Phone number is required').max(20),
});

// POST - Agent login step 1: verify phone, send OTP via WhatsApp
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, RateLimitPresets.strict);
    if (limited) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
    }

    const { data, error } = await parseBody(request, loginSchema);
    if (error) return error;
    const { phone } = data;

    // Find agent by phone
    const agent = await prisma.agent.findUnique({
      where: { phone },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        isActive: true,
        sessionVersion: true,
      },
    });

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found. Please contact administrator.' },
        { status: 404 }
      );
    }

    if (!agent.isActive) {
      return NextResponse.json(
        { error: 'Your account is inactive. Please contact administrator.' },
        { status: 403 }
      );
    }

    // Check if OTP is enabled
    const settings = await prisma.whatsapp_reminder_settings.findFirst();
    const otpEnabled = settings?.otpEnabled ?? true;
    const otpExpiryMin = settings?.otpExpiry ?? 5;

    if (!otpEnabled) {
      // OTP disabled — issue token directly (backward compatible)
      await prisma.agent.update({
        where: { id: agent.id },
        data: { lastLogin: new Date() },
      });
      const token = await signAgentToken(agent.id, agent.phone, agent.sessionVersion);
      return NextResponse.json({
        success: true,
        token,
        expiresIn: '7d',
        agent: {
          id: agent.id,
          name: agent.name,
          phone: agent.phone,
          email: agent.email,
        },
      });
    }

    // Clean phone number
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.substring(1);
    }
    if (!cleanPhone.startsWith('62')) {
      cleanPhone = '62' + cleanPhone;
    }

    // Check rate limiting - max 3 OTP per 15 minutes
    const fifteenMinutesAgo = new Date(nowWIB().getTime() - 15 * 60 * 1000);
    const recentOTPs = await prisma.customerSession.count({
      where: {
        phone: cleanPhone,
        createdAt: { gte: fifteenMinutesAgo },
      },
    });

    if (recentOTPs >= 3) {
      return NextResponse.json(
        { error: 'Too many OTP requests. Please try again in 15 minutes.' },
        { status: 429 }
      );
    }

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + otpExpiryMin * 60 * 1000);

    // Save OTP to customerSession table (reused for agent OTP)
    await prisma.customerSession.create({
      data: {
        userId: agent.id,
        phone: cleanPhone,
        otpCode,
        otpExpiry,
        verified: false,
      },
    });

    // Get company name
    const company = await prisma.company.findFirst();
    const companyName = company?.name || 'SALFANET RADIUS';

    // Send OTP via WhatsApp
    const message = `Kode OTP Login Agent Anda: ${otpCode}\n\nBerlaku ${otpExpiryMin} menit.\nJangan bagikan kode ini kepada siapapun.\n\n- ${companyName}`;

    try {
      await WhatsAppService.sendMessage({
        phone: cleanPhone,
        message,
      });

      return NextResponse.json({
        success: true,
        requireOTP: true,
        phone: cleanPhone,
        expiresIn: otpExpiryMin,
        agent: {
          id: agent.id,
          name: agent.name,
          phone: agent.phone,
        },
      });
    } catch (whatsappError: any) {
      console.error('Agent login WhatsApp send error:', whatsappError);

      // Delete the OTP session if WhatsApp failed
      await prisma.customerSession.deleteMany({
        where: {
          phone: cleanPhone,
          otpCode,
        },
      });

      return NextResponse.json(
        { error: 'Failed to send OTP via WhatsApp. Please try again or contact admin.' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Agent login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
