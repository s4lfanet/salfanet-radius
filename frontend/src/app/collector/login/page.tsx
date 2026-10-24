'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoginLogo } from '@/components/auth/LoginLogo';
import { apiAdmin, ApiError } from '@/lib/api';
import { User, Lock, Loader2, Wallet, AlertCircle, Eye, EyeOff, Receipt, MapPin, LogIn } from 'lucide-react';

// Same layout as the other portals' logins (admin, technician, customer):
// form on the left, the company and what this portal is for on the right,
// a brand header above the form on phones.
const FEATURES = [
  { icon: Receipt, title: 'Tagihan', text: 'Tandai lunas tunai atau transfer', tint: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' },
  { icon: Wallet, title: 'Setoran', text: 'Rekap setoran per hari', tint: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400' },
  { icon: MapPin, title: 'Peta Pelanggan', text: 'Lokasi dan rute ke pelanggan', tint: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' },
];

const DETAILS = [
  { dot: 'bg-blue-500', title: 'Tagihan Pelanggan', text: 'Tandai lunas, catat janji bayar, kirim bukti lunas lewat WhatsApp' },
  { dot: 'bg-indigo-500', title: 'Setoran Harian', text: 'Rekap tunai dan transfer, dengan status diterima admin' },
  { dot: 'bg-emerald-500', title: 'Pelanggan Isolir', text: 'Pantau pelanggan isolir dan catat cabut ONT' },
];

export default function CollectorLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [footerText, setFooterText] = useState('');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [brandLoaded, setBrandLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/public/company')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.company.name) setCompanyName(data.company.name);
        if (data.success && data.company.logo) setCompanyLogo(data.company.logo);
        if (data.success && data.company.footerCollector) {
          setFooterText(data.company.footerCollector);
        } else if (data.success && data.company.poweredBy) {
          setFooterText(`Powered by ${data.company.poweredBy}`);
        }
      })
      .catch(() => {})
      .finally(() => setBrandLoaded(true));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiAdmin('/api/collector/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      router.push('/collector/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message || 'Login gagal' : 'Tidak bisa terhubung ke server. Periksa koneksi, lalu coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  if (!brandLoaded) {
    return <div className="min-h-dvh bg-background" />;
  }

  const field = 'flex rounded-lg overflow-hidden border border-gray-300 dark:border-slate-600 focus-within:border-blue-500 dark:focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-200 dark:focus-within:ring-blue-800/50 transition-all';
  const input = 'flex-1 min-w-0 px-4 py-3 text-sm bg-blue-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-500 dark:placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:outline-none transition-colors';

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row bg-background">
      {/* Mobile brand header */}
      <div className="lg:hidden bg-gradient-to-br from-blue-600 to-indigo-600 px-6 pt-10 pb-8 flex-shrink-0">
        <span className="text-xs font-semibold text-blue-100">Portal Kolektor</span>
        <h1 className="text-3xl font-extrabold text-white mt-1 leading-tight">{companyName}</h1>
        <p className="text-sm text-blue-50/90 mt-2 leading-relaxed">
          Tagih pelanggan di lapangan, catat pembayaran, dan rekap setoran harian.
        </p>
      </div>

      {/* Left panel: sign-in form */}
      <div className="flex items-start justify-center w-full lg:w-[430px] lg:min-h-dvh bg-card border-r border-border px-4 pt-6 pb-6 sm:px-8 sm:pt-10 lg:pt-14 sm:pb-10 flex-shrink-0">
        <div className="w-full max-w-[320px]">
          <LoginLogo src={companyLogo} alt={companyName} fallbackIcon={Wallet} />

          <p className="text-center text-sm text-blue-600 dark:text-blue-400 font-semibold mb-6">Portal Kolektor</p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-xl flex items-start gap-2" role="alert">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className={field}>
              <div className="bg-blue-600 px-4 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-white" aria-hidden />
              </div>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Masukkan username"
                aria-label="Username"
                required
                autoComplete="username"
                autoCapitalize="none"
                autoFocus
                className={input}
              />
            </div>

            <div className={field}>
              <div className="bg-blue-600 px-4 flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5 text-white" aria-hidden />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Masukkan password"
                aria-label="Password"
                required
                autoComplete="current-password"
                className={input}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                className="px-3 flex items-center bg-blue-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Memproses...</> : <><LogIn className="w-4 h-4" />Masuk</>}
            </button>
          </form>

          <p className="text-center text-xs text-gray-500 dark:text-slate-400 mt-6">Lupa password? Minta admin menggantinya di Kelola Kolektor.</p>
          {footerText && <p className="text-center text-xs text-gray-500 dark:text-slate-400 mt-2">{footerText}</p>}
        </div>
      </div>

      {/* Right panel: what this portal is for */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-slate-100 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 items-center justify-center px-12 py-8">
        <div className="max-w-lg w-full">
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Portal Kolektor</span>
          <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mt-2 mb-1 text-foreground">{companyName}</h1>
          <div className="mb-4 h-1.5 w-28 rounded-full bg-gradient-to-r from-blue-600 to-indigo-500" />
          <p className="text-base text-muted-foreground mb-8 leading-relaxed">
            Portal khusus kolektor untuk menagih pelanggan di wilayah tugas, mencatat pembayaran tunai dan transfer, serta merekap setoran harian.
          </p>

          <div className="grid grid-cols-3 gap-4 mb-8">
            {FEATURES.map(({ icon: Icon, title, text, tint }) => (
              <div key={title} className="bg-card rounded-2xl p-4 border border-border text-center">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3 ${tint}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <p className="text-sm font-bold text-foreground mb-1">{title}</p>
                <p className="text-xs text-muted-foreground leading-snug">{text}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {DETAILS.map((d) => (
              <div key={d.title} className="flex items-center gap-3 bg-white/70 dark:bg-slate-800/60 rounded-xl px-4 py-3 border border-gray-100 dark:border-slate-700/50">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${d.dot}`} aria-hidden />
                <p className="text-sm text-slate-700 dark:text-slate-300"><span className="font-semibold">{d.title}</span> · {d.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
