'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Smartphone, Download, Shield, Wifi, Users, UserCheck,
  CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw,
  Terminal, Copy, Check, HardDrive, ChevronDown,
  Package, Globe, Upload, ImageIcon,
} from 'lucide-react';

// ─── types ────────────────────────────────────────────────────────────────────

interface EnvStatus {
  ready: boolean;
  java: boolean;
  javaVersion?: string;
  androidSdk: boolean;
  androidHome?: string;
}

interface BuildStatus {
  status: 'idle' | 'building' | 'done' | 'failed' | 'stale';
  startedAt?: string;
  finishedAt?: string;
  appName?: string;
  url?: string;
  apkSize?: number;
  apkAvailable?: boolean;
  error?: string;
}

// ─── constants ────────────────────────────────────────────────────────────────

const ROLES = [
  {
    key: 'admin',
    label: 'Admin Panel',
    description: 'Manajemen billing, pelanggan, keuangan, dan konfigurasi sistem.',
    icon: <Shield className="w-5 h-5" />,
    gradient: 'from-blue-600 to-blue-800',
    border: 'border-blue-500/30',
    iconBg: 'bg-blue-500/20 text-blue-400',
    btn: 'from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600',
    pathSuffix: '/admin',
  },
  {
    key: 'customer',
    label: 'Portal Pelanggan',
    description: 'Pelanggan melihat tagihan, riwayat pembayaran, dan profil langganan.',
    icon: <Users className="w-5 h-5" />,
    gradient: 'from-cyan-600 to-cyan-800',
    border: 'border-cyan-500/30',
    iconBg: 'bg-cyan-500/20 text-cyan-400',
    btn: 'from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600',
    pathSuffix: '/customer',
  },
  {
    key: 'technician',
    label: 'Portal Teknisi',
    description: 'Teknisi lapangan mengelola instalasi, tiket, dan jadwal kunjungan.',
    icon: <Wifi className="w-5 h-5" />,
    gradient: 'from-emerald-600 to-emerald-800',
    border: 'border-emerald-500/30',
    iconBg: 'bg-emerald-500/20 text-emerald-400',
    btn: 'from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600',
    pathSuffix: '/technician',
  },
  {
    key: 'agent',
    label: 'Portal Agen',
    description: 'Agen marketing mengelola referral, komisi, dan monitoring downline.',
    icon: <UserCheck className="w-5 h-5" />,
    gradient: 'from-violet-600 to-violet-800',
    border: 'border-violet-500/30',
    iconBg: 'bg-violet-500/20 text-violet-400',
    btn: 'from-violet-600 to-violet-700 hover:from-violet-500 hover:to-violet-600',
    pathSuffix: '/agent',
  },
] as const;

type RoleKey = typeof ROLES[number]['key'];

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso?: string) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
}

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1 rounded text-slate-400 hover:text-white transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ─── EnvBanner ────────────────────────────────────────────────────────────────

