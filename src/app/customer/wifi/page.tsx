'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Wifi, WifiOff, Router, RefreshCw, Pencil, Save, X,
  Eye, EyeOff, Monitor, ServerCrash, Info, Radio, Power
} from 'lucide-react';
import { CyberCard, CyberButton } from '@/components/cyberpunk';
import { useToast } from '@/components/cyberpunk/CyberToast';

interface WLANConfig {
  index: number;
  ssid: string;
  enabled: boolean;
  channel: string;
  standard: string;
  security: string;
  password: string;
  band: string;
  totalAssociations: number;
  bssid: string;
}

interface ConnectedHost {
  macAddress: string;
  ipAddress: string;
  hostname: string;
  associatedDevice: string;
  active: boolean;
  signalStrength: string;
}

interface DeviceInfo {
  _id: string;
  pppUsername: string;
  serialNumber: string;
  model: string;
  manufacturer: string;
  softwareVersion: string;
  ipAddress: string;
  uptime: string;
  status: string;
  wlanConfigs: WLANConfig[];
  connectedHosts: ConnectedHost[];
  signalStrength: {
    rxPower: string;
    txPower: string;
    temperature: string;
  };
}

interface EditState {
  wlanIndex: number;
  ssid: string;
  password: string;
  showPassword: boolean;
}

