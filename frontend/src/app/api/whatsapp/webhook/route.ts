import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

/**
 * WhatsApp Webhook — Receive Incoming Messages
 *
 * Set this URL in your provider dashboard:
 *   https://your-domain.com/api/whatsapp/webhook
 *
 * Supported providers:
 *  - Kirimi.id  → Device Settings → Webhook URL
 *  - Wablas     → Device Settings → Webhook URL
 *  - Fonnte     → Device Settings → Webhook URL
 *  - WAHA       → Settings → Webhooks
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Detect provider from payload shape
    const source = detectSource(body);
    const normalized = normalizePayload(source, body);

    if (!normalized) {
      // Unknown payload — still return 200 so provider doesn't keep retrying
      console.warn('[WA Webhook] Unknown payload format:', JSON.stringify(body).slice(0, 200));
      return NextResponse.json({ received: true });
    }

    // Log to whatsapp_history as "incoming"
    await prisma.whatsapp_history.create({
      data: {
        id: `in_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        phone: normalized.from,
        message: normalized.message,
        status: 'incoming',
        providerName: normalized.providerName,
        providerType: normalized.providerType,
        response: JSON.stringify({ raw: body }),
      },
    });

    console.log(`[WA Webhook] Incoming from ${normalized.from} via ${normalized.providerType}: ${normalized.message.slice(0, 80)}`);

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('[WA Webhook] Error:', error.message);
    // Always return 200 — prevent provider from disabling webhook due to errors
    return NextResponse.json({ received: true });
  }
}

// Accept GET for webhook verification (some providers ping GET first)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // Wablas / Kirimi.id verification
  const challenge = searchParams.get('challenge') || searchParams.get('hub.challenge');
  if (challenge) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ status: 'ok', endpoint: '/api/whatsapp/webhook' });
}

type NormalizedMessage = {
  from: string;
  message: string;
  providerType: string;
  providerName: string;
};

function detectSource(body: any): string {
  // Kirimi.id — has user_code or device_id at top level
  if (body?.user_code || body?.device_id) return 'kirimi';
  // Wablas — has deviceId and pushName
  if (body?.deviceId || body?.pushName) return 'wablas';
  // Fonnte — has device and sender
  if (body?.device && body?.sender) return 'fonnte';
  // WAHA — has session and payload
  if (body?.session && body?.payload) return 'waha';
  // Generic fallback
  return 'unknown';
}

function normalizePayload(source: string, body: any): NormalizedMessage | null {
  switch (source) {
    case 'kirimi':
      // Kirimi.id webhook payload: { from, message, device_id, user_code, type, ... }
      if (!body?.from && !body?.sender) return null;
      return {
        from: body.from || body.sender || '',
        message: body.message || body.text || '',
        providerType: 'kirimi',
        providerName: 'Kirimi.id',
      };

    case 'wablas':
      // Wablas webhook payload: { phone, message, pushName, deviceId, ... }
      if (!body?.phone) return null;
      return {
        from: body.phone,
        message: body.message || '',
        providerType: 'wablas',
        providerName: 'Wablas',
      };

    case 'fonnte':
      // Fonnte webhook payload: { sender, message, device, ... }
      if (!body?.sender) return null;
      return {
        from: body.sender,
        message: body.message || '',
        providerType: 'fonnte',
        providerName: 'Fonnte',
      };

    case 'waha':
      // WAHA webhook payload: { session, event, payload: { from, body, ... } }
      if (!body?.payload) return null;
      return {
        from: body.payload.from || body.payload.id?.remote || '',
        message: body.payload.body || '',
        providerType: 'waha',
        providerName: 'WAHA',
      };

    default:
      return null;
  }
}
