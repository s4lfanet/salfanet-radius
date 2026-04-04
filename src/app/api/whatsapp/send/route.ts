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
      return NextResponse.json(
        {
          success: false,
          error: (result as any).error || 'All providers failed',
          attempts: result.attempts,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Send API error:', error);
    // Extract provider failure details from the error message if available
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to send message' },
      { status: 502 }
    );
  }
}