export default function CustomerWiFiPage() {
  const router = useRouter();
  const { addToast } = useToast();

  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noGenieACS, setNoGenieACS] = useState(false);
  const [noDevice, setNoDevice] = useState(false);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [rebooting, setRebooting] = useState(false);

  const toast = (type: 'success' | 'error' | 'info', title: string, desc?: string) =>
    addToast({ type, title, description: desc, duration: type === 'error' ? 8000 : 5000 });

  const loadDevice = useCallback(async () => {
    const token = localStorage.getItem('customer_token');
    if (!token) {
      router.push('/customer/login');
      return;
    }

    try {
      const res = await fetch('/api/customer/wifi', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setNoDevice(true);
        setDevice(null);
        return;
      }
      const data = await res.json();

      if (!data.success) {
        if (data.reason === 'not_configured') {
          setNoGenieACS(true);
        } else {
          setNoDevice(true);
        }
        setDevice(null);
      } else {
        setDevice(data.device);
        setNoGenieACS(false);
        setNoDevice(false);
      }
    } catch {
      setNoDevice(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    const token = localStorage.getItem('customer_token');
    if (!token) {
      router.push('/customer/login');
      return;
    }
    loadDevice();
  }, [loadDevice, router]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadDevice();
  };

  const handleReboot = async () => {
    const confirmed = window.confirm(
      'Reboot modem/ONT?\n\nPerangkat akan restart dan koneksi internet terputus sementara 1-2 menit.'
    );
    if (!confirmed) return;
    setRebooting(true);
    const token = localStorage.getItem('customer_token');
    try {
      const res = await fetch('/api/customer/ont/reboot', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        toast('success', 'Reboot dikirim', data.message || 'Perangkat akan restart dalam beberapa detik.');
      } else {
        toast('error', 'Gagal', data.error || 'Gagal mengirim perintah reboot.');
      }
    } catch {
      toast('error', 'Error', 'Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setRebooting(false);
    }
  };

  const startEdit = (wlan: WLANConfig) => {
    setEditing({
      wlanIndex: wlan.index,
      ssid: wlan.ssid,
      password: '',
      showPassword: false,
    });
  };

  const cancelEdit = () => setEditing(null);

  const handleSave = async () => {
    if (!editing || !device) return;

    const ssid = editing.ssid.trim();
    const password = editing.password.trim();

    if (!ssid || ssid.length < 1 || ssid.length > 32) {
      toast('error', 'Validasi', 'Nama WiFi (SSID) harus 1–32 karakter.');
      return;
    }
    if (password.length > 0 && (password.length < 8 || password.length > 63)) {
      toast('error', 'Validasi', 'Password WiFi harus 8–63 karakter. Kosongkan jika tidak ingin mengubah.');
      return;
    }

    const confirmed = window.confirm(
      `Konfirmasi perubahan WiFi:\nSSID: ${ssid}\nPassword: ${password ? '*'.repeat(password.length) : '(tidak diubah)'}\n\nPerangkat akan restart sebentar setelah perubahan diterapkan.`
    );
    if (!confirmed) return;

    setSaving(true);
    const token = localStorage.getItem('customer_token');

    try {
      const res = await fetch('/api/customer/wifi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          deviceId: device._id,
          wlanIndex: editing.wlanIndex,
          ssid,
          password: password || undefined,
        }),
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();

      if (data.success) {
        toast('success', 'Berhasil', 'Konfigurasi WiFi dikirim ke perangkat. Tunggu 30–60 detik lalu sambungkan ulang.');
        setEditing(null);
        setTimeout(() => loadDevice(), 3000);
      } else {
        toast('error', 'Gagal', data.error || 'Gagal mengubah konfigurasi WiFi.');
      }
    } catch {
      toast('error', 'Error', 'Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Loading state ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-4 lg:p-6 flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto" />
          <p className="mt-3 text-slate-400 text-sm">Memuat info perangkat…</p>
        </div>
      </div>
    );
  }

  // ─── GenieACS not configured ─────────────────────────────────────────────────
  if (noGenieACS) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <CyberCard className="text-center py-12">
          <ServerCrash className="w-16 h-16 mx-auto text-slate-500 mb-4" />
          <h3 className="text-lg font-bold text-slate-300 mb-2">GenieACS belum dikonfigurasi</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Fitur pengaturan WiFi memerlukan GenieACS TR-069. Hubungi admin untuk mengaktifkan fitur ini.
          </p>
        </CyberCard>
      </div>
    );
  }

  // ─── Device not found ─────────────────────────────────────────────────────────
  if (noDevice || !device) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <CyberCard className="text-center py-12">
          <WifiOff className="w-16 h-16 mx-auto text-slate-500 mb-4" />
          <h3 className="text-lg font-bold text-slate-300 mb-2">Perangkat tidak ditemukan</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
            Pastikan ONT/router sudah terdaftar dan terhubung ke GenieACS.
          </p>
          <CyberButton onClick={handleRefresh} disabled={refreshing} variant="outline" size="sm">
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Coba Lagi
          </CyberButton>
        </CyberCard>
      </div>
    );
  }

  // ─── Main view ───────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-5 lg:p-6 space-y-4 sm:space-y-5 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <Wifi className="w-5 h-5 text-cyan-400" />
            Pengaturan WiFi
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Kelola SSID dan password WiFi perangkat Anda</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReboot}
            disabled={rebooting}
            title="Reboot Modem/ONT"
            className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-400 transition-colors disabled:opacity-40"
          >
            <Power className={`w-4 h-4 ${rebooting ? 'animate-pulse text-red-400' : ''}`} />
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Perbarui Data"
            className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-cyan-400 hover:border-cyan-400 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Device Info Card */}
      <CyberCard className="p-4 sm:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-cyan-400/10 flex items-center justify-center">
            <Router className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white truncate">{device.model || 'Perangkat ONT'}</p>
            <p className="text-xs text-slate-400">{device.manufacturer || 'Router'}</p>
          </div>
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${
            device.status === 'Online'
              ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20'
              : 'bg-red-400/10 text-red-400 border border-red-400/20'
          }`}>
            {device.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          {device.serialNumber && device.serialNumber !== '-' && (
            <div>
              <span className="text-slate-500">Serial</span>
              <p className="text-slate-300 font-mono truncate">{device.serialNumber}</p>
            </div>
          )}
          {device.softwareVersion && device.softwareVersion !== '-' && (
            <div>
              <span className="text-slate-500">Firmware</span>
              <p className="text-slate-300 truncate">{device.softwareVersion}</p>
            </div>
          )}
          {device.uptime && device.uptime !== '-' && (
            <div>
              <span className="text-slate-500">Uptime</span>
              <p className="text-slate-300">{device.uptime}</p>
            </div>
          )}
          {device.signalStrength?.rxPower && device.signalStrength.rxPower !== '-' && (
            <div>
              <span className="text-slate-500">RX Power</span>
              <p className="text-slate-300">{device.signalStrength.rxPower}</p>
            </div>
          )}
          <div>
            <span className="text-slate-500">Jaringan WiFi</span>
            <p className="text-slate-300">{device.wlanConfigs.length} WLAN</p>
          </div>
          {device.connectedHosts.length > 0 && (
            <div>
              <span className="text-slate-500">Perangkat terhubung</span>
              <p className="text-slate-300">{device.connectedHosts.length}</p>
            </div>
          )}
        </div>
      </CyberCard>

      {/* WLAN Cards */}
      {device.wlanConfigs.map((wlan) => {
        const isEditing = editing?.wlanIndex === wlan.index;
        const bandLabel = wlan.band === '5GHz' ? '5 GHz' : '2.4 GHz';

        return (
          <CyberCard key={wlan.index} className="p-4 sm:p-5">
            {/* WLAN Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-muted dark:bg-slate-800 flex items-center justify-center">
                <Radio className={`w-5 h-5 ${wlan.enabled ? 'text-emerald-400' : 'text-slate-500'}`} />
              </div>
              <div className="flex-1">
                <p className="font-bold text-white text-sm">WiFi {bandLabel}</p>
                <p className="text-xs text-slate-400 truncate">{wlan.ssid || '(SSID belum dikonfigurasi)'}</p>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full border ${
                wlan.enabled
                  ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20'
                  : 'bg-red-400/10 text-red-400 border-red-400/20'
              }`}>
                {wlan.enabled ? 'Aktif' : 'Mati'}
              </span>
            </div>

            <div className="border-t border-border/50 dark:border-slate-700/50 pt-4">
              {!isEditing ? (
                // ── View mode ─────────────────────────────────────────────
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Wifi className="w-4 h-4 text-slate-500 shrink-0" />
                    <span className="text-white">{wlan.ssid || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500 text-xs w-16">Keamanan</span>
                    <span className="text-slate-300 text-xs">{wlan.security !== '-' ? wlan.security : 'WPA2-PSK'}</span>
                  </div>
                  {wlan.totalAssociations > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <Monitor className="w-4 h-4 text-slate-500 shrink-0" />
                      <span className="text-slate-400 text-xs">{wlan.totalAssociations} perangkat terhubung</span>
                    </div>
                  )}
                  <div className="mt-5 pt-1">
                    <CyberButton
                      onClick={() => startEdit(wlan)}
                      disabled={!!editing && !isEditing}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit WiFi Ini
                    </CyberButton>
                  </div>
                  {/* Connected devices for this WLAN */}
                  {(() => {
                    const wlanDevices = device.connectedHosts.filter(h => h.associatedDevice === String(wlan.index));
                    if (wlanDevices.length === 0) return null;
                    return (
                      <div className="mt-3 pt-3 border-t border-border/50 dark:border-slate-700/50">
                        <p className="text-xs text-slate-500 mb-2">Perangkat terhubung ke SSID ini:</p>
                        <div className="space-y-1.5">
                          {wlanDevices.map((host, i) => (
                            <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg bg-muted/40 dark:bg-slate-800/40 border border-border/40 dark:border-slate-700/40">
                              <div className="w-6 h-6 rounded-full bg-emerald-400/10 flex items-center justify-center shrink-0">
                                <Monitor className="w-3 h-3 text-emerald-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-white truncate">
                                  {host.hostname && host.hostname !== '-' ? host.hostname : host.macAddress}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {host.ipAddress !== '-' ? host.ipAddress : host.macAddress}
                                  {host.signalStrength && host.signalStrength !== '-' ? ` · ${host.signalStrength}` : ''}
                                </p>
                              </div>
                              <span className="text-xs text-emerald-400 shrink-0">●</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                // ── Edit mode ─────────────────────────────────────────────
                <div className="space-y-4">
                  {/* SSID */}
                  <div>
                    <label className="block text-xs text-muted-foreground dark:text-slate-400 mb-1.5">
                      Nama WiFi (SSID)
                    </label>
                    <input
                      type="text"
                      value={editing.ssid}
                      onChange={(e) => setEditing({ ...editing, ssid: e.target.value })}
                      maxLength={32}
                      autoComplete="off"
                      placeholder="Nama WiFi baru"
                      className="w-full bg-background dark:bg-slate-800 border border-border dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-cyan-500 transition-colors"
                    />
                    <p className="text-xs text-slate-500 mt-1">{editing.ssid.length}/32 karakter</p>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-xs text-muted-foreground dark:text-slate-400 mb-1.5">
                      Password WiFi
                    </label>
                    <div className="relative">
                      <input
                        type={editing.showPassword ? 'text' : 'password'}
                        value={editing.password}
                        onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                        maxLength={63}
                        autoComplete="new-password"
                        placeholder="Kosongkan jika tidak ingin mengubah"
                        className="w-full bg-background dark:bg-slate-800 border border-border dark:border-slate-700 rounded-lg px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-cyan-500 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setEditing({ ...editing, showPassword: !editing.showPassword })}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                      >
                        {editing.showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">8–63 karakter. Kosongkan jika tidak ingin mengubah password.</p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={cancelEdit}
                      disabled={saving}
                      className="flex-1 py-2 rounded-lg border border-border dark:border-slate-600 text-foreground dark:text-slate-300 text-sm font-bold hover:border-muted-foreground/50 transition-colors disabled:opacity-40"
                    >
                      Batal
                    </button>
                    <CyberButton
                      onClick={handleSave}
                      disabled={saving}
                      size="sm"
                      className="flex-1"
                    >
                      {saving ? (
                        <div className="flex items-center gap-2">
                          <div className="animate-spin w-4 h-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full" />
                          Menyimpan…
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Save className="w-4 h-4" />
                          Simpan
                        </div>
                      )}
                    </CyberButton>
                  </div>
                </div>
              )}
            </div>
          </CyberCard>
        );
      })}

      {/* Info Box */}
      <CyberCard className="p-4 sm:p-5 border-blue-500/20 bg-blue-500/5">
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-400">
            Perubahan dikirim langsung ke perangkat via TR-069. Setelah disimpan, tunggu <strong className="text-slate-300">30–60 detik</strong> lalu sambungkan kembali ke WiFi dengan nama/password baru.
          </p>
        </div>
      </CyberCard>

    </div>
  );
}
