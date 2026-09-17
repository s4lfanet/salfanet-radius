'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bot, Loader2, Shield, Power, PowerOff, RefreshCw, Link2, Link2Off, CheckCircle, Eye, EyeOff, Users, Activity, Search } from 'lucide-react';
import { showSuccess, showError } from '@/lib/sweetalert'
import { usePermissions } from '@/hooks/usePermissions'
import { PERMISSIONS } from '@/lib/permissions'
import { useTranslation } from '@/hooks/useTranslation'
import { Toggle } from '@/components/ui/toggle'

interface BotSettings {
  enabled: boolean
  botToken: string
  webhookSecret: string
  allowedChatIds: string | null
  enableRedaman: boolean
  enableCekPelanggan: boolean
  enableStart: boolean
  webhook?: {
    url?: string
    pending_update_count?: number
    last_error_date?: number
    last_error_message?: string
  } | null
}

export default function TelegramBotSettingsPage() {
  const { hasPermission, loading: permLoading } = usePermissions()
  const { t } = useTranslation()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [webhookLoading, setWebhookLoading] = useState<'set' | 'unset' | null>(null)
  const [settings, setSettings] = useState<BotSettings | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  // Form state
  const [form, setForm] = useState({
    enabled: false,
    botToken: '',
    allowedChatIds: '',
    enableRedaman: true,
    enableCekPelanggan: true,
    enableStart: true,
  })

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/telegram/bot-settings')
      const data = await res.json()
      setSettings(data)
      setForm({
        enabled: data.enabled || false,
        botToken: data.botToken || '',
        allowedChatIds: data.allowedChatIds || '',
        enableRedaman: data.enableRedaman ?? true,
        enableCekPelanggan: data.enableCekPelanggan ?? true,
        enableStart: data.enableStart ?? true,
      })
    } catch {
      showError('Gagal memuat pengaturan bot')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadSettings() }, [loadSettings])

  const handleSave = async () => {
    if (form.enabled && !form.botToken.trim()) {
      showError('Bot token wajib diisi')
      return
    }
    try {
      setSaving(true)
      const res = await fetch('/api/telegram/bot-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        showError(data.error || 'Gagal menyimpan')
        return
      }
      await showSuccess('Pengaturan bot disimpan')
      loadSettings()
    } catch {
      showError('Gagal menyimpan pengaturan')
    } finally {
      setSaving(false)
    }
  }

  const handleWebhook = async (action: 'set' | 'unset') => {
    try {
      setWebhookLoading(action)
      const res = await fetch('/api/telegram/bot-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) {
        showError(data.error || 'Gagal')
        return
      }
      await showSuccess(data.message || (action === 'set' ? 'Webhook diaktifkan' : 'Webhook dinonaktifkan'))
      loadSettings()
    } catch {
      showError('Gagal mengubah webhook')
    } finally {
      setWebhookLoading(null)
    }
  }

  const handleRegenerateSecret = async () => {
    if (!confirm('Regenerate webhook secret? Webhook yang sudah aktif perlu di-set ulang.')) return
    try {
      setSaving(true)
      const res = await fetch('/api/telegram/bot-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, regenerateSecret: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        showError(data.error || 'Gagal')
        return
      }
      await showSuccess('Secret baru di-generate. Set ulang webhook.')
      loadSettings()
    } catch {
      showError('Gagal regenerate secret')
    } finally {
      setSaving(false)
    }
  }

  if (permLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
      </div>
    )
  }

  if (!hasPermission(PERMISSIONS.SETTINGS_EDIT)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <Shield className="w-10 h-10 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Anda tidak punya izin untuk mengakses halaman ini</p>
      </div>
    )
  }

  const webhookActive = settings?.webhook?.url && settings.webhook.url !== ''

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-teal-500/10">
          <Bot className="w-6 h-6 text-teal-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Telegram Bot 2-Arah</h1>
          <p className="text-sm text-muted-foreground">
            Bot untuk teknisi/admin: cek redaman ONU & detail pelanggan langsung dari Telegram
          </p>
        </div>
      </div>

      {/* Status card */}
      <div className={`rounded-xl border p-4 ${settings?.enabled ? 'bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900' : 'bg-muted/30 border-border'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {settings?.enabled ? (
              <Power className="w-5 h-5 text-green-600" />
            ) : (
              <PowerOff className="w-5 h-5 text-muted-foreground" />
            )}
            <div>
              <p className="font-semibold text-sm">
                Bot {settings?.enabled ? 'Aktif' : 'Nonaktif'}
              </p>
              <p className="text-xs text-muted-foreground">
                {settings?.enabled
                  ? 'Bot siap menerima perintah dari Telegram'
                  : 'Aktifkan bot untuk mulai menerima perintah'}
              </p>
            </div>
          </div>
          {webhookActive && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">
              <CheckCircle className="w-3 h-3" /> Webhook Aktif
            </span>
          )}
        </div>

        {/* Webhook info */}
        {settings?.webhook && (
          <div className="mt-3 pt-3 border-t border-border/50 space-y-1">
            {settings.webhook.url && (
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold">URL:</span>{' '}
                <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">{settings.webhook.url}</code>
              </p>
            )}
            {settings.webhook.pending_update_count !== undefined && settings.webhook.pending_update_count > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                <span className="font-semibold">Pending:</span> {settings.webhook.pending_update_count} update menunggu
              </p>
            )}
            {settings.webhook.last_error_message && (
              <p className="text-xs text-red-600 dark:text-red-400">
                <span className="font-semibold">Error:</span> {settings.webhook.last_error_message}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Settings form */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-semibold">Aktifkan Bot</label>
            <p className="text-xs text-muted-foreground">Izinkan bot menerima dan memproses pesan</p>
          </div>
          <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} />
        </div>

        {/* Bot Token */}
        <div>
          <label className="text-sm font-semibold mb-1.5 block">Bot Token</label>
          <p className="text-xs text-muted-foreground mb-2">
            Dapatkan dari <code className="px-1 py-0.5 rounded bg-muted">@BotFather</code> di Telegram
          </p>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={form.botToken}
              onChange={(e) => setForm({ ...form, botToken: e.target.value })}
              placeholder="123456789:ABC-DEF..."
              className="w-full px-3 py-2 pr-10 text-sm font-mono rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Webhook Secret */}
        {settings?.webhookSecret && (
          <div>
            <label className="text-sm font-semibold mb-1.5 block">Webhook Secret</label>
            <p className="text-xs text-muted-foreground mb-2">
              Token rahasia untuk verifikasi webhook. Jangan dibagikan.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={settings.webhookSecret}
                  readOnly
                  className="w-full px-3 py-2 pr-10 text-sm font-mono rounded-lg border border-input bg-muted/30"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="button"
                onClick={handleRegenerateSecret}
                disabled={saving}
                className="px-3 py-2 text-sm rounded-lg border border-input bg-background hover:bg-muted/50 inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Regenerate
              </button>
            </div>
          </div>
        )}

        {/* Allowed Chat IDs */}
        <div>
          <label className="text-sm font-semibold mb-1.5 block flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Allowed Chat IDs
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            Daftar chat ID yang diizinkan (CSV). Kosongkan untuk mengizinkan semua user.
            <br />
            <span className="text-amber-600 dark:text-amber-400">⚠️ Kosong = semua orang bisa pakai bot. Sebaiknya isi.</span>
          </p>
          <input
            type="text"
            value={form.allowedChatIds}
            onChange={(e) => setForm({ ...form, allowedChatIds: e.target.value })}
            placeholder="123456789,987654321"
            className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            💡 Cara dapatkan chat ID: kirim pesan ke <code className="px-1 py-0.5 rounded bg-muted">@userinfobot</code>
          </p>
        </div>

        {/* Command toggles */}
        <div>
          <label className="text-sm font-semibold mb-3 block flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Perintah yang Diaktifkan
          </label>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between p-3 rounded-lg border border-input bg-background cursor-pointer hover:bg-muted/30" onClick={() => setForm({ ...form, enableRedaman: !form.enableRedaman })}>
              <div>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-teal-600" /> /redaman
                </p>
                <p className="text-xs text-muted-foreground">Cek redaman/sinyal ONU via GenieACS</p>
              </div>
              <Toggle checked={form.enableRedaman} onChange={(v) => setForm({ ...form, enableRedaman: v })} />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-input bg-background cursor-pointer hover:bg-muted/30" onClick={() => setForm({ ...form, enableCekPelanggan: !form.enableCekPelanggan })}>
              <div>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-teal-600" /> /cekpelanggan
                </p>
                <p className="text-xs text-muted-foreground">Cari detail pelanggan (nama/username/ID/HP)</p>
              </div>
              <Toggle checked={form.enableCekPelanggan} onChange={(v) => setForm({ ...form, enableCekPelanggan: v })} />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-input bg-background cursor-pointer hover:bg-muted/30" onClick={() => setForm({ ...form, enableStart: !form.enableStart })}>
              <div>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-teal-600" /> /start, /help
                </p>
                <p className="text-xs text-muted-foreground">Tampilkan daftar perintah</p>
              </div>
              <Toggle checked={form.enableStart} onChange={(v) => setForm({ ...form, enableStart: v })} />
            </div>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full px-4 py-2.5 text-sm font-semibold rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Simpan Pengaturan
        </button>
      </div>

      {/* Webhook control */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Link2 className="w-4 h-4 text-teal-600" /> Webhook
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Set webhook agar Telegram mengirim pesan masuk ke server Anda
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleWebhook('set')}
            disabled={webhookLoading !== null || !form.enabled || !form.botToken}
            className="flex-1 px-3 py-2 text-sm font-medium rounded-lg border border-input bg-background hover:bg-muted/50 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            {webhookLoading === 'set' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            Aktifkan Webhook
          </button>
          <button
            onClick={() => handleWebhook('unset')}
            disabled={webhookLoading !== null}
            className="flex-1 px-3 py-2 text-sm font-medium rounded-lg border border-input bg-background hover:bg-muted/50 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            {webhookLoading === 'unset' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2Off className="w-3.5 h-3.5" />}
            Nonaktifkan Webhook
          </button>
        </div>
        {webhookActive && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
            <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-semibold text-green-700 dark:text-green-400">Webhook aktif</p>
              <p className="text-green-600 dark:text-green-500/80 mt-0.5">
                Bot siap menerima pesan. Buka Telegram dan kirim <code className="px-1 py-0.5 rounded bg-green-100 dark:bg-green-900/40">/start</code> untuk tes.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Commands reference */}
      <div className="rounded-xl border border-border bg-muted/20 p-5">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
          <Bot className="w-4 h-4 text-teal-600" /> Daftar Perintah
        </h2>
        <div className="space-y-2 text-xs">
          <div className="flex items-start gap-2">
            <code className="px-2 py-0.5 rounded bg-teal-500/10 text-teal-700 dark:text-teal-400 font-mono shrink-0">{'/redaman <username|serial>'}</code>
            <span className="text-muted-foreground">Cek sinyal optik ONU (RX/TX power, suhu, uptime, status)</span>
          </div>
          <div className="flex items-start gap-2">
            <code className="px-2 py-0.5 rounded bg-teal-500/10 text-teal-700 dark:text-teal-400 font-mono shrink-0">{'/cekpelanggan <nama>'}</code>
            <span className="text-muted-foreground">Cari detail pelanggan (nama, username, customer ID, atau nomor HP)</span>
          </div>
          <div className="flex items-start gap-2">
            <code className="px-2 py-0.5 rounded bg-teal-500/10 text-teal-700 dark:text-teal-400 font-mono shrink-0">/start</code>
            <span className="text-muted-foreground">Tampilkan daftar perintah</span>
          </div>
        </div>
      </div>
    </div>
  )
}
