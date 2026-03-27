import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';

// POST - Agent login with phone number
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, RateLimitPresets.strict);
    if (limited) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
    }

    const body = await request.json();
    const { phone } = body;

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    // Find agent by phone
    const agent = await prisma.agent.findUnique({
      where: { phone },
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

    // Update last login timestamp
    await prisma.agent.update({
      where: { id: agent.id },
      data: { lastLogin: new Date() },
    });

    // Return agent data (in production, use JWT or session)
    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        phone: agent.phone,
        email: agent.email,
      },
    });
  } catch (error) {
    console.error('Agent login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
