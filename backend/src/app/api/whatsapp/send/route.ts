import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { WhatsAppService, WhatsAppSendError } from '@/server/services/notifications/whatsapp.service';
import { rateLimit } from '@/server/middleware/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const authCheck = await requirePermission('whatsapp.send');
    if (!authCheck.authorized) return authCheck.response;
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
    try {
      const result = await WhatsAppService.sendMessage({ phone, message });
      return NextResponse.json({
        success: true,
        provider: result.provider,
        attempts: result.attempts,
        response: result.response,
      });
    } catch (sendError) {
      if (!(sendError instanceof WhatsAppSendError)) throw sendError;
      // Per-provider details so the admin sees which provider failed and why.
      const providerDetails = sendError.attempts
        .map((a) => `${a.provider} (${a.type}): ${a.error || 'unknown error'}`)
        .join(' | ');
      return NextResponse.json(
        {
          success: false,
          error: providerDetails || sendError.message,
          detail: sendError.message,
          attempts: sendError.attempts,
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
