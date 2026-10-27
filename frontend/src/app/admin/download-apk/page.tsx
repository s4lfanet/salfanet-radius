'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Smartphone, Download, Shield, Wifi, Users, UserCheck,
  CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw,
  Terminal, Copy, Check, HardDrive, ChevronDown,
  Package, Globe, Upload, ImageIcon, Wallet, Bell, Trash2,
} from 'lucide-react';
import { apiAdmin, buildUrl } from '@/lib/api';
import { showError } from '@/lib/sweetalert';
import { useApiQuery } from '@/lib/api/hooks';
import { formatWIB } from '@/lib/timezone';

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
    gradient: 'from-primary to-violet-800',
    border: 'border-border',
    iconBg: 'bg-primary/10 text-primary',
    btn: 'from-primary to-violet-700 hover:from-primary hover:to-primary',
    pathSuffix: '/agent',
  },
  {
    key: 'collector',
    label: 'Portal Kolektor',
    description: 'Kolektor menagih pelanggan, cetak invoice via Bluetooth printer, dan kirim bukti lunas WhatsApp.',
    icon: <Wallet className="w-5 h-5" />,
    gradient: 'from-amber-600 to-amber-800',
    border: 'border-amber-500/30',
    iconBg: 'bg-amber-500/20 text-amber-400',
    btn: 'from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600',
    pathSuffix: '/collector',
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
  return formatWIB(iso, 'dd MMM yyyy HH:mm');
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
                  <span>{status.status === 'stale' ? 'Build berhenti tanpa kabar (lebih dari 15 menit)' : 'Build gagal'} · {formatTime(status.finishedAt ?? status.startedAt)}</span>
                </div>
                {status.error && <pre className="mt-1 ml-5 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-black/5 p-2 font-mono text-[11px] leading-snug dark:bg-white/5">{status.error}</pre>}
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

// ─── published releases ──────────────────────────────────────────────────────

interface ApkRelease {
  target: 'customer' | 'admin';
  label: string;
  available: boolean;
  size?: number;
  updatedAt?: string;
  version?: string;
  uploadedBy?: string;
  note?: string;
  url?: string;
  versionCode?: number;
  versionName?: string;
  minVersionCode?: number;
}

/**
 * The APKs offered on the customer and admin login pages. Super Admin
 * uploads a release build here; the login pages pick it up at once, with
 * a new version id in the link so Cloudflare serves the new file.
 */
function ReleasePanel() {
  const query = useApiQuery<{ success: boolean; releases: ApkRelease[]; maxBytes: number }>('/api/admin/apk/release');
  const [progress, setProgress] = useState<Record<string, number | null>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [mandatory, setMandatory] = useState<Record<string, boolean>>({});
  const releases = query.data?.releases ?? [];
  const maxBytes = query.data?.maxBytes ?? 50 * 1024 * 1024;

  const upload = (target: string, file: File) => {
    if (!file.name.toLowerCase().endsWith('.apk')) {
      setErrors((e) => ({ ...e, [target]: 'Pilih file berekstensi .apk.' }));
      return;
    }
    if (file.size > maxBytes) {
      setErrors((e) => ({ ...e, [target]: `Ukuran ${formatBytes(file.size)} melebihi batas ${formatBytes(maxBytes)}.` }));
      return;
    }
    setErrors((e) => ({ ...e, [target]: null }));
    setProgress((p) => ({ ...p, [target]: 0 }));
    const form = new FormData();
    form.append('target', target);
    form.append('file', file);
    if (notes[target]?.trim()) form.append('note', notes[target].trim());
    if (mandatory[target]) form.append('mandatory', '1');
    // XHR rather than fetch: a ~30 MB upload needs a progress bar.
    const xhr = new XMLHttpRequest();
    xhr.open('POST', buildUrl('/api/admin/apk/release'));
    xhr.withCredentials = true;
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setProgress((p) => ({ ...p, [target]: Math.round((ev.loaded / ev.total) * 100) }));
    };
    xhr.onload = () => {
      setProgress((p) => ({ ...p, [target]: null }));
      let body: { success?: boolean; error?: string } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON error page */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.success) {
        setNotes((n) => ({ ...n, [target]: '' }));
        setMandatory((m) => ({ ...m, [target]: false }));
        query.refetch();
      } else {
        setErrors((e) => ({
          ...e,
          [target]: body.error || (xhr.status === 413 ? 'File terlalu besar untuk server.' : `Gagal mengunggah (HTTP ${xhr.status}).`),
        }));
      }
    };
    xhr.onerror = () => {
      setProgress((p) => ({ ...p, [target]: null }));
      setErrors((e) => ({ ...e, [target]: 'Koneksi terputus saat mengunggah.' }));
    };
    xhr.send(form);
  };

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
      <div className="flex items-center gap-2 text-slate-300 text-xs font-semibold mb-1">
        <Upload className="w-3.5 h-3.5 text-cyan-400" /> Rilis APK di Halaman Login
      </div>
      <p className="text-[11px] text-slate-400 mb-3">
        APK yang diunggah di sini muncul sebagai tombol unduh di halaman login pelanggan dan admin, dan ditawarkan sebagai
        update di aplikasi yang sudah terpasang. Gunakan APK release aplikasi native (bukan hasil Build APK di bawah),
        maksimal {formatBytes(maxBytes)}. Nomor build harus lebih tinggi dari yang sekarang dan kunci tanda tangannya
        harus sama.
      </p>
      {query.isLoading && (
        <div className="flex items-center gap-2 text-slate-400 text-xs"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Memuat…</div>
      )}
      {query.error && <p className="text-xs text-red-400">Gagal memuat data rilis. Halaman ini khusus Super Admin.</p>}
      <div className="space-y-2">
        {releases.map((r) => {
          const busy = progress[r.target] != null;
          return (
            <div key={r.target} className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{r.label}</p>
                  {r.available ? (
                    <p className="text-[11px] text-slate-400 mt-0.5 break-words">
                      {r.versionCode !== undefined && (
                        <span className="text-slate-200">
                          Versi {r.versionName ?? '-'} (build {r.versionCode}) ·{' '}
                        </span>
                      )}
                      {formatBytes(r.size ?? 0)} · diunggah {formatTime(r.updatedAt)}{r.uploadedBy ? ` oleh ${r.uploadedBy}` : ''} ·{' '}
                      <a href={r.url} className="text-cyan-400 hover:underline">unduh untuk cek</a>
                    </p>
                  ) : (
                    <p className="text-[11px] text-amber-400 mt-0.5">Belum ada APK; tombol unduh di halaman login disembunyikan.</p>
                  )}
                  {r.available && r.note && <p className="text-[11px] text-slate-400 mt-0.5 break-words">Catatan: {r.note}</p>}
                  {r.available && r.minVersionCode !== undefined && (
                    <p className="text-[11px] text-amber-300 mt-0.5">Wajib update untuk aplikasi di bawah build {r.minVersionCode}.</p>
                  )}
                </div>
                <label className="shrink-0">
                  <span className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] py-2 px-4 rounded-lg text-xs font-bold text-white transition-all ${busy ? 'bg-slate-700 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500 cursor-pointer'}`}>
                    {busy ? <><RefreshCw className="w-3 h-3 animate-spin" /> {progress[r.target]}%</> : <><Upload className="w-3 h-3" /> {r.available ? 'Ganti APK' : 'Unggah APK'}</>}
                  </span>
                  <input
                    type="file"
                    accept=".apk,application/vnd.android.package-archive"
                    className="sr-only"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) upload(r.target, f);
                    }}
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <input
                  type="text"
                  value={notes[r.target] ?? ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.target]: e.target.value }))}
                  maxLength={200}
                  disabled={busy}
                  placeholder="Catatan rilis untuk pengguna (opsional), mis. Perbaikan pembayaran"
                  aria-label={`Catatan rilis ${r.label}`}
                  className="flex-1 min-w-0 min-h-[40px] rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <label className="inline-flex items-center gap-2 min-h-[40px] text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={mandatory[r.target] ?? false}
                    onChange={(e) => setMandatory((m) => ({ ...m, [r.target]: e.target.checked }))}
                    disabled={busy}
                    className="w-4 h-4 accent-cyan-500"
                  />
                  Wajib update
                </label>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Isi catatan dan centang Wajib update dulu bila perlu, lalu pilih file. Wajib update: aplikasi versi lama tidak
                bisa dipakai sebelum diperbarui.
              </p>
              {busy && (
                <div className="mt-2 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                  <div className="h-full bg-cyan-500 transition-all" style={{ width: `${progress[r.target]}%` }} />
                </div>
              )}
              {errors[r.target] && <p className="text-[11px] text-red-400 mt-2">{errors[r.target]}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type FirebaseKind = 'google-services' | 'service-account';

interface FirebaseStatus {
  clientConfig: { projectId: string; apps: Array<'customer' | 'admin'> } | null;
  serviceAccount: { projectId: string; clientEmail: string; source: 'env' | 'file' } | null;
  projectMismatch: boolean;
  ready: { customer: boolean; admin: boolean };
}

const FIREBASE_FILES: Array<{ kind: FirebaseKind; label: string; hint: string }> = [
  {
    kind: 'google-services',
    label: 'google-services.json',
    hint: 'Firebase console → Project settings → Your apps → aplikasi Android → unduh google-services.json',
  },
  {
    kind: 'service-account',
    label: 'Kunci service account',
    hint: 'Firebase console → Project settings → Service accounts → Generate new private key',
  },
];

function FirebasePanel() {
  const query = useApiQuery<{ success: boolean } & FirebaseStatus>('/api/admin/push-config');
  const [busy, setBusy] = useState<FirebaseKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = query.data;

  const upload = async (kind: FirebaseKind, file: File) => {
    setBusy(kind);
    setError(null);
    try {
      const form = new FormData();
      form.append('kind', kind);
      form.append('file', file);
      await apiAdmin('/api/admin/push-config', { method: 'POST', body: form });
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengunggah file.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (kind: FirebaseKind) => {
    setBusy(kind);
    setError(null);
    try {
      await apiAdmin(`/api/admin/push-config?kind=${kind}`, { method: 'DELETE' });
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus file.');
    } finally {
      setBusy(null);
    }
  };

  const describe = (kind: FirebaseKind) => {
    if (!status) return null;
    if (kind === 'google-services') {
      return status.clientConfig
        ? `Project ${status.clientConfig.projectId} · aplikasi: ${status.clientConfig.apps.map((a) => (a === 'admin' ? 'admin' : 'pelanggan')).join(', ')}`
        : null;
    }
    return status.serviceAccount
      ? `Project ${status.serviceAccount.projectId} · ${status.serviceAccount.clientEmail}${status.serviceAccount.source === 'env' ? ' (dari .env)' : ''}`
      : null;
  };

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
      <div className="flex items-center gap-2 text-slate-300 text-xs font-semibold mb-1">
        <Bell className="w-3.5 h-3.5 text-cyan-400" /> Notifikasi Push Aplikasi (opsional)
      </div>
      <p className="text-[11px] text-slate-400 mb-3">
        Aplikasi native mengambil pengaturan ini dari server, jadi satu APK bisa dipakai di instalasi mana pun. Tanpa
        Firebase, aplikasi tetap menerima notifikasi dengan mengecek server sekitar tiap 15 menit, dan langsung saat
        aplikasi dibuka. Dengan Firebase, notifikasi masuk seketika. Unggah dua file dari project Firebase yang sama.
      </p>
      {query.isLoading && (
        <div className="flex items-center gap-2 text-slate-400 text-xs"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Memuat…</div>
      )}
      {query.error && <p className="text-xs text-red-400">Gagal memuat pengaturan Firebase. Bagian ini khusus Super Admin.</p>}
      {status && (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            {(['customer', 'admin'] as const).map((app) => (
              <span
                key={app}
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] border ${status.ready[app] ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-600 bg-slate-800/60 text-slate-300'}`}
              >
                {status.ready[app] ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                Aplikasi {app === 'admin' ? 'admin' : 'pelanggan'}: {status.ready[app] ? 'Firebase (seketika)' : 'cek berkala'}
              </span>
            ))}
          </div>
          {status.projectMismatch && (
            <p className="text-[11px] text-amber-300 mb-3">
              Kedua file berasal dari project Firebase yang berbeda ({status.clientConfig?.projectId} dan{' '}
              {status.serviceAccount?.projectId}). Aplikasi tetap memakai cek berkala sampai keduanya dari project yang sama.
            </p>
          )}
          <div className="space-y-2">
            {FIREBASE_FILES.map(({ kind, label, hint }) => {
              const info = describe(kind);
              const fromEnv = kind === 'service-account' && status.serviceAccount?.source === 'env';
              return (
                <div key={kind} className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className={`text-[11px] mt-0.5 break-words ${info ? 'text-slate-300' : 'text-slate-500'}`}>{info ?? 'Belum diunggah.'}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{hint}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {info && !fromEnv && (
                      <button
                        type="button"
                        onClick={() => remove(kind)}
                        disabled={busy !== null}
                        aria-label={`Hapus ${label}`}
                        className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] rounded-lg border border-slate-600 text-slate-300 hover:text-red-300 hover:border-red-500/40 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!fromEnv && (
                      <label>
                        <span className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] py-2 px-4 rounded-lg text-xs font-bold text-white ${busy ? 'bg-slate-700 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500 cursor-pointer'}`}>
                          {busy === kind ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                          {info ? 'Ganti' : 'Unggah'}
                        </span>
                        <input
                          type="file"
                          accept=".json,application/json"
                          className="sr-only"
                          disabled={busy !== null}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (f) void upload(kind, f);
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {status.serviceAccount?.source === 'env' && (
            <p className="text-[10px] text-slate-500 mt-2">
              Kunci service account diambil dari FIREBASE_SERVICE_ACCOUNT_JSON di .env backend. Hapus variabel itu bila ingin
              mengaturnya dari sini.
            </p>
          )}
          {error && <p className="text-[11px] text-red-400 mt-2">{error}</p>}
        </>
      )}
    </div>
  );
}

export default function DownloadApkPage() {
  const [statuses, setStatuses] = useState<Partial<Record<RoleKey, BuildStatus>>>({});
  const [building, setBuilding] = useState<Set<RoleKey>>(new Set());
  const [customUrl, setCustomUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState('');

  // ─── React Query: Env status + default URL ──────────────────────────────────
  const envQuery = useApiQuery<EnvStatus & { defaultUrl?: string }>('/api/admin/apk/trigger');
  const env = envQuery.data ?? (envQuery.error ? { ready: false, java: false, androidSdk: false } as EnvStatus : null);
  useEffect(() => {
    if (envQuery.data?.defaultUrl && !customUrl) setCustomUrl(envQuery.data.defaultUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envQuery.data]);

  // ─── React Query: Company logo ──────────────────────────────────────────────
  const companyQuery = useApiQuery<{ logo?: string | null }>('/api/company');
  const currentLogo = companyQuery.data?.logo ?? null;

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setLogoError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const data = await apiAdmin<{ success: boolean; url?: string; error?: string }>('/api/upload/logo', { method: 'POST', body: form });
      if (data.success && data.url) {
        // Save logo URL to company settings
        const company = await apiAdmin<Record<string, unknown>>('/api/company');
        await apiAdmin('/api/company', {
          method: 'POST',
          body: JSON.stringify({ ...company, logo: data.url }),
        });
        companyQuery.refetch();
      } else {
        setLogoError(data.error || 'Upload gagal');
      }
    } catch (e: unknown) {
      setLogoError((e instanceof Error ? e.message : String(e)) || 'Gagal menghubungi server');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const fetchStatus = useCallback(async (role: RoleKey) => {
    try {
      const data = await apiAdmin<BuildStatus>(`/api/admin/apk/status?role=${role}`);
      setStatuses(prev => ({ ...prev, [role]: data }));
      return data;
    } catch { return null; }
  }, []);

  useEffect(() => {
    ROLES.forEach(r => fetchStatus(r.key));
  }, [fetchStatus]);

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
      await apiAdmin(`/api/admin/apk/trigger?role=${role}${urlParam}`, { method: 'POST' });
    } catch (e: unknown) {
      setStatuses(prev => ({ ...prev, [role]: { status: 'failed', error: (e instanceof Error ? e.message : String(e)) || 'Gagal memulai build' } }));
      setBuilding(prev => { const s = new Set(prev); s.delete(role); return s; });
      showError((e instanceof Error ? e.message : String(e)) || 'Gagal memulai build');
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
            <p className="text-xs text-slate-400 mt-0.5">Build APK langsung di server - download setelah selesai, tanpa GitHub.</p>
          </div>
        </div>
      </div>

      {/* Published releases for the login pages */}
      <ReleasePanel />

      <FirebasePanel />

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
        {/* Preview - full width */}
        <div className="w-44 h-44 mx-auto rounded-xl border border-slate-700 bg-slate-800/60 flex items-center justify-center overflow-hidden mb-3">
          {currentLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentLogo} alt="Logo" className="max-h-full max-w-full object-contain p-3" loading="lazy" />
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
      {env && <EnvBanner env={env} onRecheck={() => envQuery.refetch()} />}
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
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-emerald-500" />
            <span>Logo yang diupload di atas otomatis digunakan sebagai ikon APK saat build di server (Build APK) maupun di project ZIP.</span>
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
