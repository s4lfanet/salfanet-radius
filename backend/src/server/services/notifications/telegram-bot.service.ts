import 'server-only'
import { prisma } from '@/server/db/client'
import { getGenieACSCredentials } from '@/app/api/settings/genieacs/route'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BotSettings {
  id: string
  enabled: boolean
  botToken: string
  webhookSecret: string
  allowedChatIds: string | null
  enableRedaman: boolean
  enableCekPelanggan: boolean
  enableStart: boolean
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getBotSettings(): Promise<BotSettings | null> {
  return await prisma.telegramBotSettings.findFirst({
    orderBy: { createdAt: 'desc' },
  }) as BotSettings | null
}

export async function upsertBotSettings(data: Partial<BotSettings>): Promise<BotSettings> {
  const existing = await getBotSettings()
  if (existing) {
    return await prisma.telegramBotSettings.update({
      where: { id: existing.id },
      data,
    }) as BotSettings
  }
  return await prisma.telegramBotSettings.create({
    data: {
      enabled: data.enabled ?? false,
      botToken: data.botToken ?? '',
      webhookSecret: data.webhookSecret ?? randomSecret(),
      allowedChatIds: data.allowedChatIds ?? null,
      enableRedaman: data.enableRedaman ?? true,
      enableCekPelanggan: data.enableCekPelanggan ?? true,
      enableStart: data.enableStart ?? true,
    },
  }) as BotSettings
}

export function randomSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ─── Telegram API helpers ────────────────────────────────────────────────────

async function tgSendMessage(botToken: string, chatId: number | string, text: string): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    })
  } catch (e) {
    console.error('[Telegram Bot] sendMessage error:', e)
  }
}

// ─── Webhook setup ──────────────────────────────────────────────────────────

export async function setWebhook(botToken: string, webhookUrl: string, secret: string): Promise<{ ok: boolean; description?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, secret_token: secret }),
    })
    const data = await res.json()
    return { ok: data.ok === true, description: data.description }
  } catch (e: any) {
    return { ok: false, description: e.message }
  }
}

export async function deleteWebhook(botToken: string): Promise<{ ok: boolean; description?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`, { method: 'POST' })
    const data = await res.json()
    return { ok: data.ok === true, description: data.description }
  } catch (e: any) {
    return { ok: false, description: e.message }
  }
}

export async function getWebhookInfo(botToken: string): Promise<any> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`)
    return await res.json()
  } catch (e) {
    return { ok: false, description: String(e) }
  }
}

// ─── Command handlers ────────────────────────────────────────────────────────

/**
 * Process incoming Telegram update (message).
 * Returns true if handled.
 */
export async function processTelegramUpdate(update: any, settings: BotSettings): Promise<boolean> {
  const msg = update?.message || update?.edited_message
  if (!msg || !msg.text) return false

  const chatId = msg.chat?.id
  const text = String(msg.text).trim()
  if (!chatId) return false

  // ─── Auth: check allowedChatIds ──────────────────────────────────────────
  if (settings.allowedChatIds) {
    const allowed = settings.allowedChatIds
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    if (allowed.length > 0 && !allowed.includes(String(chatId))) {
      // Silent reject — don't reveal bot exists to unauthorized users
      return false
    }
  }

  // ─── /start, /help ────────────────────────────────────────────────────────
  if (/^\/(start|help)\b/i.test(text) || /^help$/i.test(text)) {
    if (!settings.enableStart) return false
    const cmds = [
      '<b>🤖 Bot Salfanet Radius</b>',
      '',
      'Perintah yang tersedia:',
      '',
      '<code>/redaman <username|serial></code> — cek redaman/sinyal ONU pelanggan',
      '<code>/cekpelanggan <nama></code> — detail lengkap pelanggan',
      '<code>/start</code> atau <code>/help</code> — tampilkan bantuan ini',
      '',
      '💡 <i>Username = PPPoE username. Serial = serial number ONU.</i>',
    ]
    if (!settings.enableRedaman) cmds.splice(2, 1)
    if (!settings.enableCekPelanggan) {
      const idx = cmds.findIndex(c => c.includes('/cekpelanggan'))
      if (idx >= 0) cmds.splice(idx, 1)
    }
    await tgSendMessage(settings.botToken, chatId, cmds.join('\n'))
    return true
  }

  // ─── /redaman <username|serial> ───────────────────────────────────────────
  // Format: /redaman <id> | /cek redaman <id> | /cek <id>
  const redamanMatch = text.match(/^\/?(?:redaman|cek\s*redaman|cek)\s+@?([A-Za-z0-9._\-]+)/i)
  if (redamanMatch) {
    if (!settings.enableRedaman) {
      await tgSendMessage(settings.botToken, chatId, '⚠️ Fitur cek redaman dinonaktifkan oleh admin.')
      return true
    }
    const query = redamanMatch[1].trim()
    const result = await handleCekRedaman(query)
    await tgSendMessage(settings.botToken, chatId, result)
    return true
  }

  // ─── /cekpelanggan <nama> ─────────────────────────────────────────────────
  const cekPelMatch = text.match(/^\/?(?:cekpelanggan|cekpel|cek\s*pelanggan)\s+(.+)/i)
  if (cekPelMatch) {
    if (!settings.enableCekPelanggan) {
      await tgSendMessage(settings.botToken, chatId, '⚠️ Fitur cek pelanggan dinonaktifkan oleh admin.')
      return true
    }
    const query = cekPelMatch[1].trim()
    const result = await handleCekPelanggan(query)
    await tgSendMessage(settings.botToken, chatId, result)
    return true
  }

  // Unknown command
  if (text.startsWith('/')) {
    await tgSendMessage(
      settings.botToken,
      chatId,
      '❓ Perintah tidak dikenali. Ketik <code>/help</code> untuk melihat daftar perintah.'
    )
  }
  return false
}

