import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/server/middleware/api-auth'
import { prisma } from '@/server/db/client'
import {
  getBotSettings,
  upsertBotSettings,
  randomSecret,
  setWebhook,
  deleteWebhook,
  getWebhookInfo,
} from '@/server/services/notifications/telegram-bot.service'

// ─── GET: ambil settings + webhook status ────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('settings.view')
    if (!auth.authorized) return auth.response

    const settings = await getBotSettings()

    if (!settings) {
      return NextResponse.json({
        enabled: false,
        botToken: '',
        webhookSecret: '',
        allowedChatIds: '',
        enableRedaman: true,
        enableCekPelanggan: true,
        enableStart: true,
        webhook: null,
      })
    }

    // Ambil webhook status dari Telegram
    let webhookInfo: any = null
    try {
      webhookInfo = await getWebhookInfo(settings.botToken)
    } catch (e) {
      // Bot token invalid atau network error — ignore
    }

    return NextResponse.json({
      ...settings,
      webhook: webhookInfo?.result || null,
    })
  } catch (e: any) {
    console.error('[Telegram Bot Settings] GET error:', e)
    return NextResponse.json({ error: 'Failed to get settings' }, { status: 500 })
  }
}

// ─── POST: update settings ───────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('settings.edit')
    if (!auth.authorized) return auth.response

    const body = await request.json()
    const {
      enabled,
      botToken,
      allowedChatIds,
      enableRedaman,
      enableCekPelanggan,
      enableStart,
      regenerateSecret,
    } = body

    if (enabled && (!botToken || botToken.trim() === '')) {
      return NextResponse.json({ error: 'Bot token wajib diisi' }, { status: 400 })
    }

    const existing = await getBotSettings()

    // ─── Generate secret baru jika diminta atau belum ada ────────────────
    let webhookSecret = existing?.webhookSecret || ''
    if (regenerateSecret || !webhookSecret) {
      webhookSecret = randomSecret()
    }

    // ─── Simpan settings ──────────────────────────────────────────────────
    const settings = await upsertBotSettings({
      enabled: enabled ?? false,
      botToken: botToken ?? existing?.botToken ?? '',
      webhookSecret,
      allowedChatIds: allowedChatIds ?? existing?.allowedChatIds ?? null,
      enableRedaman: enableRedaman ?? existing?.enableRedaman ?? true,
      enableCekPelanggan: enableCekPelanggan ?? existing?.enableCekPelanggan ?? true,
      enableStart: enableStart ?? existing?.enableStart ?? true,
    })

    return NextResponse.json({ success: true, settings })
  } catch (e: any) {
    console.error('[Telegram Bot Settings] POST error:', e)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}

// ─── PUT: set/unset webhook ──────────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const auth = await requirePermission('settings.edit')
    if (!auth.authorized) return auth.response

    const body = await request.json()
    const { action } = body // 'set' | 'unset'

    const settings = await getBotSettings()
    if (!settings || !settings.botToken) {
      return NextResponse.json({ error: 'Bot token belum dikonfigurasi' }, { status: 400 })
    }

    if (action === 'set') {
      // Ambil base URL dari company settings
      const company = await prisma.company.findFirst({ select: { baseUrl: true } })
      const proto = request.headers.get('x-forwarded-proto') || 'https'
      const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
      const inferred = host ? `${proto}://${host}` : ''
      const baseUrl = (company?.baseUrl && !company.baseUrl.includes('localhost'))
        ? company.baseUrl
        : (inferred && !inferred.includes('localhost'))
          ? inferred
          : company?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || ''

      if (!baseUrl) {
        return NextResponse.json({ error: 'Base URL tidak ditemukan. Set company.baseUrl di settings.' }, { status: 400 })
      }

      const webhookUrl = `${baseUrl}/api/telegram/webhook`
      const result = await setWebhook(settings.botToken, webhookUrl, settings.webhookSecret)

      if (!result.ok) {
        return NextResponse.json({ error: result.description || 'Failed to set webhook' }, { status: 400 })
      }

      return NextResponse.json({
        success: true,
        message: `Webhook diaktifkan: ${webhookUrl}`,
        webhookUrl,
      })
    } else if (action === 'unset') {
      const result = await deleteWebhook(settings.botToken)
      if (!result.ok) {
        return NextResponse.json({ error: result.description || 'Failed to unset webhook' }, { status: 400 })
      }
      return NextResponse.json({ success: true, message: 'Webhook dinonaktifkan' })
    } else {
      return NextResponse.json({ error: 'Invalid action. Use "set" or "unset".' }, { status: 400 })
    }
  } catch (e: any) {
    console.error('[Telegram Bot Settings] PUT error:', e)
    return NextResponse.json({ error: 'Failed to update webhook' }, { status: 500 })
  }
}
