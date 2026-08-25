'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { apiAdmin, ApiError } from '@/lib/api';
import { User, Lock, Loader2, Wallet, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

if (typeof window !== 'undefined') {
  const savedTheme = localStorage.getItem('theme');
  if (!savedTheme) {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  } else if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export default function CollectorLoginPage() {
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      if (err instanceof ApiError) setError(err.message || 'Login gagal');
      else setError('Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  if (!brandLoaded) {
    return <div className="min-h-dvh bg-gray-50 dark:bg-slate-950" />;
  }

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row bg-background">
      {/* ── Mobile Brand Header (mobile only) ── */}
      <div className="lg:hidden bg-gradient-to-br from-emerald-600 to-teal-500 px-6 pt-10 pb-8 relative overflow-hidden flex-shrink-0">
        <div className="absolute top-[-50px] right-[-50px] w-40 h-40 bg-white/10 rounded-full pointer-events-none" />
        <div className="absolute bottom-[-30px] left-[-30px] w-28 h-28 bg-white/5 rounded-full pointer-events-none" />
        <div className="relative z-10">
          <span className="text-xs font-semibold uppercase tracking-widest text-emerald-200">Portal Kolektor</span>
          <h1 className="text-3xl font-extrabold text-white mt-1 leading-tight">{companyName}</h1>
          <p className="text-sm text-emerald-100/80 mt-2 leading-relaxed">
            Kelola tagihan, setoran, dan pencabutan ONT pelanggan dengan mudah.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {['Tagihan', 'Setoran', 'Cabut ONT'].map(f => (
              <span key={f} className="text-xs font-medium bg-white/20 text-white px-3 py-1 rounded-full">{f}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Left Panel: Login Form ── */}
      <div className="flex items-start justify-center w-full lg:w-[430px] lg:min-h-dvh bg-card border-r border-border shadow-xl px-8 pt-10 lg:pt-14 pb-10 flex-shrink-0 relative">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="absolute top-4 right-4 p-2 rounded-xl border border-border bg-muted hover:bg-muted/80 text-muted-foreground transition-all shadow-sm"
          title={isDark ? 'Mode Terang' : 'Mode Gelap'}
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-500" />}
        </button>

        <div className="w-full max-w-[320px]">
          {/* Logo */}
          <div className="flex justify-center mb-5">
            {companyLogo ? (
              <div className="w-24 h-24 p-2 rounded-xl border border-border bg-card shadow-sm flex items-center justify-center overflow-hidden">
                <Image unoptimized src={companyLogo} alt={companyName} width={220} height={110} className="max-h-full max-w-full w-auto h-auto object-contain" />
              </div>
            ) : (
              <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-600 rounded-2xl shadow-lg shadow-emerald-500/25">
                <Wallet className="w-7 h-7 text-white" />
              </div>
            )}
          </div>

          {/* Subtitle */}
          <p className="text-center text-sm text-emerald-600 dark:text-emerald-400 font-semibold mb-6">
            Portal Kolektor
          </p>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-xl">
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-slate-600 focus-within:border-emerald-500 dark:focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-200 dark:focus-within:ring-emerald-800/50 transition-all">
              <div className="bg-emerald-600 px-4 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-white" />
              </div>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Masukkan username"
                required
                autoComplete="username"
                autoFocus
                className="flex-1 px-4 py-3 text-sm bg-emerald-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none transition-colors"
              />
            </div>

            <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-slate-600 focus-within:border-emerald-500 dark:focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-200 dark:focus-within:ring-emerald-800/50 transition-all">
              <div className="bg-emerald-600 px-4 flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5 text-white" />
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Masukkan password"
                required
                autoComplete="current-password"
                className="flex-1 px-4 py-3 text-sm bg-emerald-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-all shadow-sm flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Memproses...</>
              ) : (
                <><Wallet className="w-4 h-4" />Masuk</>
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-gray-400 dark:text-slate-500 mt-8">{footerText}</p>
        </div>
      </div>

      {/* ── Right Panel: Brand Info ── */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-slate-100 via-white to-emerald-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 items-center justify-center px-12 py-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-100/60 dark:bg-emerald-900/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-56 h-56 bg-teal-100/50 dark:bg-teal-900/20 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-lg w-full relative z-10">
          <div className="mb-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-emerald-500 dark:text-emerald-400">Portal Kolektor</span>
          </div>
          <h1 className="text-5xl font-extrabold leading-tight mb-1 text-foreground">
            {companyName}
          </h1>
          <div className="mb-4 h-1.5 w-28 rounded-full bg-gradient-to-r from-emerald-600 to-teal-500" />
          <p className="text-base text-muted-foreground mb-8 leading-relaxed">
            Portal khusus kolektor untuk mengelola tagihan pelanggan, mencatat setoran harian, dan melakukan pencabutan ONT di wilayah Anda.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-card rounded-2xl p-4 shadow-sm border border-border text-center">
              <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <p className="text-sm font-bold text-foreground mb-1">Kelola Tagihan</p>
              <p className="text-xs text-muted-foreground leading-snug">Tandai invoice lunas</p>
            </div>
            <div className="bg-card rounded-2xl p-4 shadow-sm border border-border text-center">
              <div className="w-10 h-10 bg-teal-100 dark:bg-teal-900/40 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
              </div>
              <p className="text-sm font-bold text-foreground mb-1">Setoran Harian</p>
              <p className="text-xs text-muted-foreground leading-snug">Rekap pembayaran tunai</p>
            </div>
            <div className="bg-card rounded-2xl p-4 shadow-sm border border-border text-center">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/40 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <p className="text-sm font-bold text-foreground mb-1">Cabut ONT</p>
              <p className="text-xs text-muted-foreground leading-snug">Catat pencabutan perangkat</p>
            </div>
          </div>

          <div className="space-y-3">
            {[
              { color: 'bg-emerald-500', text: 'Tagihan Pelanggan — Tandai invoice lunas & catat metode pembayaran' },
              { color: 'bg-teal-500', text: 'Setoran Harian — Rekap pembayaran tunai dan transfer per hari' },
              { color: 'bg-green-500', text: 'Manajemen Isolir — Pantau pelanggan isolir & catat pencabutan ONT' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 bg-white/70 dark:bg-slate-800/60 rounded-xl px-4 py-3 border border-gray-100 dark:border-slate-700/50">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.color}`} />
                <p className="text-sm text-slate-700 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: item.text }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