// ─── /redaman implementation ────────────────────────────────────────────────

const PARAM_PATHS = {
  rxPower: [
    'VirtualParameters.redaman',
    'VirtualParameters.RXPower',
    'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower',
    'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower',
    'InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.RXPower',
    'InternetGatewayDevice.X_ALU_OntOpticalParam.RXPower',
    'InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.RXPower',
    'InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.RXPower',
    'InternetGatewayDevice.WANDevice.1.X_CMCC_GponInterfaceConfig.RXPower',
    'InternetGatewayDevice.WANDevice.1.X_CMCC_EponInterfaceConfig.RXPower',
    'InternetGatewayDevice.WANDevice.1.WANEponInterfaceConfig.RXPower',
  ],
  txPower: [
    'VirtualParameters.txPower',
    'VirtualParameters.TXPower',
    'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TXPower',
    'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TXPower',
  ],
  pppUsername: [
    'VirtualParameters.pppUsername',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username',
    'Device.PPP.Interface.1.Username',
  ],
  serialNumber: [
    'InternetGatewayDevice.DeviceInfo.SerialNumber',
    'Device.DeviceInfo.SerialNumber',
  ],
  temp: [
    'VirtualParameters.temp',
    'VirtualParameters.temperature',
    'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TransceiverTemperature',
    'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature',
    'InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.TransceiverTemperature',
    'InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.Temperature',
  ],
  uptime: [
    'VirtualParameters.uptimeDevice',
    'VirtualParameters.uptime',
    'InternetGatewayDevice.DeviceInfo.UpTime',
    'Device.DeviceInfo.UpTime',
  ],
  pppoeIP: [
    'VirtualParameters.pppIP',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ExternalIPAddress',
    'Device.PPP.Interface.1.IPCP.LocalIPAddress',
  ],
}

function safeString(val: any): string {
  if (val === null || val === undefined) return '-'
  if (typeof val === 'string') return val || '-'
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return String(val)
  if (Array.isArray(val)) return val.length > 0 ? safeString(val[0]) : '-'
  if (typeof val === 'object') {
    if ('_value' in val) return safeString(val._value)
    if ('value' in val) return safeString(val.value)
    return '-'
  }
  return String(val) || '-'
}

function getParamValue(device: any, paths: string[]): string {
  for (const path of paths) {
    const parts = path.split('.')
    let value: any = device
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part]
      } else {
        value = undefined
        break
      }
    }
    if (value !== undefined && value !== null) {
      const result = safeString(value)
      if (result !== '-' && result !== '') return result
    }
  }
  return '-'
}

