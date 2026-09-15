import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/server/db/client'
import { getBotSettings, processTelegramUpdate } from '@/server/services/notifications/telegram-bot.service'
import { timingSafeEqual } from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * Telegram Bot Webhook — terima update dari Telegram.
 * Endpoint: POST /api/telegram/webhook
 *
 * Verifikasi secret token (fail-closed) untuk mencegah pesan palsu.
 */
export async function POST(request: NextRequest) {
  try {
    const settings = await getBotSettings()
    if (!settings || !settings.enabled) {
      // Bot tidak aktif — tetap 200 agar Telegram tidak retry
      return NextResponse.json({ ok: true, message: 'Bot disabled' })
    }

    // ─── Verifikasi secret token (fail-closed) ────────────────────────────
    const received = String(request.headers.get('x-telegram-bot-api-secret-token') || '')
    const expected = settings.webhookSecret || ''
    if (!expected) {
      // Tidak ada secret di DB — tolak semua
      return NextResponse.json({ ok: true, message: 'No secret configured' })
    }
    const a = Buffer.from(expected)
    const b = Buffer.from(received)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      // Secret tidak cocok — silent reject
      return NextResponse.json({ ok: true, message: 'Unauthorized' })
    }

    // ─── Process update ───────────────────────────────────────────────────
    const body = await request.json()
    await processTelegramUpdate(body, settings)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[Telegram Webhook] error:', e)
    // Tetap 200 agar Telegram tidak retry terus
    return NextResponse.json({ ok: true, error: 'Internal error' })
  }
}

/**
 * GET — untuk debugging (Telegram kadang kirim GET untuk cek webhook)
 */
export async function GET() {
  return NextResponse.json({ ok: true, message: 'Telegram webhook endpoint. Use POST.' })
}