function EnvBanner({ env, onRecheck }: { env: EnvStatus; onRecheck: () => void }) {
  const [showSetup, setShowSetup] = useState(!env.ready);

  const installCmd = `apt-get update && apt-get install -y openjdk-17-jdk wget unzip && \\
mkdir -p /opt/android/cmdline-tools && \\
wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O /tmp/cmdtools.zip && \\
unzip -q /tmp/cmdtools.zip -d /opt/android/cmdline-tools && \\
mv /opt/android/cmdline-tools/cmdline-tools /opt/android/cmdline-tools/latest && \\
yes | /opt/android/cmdline-tools/latest/bin/sdkmanager --licenses && \\
/opt/android/cmdline-tools/latest/bin/sdkmanager "platforms;android-34" "build-tools;34.0.0" && \\
echo 'export ANDROID_HOME=/opt/android' >> /etc/environment && \\
echo 'Selesai!'`;

  if (env.ready) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        <div className="flex-1 text-sm text-emerald-300">
          <span className="font-semibold">Build environment siap.</span>{' '}
          <span className="text-emerald-200/70">Java {env.javaVersion} · Android SDK di {env.androidHome}</span>
        </div>
        <button onClick={onRecheck} className="text-emerald-400 hover:text-emerald-300">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-300">Build environment belum siap</p>
          <div className="flex gap-4 mt-1 text-xs text-amber-200/70">
            <span>{env.java ? '✓' : '✗'} Java {env.java ? env.javaVersion : '(tidak ada)'}</span>
            <span>{env.androidSdk ? '✓' : '✗'} Android SDK</span>
          </div>
        </div>
        <button
          onClick={() => setShowSetup(!showSetup)}
          className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 whitespace-nowrap"
        >
          Cara install <ChevronDown className={`w-3 h-3 transition-transform ${showSetup ? 'rotate-180' : ''}`} />
        </button>
        <button onClick={onRecheck} className="text-amber-400 hover:text-amber-300 ml-1">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      {showSetup && (
        <div className="px-4 pb-4">
          <p className="text-xs text-amber-200/70 mb-2">
            Jalankan di server via SSH (satu kali, ~500MB download pertama kali):
          </p>
          <div className="relative rounded-lg bg-slate-950/80 border border-amber-500/20 p-3 pr-10">
            <pre className="text-[11px] text-emerald-400 whitespace-pre-wrap break-all leading-relaxed">{installCmd}</pre>
            <div className="absolute top-2 right-2"><CopyButton text={installCmd} /></div>
          </div>
          <p className="text-xs text-amber-200/50 mt-2">Setelah install, restart server lalu klik tombol refresh di atas.</p>
        </div>
      )}
    </div>
  );
}

// ─── RoleCard ─────────────────────────────────────────────────────────────────