function formatRxPower(rx: string): string {
  if (rx === '-' || !rx) return '-'
  if (rx.toLowerCase().includes('dbm')) return rx
  const v = parseFloat(rx)
  if (!isNaN(v)) {
    if (v < -100) return `${(v / 1000).toFixed(1)} dBm`
    return `${v.toFixed(1)} dBm`
  }
  return rx
}

function formatTemp(t: string): string {
  if (t === '-' || !t) return '-'
  if (t.includes('°') || t.toLowerCase().includes('c')) return t
  const v = parseFloat(t)
  if (!isNaN(v)) {
    if (v > 1000) return `${(v / 1000).toFixed(0)}°C`
    return `${v.toFixed(0)}°C`
  }
  return t
}

function formatUptime(u: string): string {
  if (u === '-' || !u || u === '0') return '-'
  if (/\d+d\s+\d+:\d+:\d+/.test(u) || /^\d+:\d{2}:\d{2}$/.test(u)) return u
  const sec = parseInt(u)
  if (isNaN(sec) || sec < 0) return u
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${d}d ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function getDeviceStatus(lastInform: string | null): string {
  if (!lastInform) return 'Offline'
  try {
    const diff = Date.now() - new Date(lastInform).getTime()
    return diff < 60 * 60 * 1000 ? 'Online' : 'Offline'
  } catch {
    return 'Offline'
  }
}

async function handleCekRedaman(query: string): Promise<string> {
  try {
    const credentials = await getGenieACSCredentials()
    if (!credentials) {
      return '⚠️ GenieACS belum dikonfigurasi. Hubungi admin.'
    }

    const { host, username, password } = credentials
    const res = await fetch(`${host}/devices`, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      return `⚠️ GenieACS merespons ${res.status}. Coba lagi nanti.`
    }

    const devices: any[] = await res.json()

    // Cari device berdasarkan PPPoE username atau serial number
    const isSerial = /^[A-Z0-9]{8,}$/i.test(query)
    const device = devices.find((dev) => {
      if (isSerial) {
        const serial = safeString(dev._deviceId?._SerialNumber) !== '-'
          ? safeString(dev._deviceId._SerialNumber)
          : getParamValue(dev, PARAM_PATHS.serialNumber)
        return serial.toUpperCase() === query.toUpperCase()
      }
      const pppUser = getParamValue(dev, PARAM_PATHS.pppUsername)
      return pppUser.toLowerCase() === query.toLowerCase()
    })

    if (!device) {
      return `❌ Perangkat tidak ditemukan untuk: <code>${query}</code>\n\nPeriksa kembali username PPPoE atau serial number ONU.`
    }

    // Cari pelanggan di DB untuk info tambahan
    const pppUsername = getParamValue(device, PARAM_PATHS.pppUsername)
    let customer: any = null
    if (pppUsername && pppUsername !== '-') {
      customer = await prisma.pppoeUser.findUnique({
        where: { username: pppUsername },
        select: { name: true, phone: true, status: true, area: { select: { name: true } } },
      })
    }

    const rx = formatRxPower(getParamValue(device, PARAM_PATHS.rxPower))
    const tx = formatRxPower(getParamValue(device, PARAM_PATHS.txPower))
    const temp = formatTemp(getParamValue(device, PARAM_PATHS.temp))
    const uptime = formatUptime(getParamValue(device, PARAM_PATHS.uptime))
    const ip = getParamValue(device, PARAM_PATHS.pppoeIP)
    const serial = safeString(device._deviceId?._SerialNumber) !== '-'
      ? safeString(device._deviceId._SerialNumber)
      : getParamValue(device, PARAM_PATHS.serialNumber)
    const status = getDeviceStatus(device._lastInform)

    // Tentukan kualitas sinyal
    let signalEmoji = '🟢'
    let signalNote = 'Baik'
    const rxNum = parseFloat(rx)
    if (!isNaN(rxNum)) {
      if (rxNum > -8) { signalEmoji = '🟢'; signalNote = 'Baik' }
      else if (rxNum > -20) { signalEmoji = '🟡'; signalNote = 'Sedang' }
      else if (rxNum > -30) { signalEmoji = '🟠'; signalNote = 'Lemah' }
      else { signalEmoji = '🔴'; signalNote = 'Buruk' }
    }

    const lines = [
      `${signalEmoji} <b>Info Redaman ONU</b>`,
      '',
      `<b>Pelanggan:</b> ${customer?.name || pppUsername || '-'}`,
      `<b>Username:</b> <code>${pppUsername}</code>`,
      `<b>Serial:</b> <code>${serial}</code>`,
      `<b>Status:</b> ${status === 'Online' ? '🟢 Online' : '🔴 Offline'}`,
      '',
      `<b>RX Power:</b> ${rx} ${signalNote ? `(${signalNote})` : ''}`,
      `<b>TX Power:</b> ${tx}`,
      `<b>Suhu:</b> ${temp}`,
      `<b>Uptime:</b> ${uptime}`,
      `<b>IP PPPoE:</b> <code>${ip}</code>`,
    ]

    if (customer) {
      lines.push('', `<b>Area:</b> ${customer.area?.name || '-'}`)
      lines.push(`<b>Status Akun:</b> ${customer.status}`)
      if (customer.phone) lines.push(`<b>No. HP:</b> ${customer.phone}`)
    }

    return lines.join('\n')
  } catch (e: any) {
    if (e?.name === 'AbortError' || e?.name === 'TimeoutError') {
      return '⚠️ GenieACS tidak merespons. Perangkat mungkin offline atau GenieACS sedang down.'
    }
    console.error('[Telegram Bot] cekRedaman error:', e)
    return `⚠️ Gagal cek redaman: ${e?.message || 'Unknown error'}`
  }
}

// ─── /cekpelanggan implementation ────────────────────────────────────────────

async function handleCekPelanggan(query: string): Promise<string> {
  try {
    // Cari pelanggan berdasarkan nama, username, customerId, atau phone
    const users = await prisma.pppoeUser.findMany({
      where: {
        OR: [
          { username: { contains: query } },
          { name: { contains: query } },
          { customerId: { contains: query } },
          { phone: { contains: query } },
        ],
      },
      take: 5,
      select: {
        username: true,
        name: true,
        phone: true,
        status: true,
        customerId: true,
        address: true,
        expiredAt: true,
        profile: { select: { name: true, downloadSpeed: true, uploadSpeed: true } },
        area: { select: { name: true } },
        router: { select: { shortname: true } },
      },
    })

    if (users.length === 0) {
      return `❌ Pelanggan tidak ditemukan untuk: <code>${query}</code>\n\nCari dengan nama, username, customer ID, atau nomor HP.`
    }

    if (users.length === 1) {
      const u = users[0]
      const lines = [
        '👤 <b>Detail Pelanggan</b>',
        '',
        `<b>Nama:</b> ${u.name}`,
        `<b>Username:</b> <code>${u.username}</code>`,
        `<b>Customer ID:</b> ${u.customerId || '-'}`,
        `<b>No. HP:</b> ${u.phone || '-'}`,
        `<b>Status:</b> ${u.status === 'active' ? '🟢 Aktif' : u.status === 'isolated' ? '🟠 Isolir' : '🔴 ' + u.status}`,
        `<b>Paket:</b> ${u.profile?.name || '-'}`,
        `<b>Area:</b> ${u.area?.name || '-'}`,
        `<b>Router:</b> ${u.router?.shortname || '-'}`,
        `<b>Alamat:</b> ${u.address || '-'}`,
      ]
      if (u.expiredAt) {
        const exp = new Date(u.expiredAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
        const isExpired = u.expiredAt < new Date()
        lines.push(`<b>Expired:</b> ${exp} ${isExpired ? '⚠️ <i>(sudah lewat)</i>' : ''}`)
      }
      return lines.join('\n')
    }

    // Multiple matches — list them
    const lines = [
      `🔍 Ditemukan <b>${users.length} pelanggan</b> untuk "<code>${query}</code>":`,
      '',
    ]
    for (const u of users) {
      lines.push(`• <b>${u.name}</b> (<code>${u.username}</code>) — ${u.status === 'active' ? '🟢' : '🟠'} ${u.profile?.name || '-'} | ${u.area?.name || '-'}`)
    }
    lines.push('', '<i>Gunakan username untuk pencarian lebih spesifik.</i>')
    return lines.join('\n')
  } catch (e: any) {
    console.error('[Telegram Bot] cekPelanggan error:', e)
    return `⚠️ Gagal cek pelanggan: ${e?.message || 'Unknown error'}`
  }
}
