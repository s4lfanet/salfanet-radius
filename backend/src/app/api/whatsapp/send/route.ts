import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { WhatsAppService } from '@/server/services/notifications/whatsapp.service';
import { rateLimit } from '@/server/middleware/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    // Rate limit: 20 per minute per IP — prevent WA API abuse
    const limited = await rateLimit(request, { max: 20, windowMs: 60 * 1000 });
    if (limited) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Max 20 messages/minute.' },
        { status: 429 }
      );
    }

    const { phone, message } = await request.json();

    if (!phone || !message) {
      return NextResponse.json(
        { success: false, error: 'Phone and message are required' },
        { status: 400 }
      );
    }

    // Use WhatsApp failover service
    const result = await WhatsAppService.sendMessage({ phone, message });

    if (result.success) {
      return NextResponse.json({
        success: true,
        provider: result.provider,
        attempts: result.attempts,
        response: result.response,
      });
    } else {
      // All providers failed — include per-provider attempt details so the user
      // can see exactly which provider failed and why.
      const attempts = result.attempts ?? [];
      const providerDetails = attempts
        .map((a: any) => `${a.provider} (${a.type}): ${a.error || 'unknown error'}`)
        .join(' | ');
      return NextResponse.json(
        {
          success: false,
          error: providerDetails || (result as any).error || 'All providers failed',
          detail: (result as any).error,
          attempts,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Send API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to send message' },
      { status: 500 }
    );
  }
}