function RoleCard({
  role, status, envReady, onBuild, onDownload,
}: {
  role: typeof ROLES[number];
  status: BuildStatus | null;
  envReady: boolean;
  onBuild: (r: RoleKey) => void;
  onDownload: (r: RoleKey) => void;
}) {
  const isBuilding = status?.status === 'building';
  const isDone     = status?.status === 'done';
  const isFailed   = status?.status === 'failed' || status?.status === 'stale';
  const hasApk     = !!status?.apkAvailable;

  return (
    <div className={`relative overflow-hidden rounded-xl border ${role.border} bg-slate-900/60`}>
      <div className={`h-1 w-full bg-gradient-to-r ${role.gradient}`} />
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${role.border} ${role.iconBg}`}>
            {role.icon}
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">{role.label}</h3>
            <span className="text-[10px] font-mono text-slate-500">...{role.pathSuffix}</span>
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed mb-4">{role.description}</p>

        {/* Status badge */}
        {status && status.status !== 'idle' && (
          <div className={`mb-3 rounded-lg px-3 py-2 text-xs border ${
            isBuilding ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
              : isDone  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : isFailed? 'bg-red-500/10 border-red-500/30 text-red-300'
              : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}>
            {isBuilding && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-blue-400/40 border-t-blue-400 rounded-full animate-spin" />
                <span>Build berjalan… <span className="opacity-60 text-[10px]">{formatTime(status.startedAt)}</span></span>
              </div>
            )}
            {isDone && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Selesai · {formatTime(status.finishedAt)}</span>
                </div>
                {status.apkSize && <span className="font-mono opacity-70">{formatBytes(status.apkSize)}</span>}
              </div>
            )}
            {isFailed && (
              <div>
                <div className="flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Build gagal · {formatTime(status.finishedAt)}</span>
                </div>
                {status.error && <p className="text-[10px] opacity-70 mt-0.5 pl-5 truncate">{status.error}</p>}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          {hasApk && (
            <button
              onClick={() => onDownload(role.key)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              Download APK
            </button>
          )}
          <button
            onClick={() => onBuild(role.key)}
            disabled={isBuilding || !envReady}
            className={`${hasApk ? '' : 'flex-1'} flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all text-white bg-gradient-to-r ${role.btn} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {isBuilding ? (
              <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Building…</>
            ) : (
              <><Package className="w-3.5 h-3.5" />{hasApk ? 'Rebuild' : 'Build APK'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function DownloadApkPage() {
  const [env, setEnv]           = useState<EnvStatus | null>(null);
  const [statuses, setStatuses] = useState<Partial<Record<RoleKey, BuildStatus>>>({});
  const [building, setBuilding] = useState<Set<RoleKey>>(new Set());
  const [customUrl, setCustomUrl] = useState('');
  const [currentLogo, setCurrentLogo] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState('');

  const fetchEnv = useCallback(() => {
    fetch('/api/admin/apk/trigger')
      .then(r => r.json())
      .then((data: EnvStatus & { defaultUrl?: string }) => {
        setEnv(data);
        if (data.defaultUrl && !customUrl) setCustomUrl(data.defaultUrl);
      })
      .catch(() => setEnv({ ready: false, java: false, androidSdk: false }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCompanyLogo = useCallback(() => {
    fetch('/api/company')
      .then(r => r.json())
      .then(data => { if (data.logo) setCurrentLogo(data.logo); })
      .catch(() => {});
  }, []);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setLogoError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload/logo', { method: 'POST', body: form });
      const data = await res.json();
      if (data.success && data.url) {
        // Save logo URL to company settings
        const companyRes = await fetch('/api/company');
        const company = await companyRes.json();
        await fetch('/api/company', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...company, logo: data.url }),
        });
        setCurrentLogo(data.url);
      } else {
        setLogoError(data.error || 'Upload gagal');
      }
    } catch {
      setLogoError('Gagal menghubungi server');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const fetchStatus = useCallback(async (role: RoleKey) => {
    try {
      const res = await fetch(`/api/admin/apk/status?role=${role}`);
      const data: BuildStatus = await res.json();
      setStatuses(prev => ({ ...prev, [role]: data }));
      return data;
    } catch { return null; }
  }, []);

  useEffect(() => {
    fetchEnv();
    fetchCompanyLogo();
    ROLES.forEach(r => fetchStatus(r.key));
  }, [fetchEnv, fetchStatus, fetchCompanyLogo]);

  // Poll roles that are building
  useEffect(() => {
    if (building.size === 0) return;
    const id = setInterval(async () => {
      for (const role of building) {
        const data = await fetchStatus(role);
        if (data && data.status !== 'building') {
          setBuilding(prev => { const s = new Set(prev); s.delete(role); return s; });
        }
      }
    }, 3000);
    return () => clearInterval(id);
  }, [building, fetchStatus]);

  async function handleBuild(role: RoleKey) {
    setBuilding(prev => new Set([...prev, role]));
    setStatuses(prev => ({ ...prev, [role]: { status: 'building', startedAt: new Date().toISOString() } }));
    try {
      const urlParam = customUrl.trim() ? `&url=${encodeURIComponent(customUrl.trim())}` : '';
      const res = await fetch(`/api/admin/apk/trigger?role=${role}${urlParam}`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Gagal memulai build' }));
        setStatuses(prev => ({ ...prev, [role]: { status: 'failed', error: err.error } }));
        setBuilding(prev => { const s = new Set(prev); s.delete(role); return s; });
        alert(err.error);
      }
    } catch {
      setStatuses(prev => ({ ...prev, [role]: { status: 'failed', error: 'Network error' } }));
      setBuilding(prev => { const s = new Set(prev); s.delete(role); return s; });
    }
  }

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-slate-900 to-slate-950 p-5">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
            <Smartphone className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-wide">Build Aplikasi Android</h1>
            <p className="text-xs text-slate-400 mt-0.5">Build APK langsung di server — download setelah selesai, tanpa GitHub.</p>
          </div>
        </div>
      </div>

      {/* URL Config */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
        <div className="flex items-center gap-2 text-slate-300 text-xs font-semibold mb-3">
          <Globe className="w-3.5 h-3.5 text-cyan-400" /> URL Server (digunakan sebagai base URL di dalam APK)
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="url"
            value={customUrl}
            onChange={e => setCustomUrl(e.target.value)}
            placeholder="https://radius.hotspotapp.net"
            className="flex-1 bg-slate-800 border border-slate-600 text-white text-xs rounded-lg px-3 py-2 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
          />
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          URL ini akan di-hardcode ke dalam APK sebagai tujuan WebView. Gunakan subdomain Cloudflare Tunnel atau IP publik.
          Contoh: <code className="text-slate-400">https://radius.hotspotapp.net</code>
        </p>
      </div>

      {/* Logo APK */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
        <div className="flex items-center gap-2 text-slate-300 text-xs font-semibold mb-3">
          <ImageIcon className="w-3.5 h-3.5 text-cyan-400" /> Logo Aplikasi (digunakan sebagai ikon APK)
        </div>
        {/* Preview — full width */}
        <div className="w-44 h-44 mx-auto rounded-xl border border-slate-700 bg-slate-800/60 flex items-center justify-center overflow-hidden mb-3">
          {currentLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentLogo} alt="Logo" className="max-h-full max-w-full object-contain p-3" />
          ) : (
            <div className="flex flex-col items-center gap-2">
              <ImageIcon className="w-10 h-10 text-slate-600" />
              <span className="text-xs text-slate-500">Belum ada logo</span>
            </div>
          )}
        </div>
        {/* Upload */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className={`inline-flex items-center gap-1.5 py-2 px-4 rounded-lg text-xs font-bold transition-all text-white ${
              uploadingLogo ? 'bg-slate-700 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500'
            }`}>
              {uploadingLogo ? (
                <><RefreshCw className="w-3 h-3 animate-spin" /> Mengupload…</>
              ) : (
                <><Upload className="w-3 h-3" /> {currentLogo ? 'Ganti Logo' : 'Upload Logo'}</>
              )}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/avif,image/gif"
              onChange={handleLogoUpload}
              disabled={uploadingLogo}
              className="hidden"
            />
          </label>
          <div>
            <p className="text-[11px] text-slate-500">
              PNG/JPG/SVG/WebP/AVIF/GIF, maks 2MB. Logo otomatis menyesuaikan layout dan digunakan sebagai ikon saat build APK.
            </p>
            {logoError && <p className="text-[11px] text-red-400 mt-1">{logoError}</p>}
            {currentLogo && !logoError && (
              <p className="text-[11px] text-emerald-400 mt-1">Logo aktif tersimpan di server.</p>
            )}
          </div>
        </div>
      </div>

      {/* Env Banner */}
      {env && <EnvBanner env={env} onRecheck={fetchEnv} />}
      {!env && (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" /> Memeriksa environment…
        </div>
      )}

      {/* Role Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ROLES.map(role => (
          <RoleCard
            key={role.key}
            role={role}
            status={statuses[role.key] ?? null}
            envReady={!!env?.ready}
            onBuild={handleBuild}
            onDownload={(r) => { window.location.href = `/api/admin/apk/file?role=${r}`; }}
          />
        ))}
      </div>

      {/* Info */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-2">
        <div className="flex items-center gap-2 text-slate-300 text-xs font-semibold mb-1">
          <Terminal className="w-3.5 h-3.5" /> Informasi Build
        </div>
        <div className="space-y-1.5 text-xs text-slate-400">
          <div className="flex items-start gap-2">
            <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-500" />
            <span>Build pertama ~3-5 menit (download dependencies). Selanjutnya ~1 menit (cache Gradle).</span>
          </div>
          <div className="flex items-start gap-2">
            <HardDrive className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-500" />
            <span>APK disimpan di <code className="text-slate-300 font-mono">/var/data/salfanet/apk/</code> dan tersedia sampai di-rebuild.</span>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500" />
            <span>Ikon APK masih placeholder 1×1px. Untuk ikon custom, perlu modifikasi project sebelum build.</span>
          </div>
        </div>
      </div>

      {/* Fallback: ZIP download */}
      <details className="rounded-xl border border-slate-700/40 bg-slate-900/30 overflow-hidden group">
        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer text-xs text-slate-500 hover:text-slate-400 select-none">
          <span>Alternatif: Download project ZIP untuk build manual (GitHub Actions / Android Studio)</span>
          <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
        </summary>
        <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ROLES.map(r => (
            <a
              key={r.key}
              href={`/api/admin/download-apk?role=${r.key}`}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium text-slate-400 hover:text-white border border-slate-700/50 hover:border-slate-600 bg-slate-800/50 hover:bg-slate-800 transition-all"
            >
              <Download className="w-3 h-3" />{r.label.split(' ').pop()}
            </a>
          ))}
        </div>
      </details>
    </div>
  );
}
