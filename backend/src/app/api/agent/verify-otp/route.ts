import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';
import { signAgentToken } from '@/server/auth/agent-jwt';
import { z, parseBody } from '@/lib/parse-body';

const verifySchema = z.object({
  phone: z.string().min(8, 'Phone is required').max(20),
  otpCode: z.string().min(4, 'OTP code is required').max(10),
});

// POST - Agent login step 2: verify OTP and issue JWT
export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, RateLimitPresets.auth);
  if (limited) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  try {
    const { data, error } = await parseBody(request, verifySchema);
    if (error) return error;
    const { phone, otpCode } = data;

    // Clean phone number
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.substring(1);
    }
    if (!cleanPhone.startsWith('62')) {
      cleanPhone = '62' + cleanPhone;
    }

    // Find OTP session
    const session = await prisma.customerSession.findFirst({
      where: {
        phone: cleanPhone,
        otpCode,
        verified: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Kode OTP tidak valid' },
        { status: 400 }
      );
    }

    // Check if OTP expired
    if (session.otpExpiry && new Date() > session.otpExpiry) {
      return NextResponse.json(
        { error: 'Kode OTP telah kedaluwarsa' },
        { status: 400 }
      );
    }

    // Find agent by ID (stored in session.userId)
    const agent = await prisma.agent.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        isActive: true,
        sessionVersion: true,
      },
    });

    if (!agent || !agent.isActive) {
      return NextResponse.json(
        { error: 'Agent not found or inactive' },
        { status: 403 }
      );
    }

    // Mark session as verified
    await prisma.customerSession.update({
      where: { id: session.id },
      data: {
        verified: true,
        otpCode: null,
        otpExpiry: null,
      },
    });

    // Update last login timestamp
    await prisma.agent.update({
      where: { id: agent.id },
      data: { lastLogin: new Date() },
    });

    // Issue JWT token
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
  } catch (error) {
    console.error('Agent verify OTP error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
