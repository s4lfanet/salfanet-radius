'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoginLogo } from '@/components/auth/LoginLogo';
import { useTranslation } from '@/hooks/useTranslation';
import { apiAdmin, ApiError } from '@/lib/api';
import { User, Lock, Loader2, Wrench, AlertCircle, Phone, KeyRound, MessageCircle } from 'lucide-react';

export default function TechnicianLoginPage() {
  const { t: _t } = useTranslation();
  const router = useRouter();
  // Technicians added in Kelola Teknisi sign in with phone + WhatsApp code;
  // username + password is kept for technician accounts made before that.
  const [mode, setMode] = useState<'otp' | 'password'>('otp');
  const [phone, setPhone] = useState('');
  const [otpSentTo, setOtpSentTo] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [resendIn, setResendIn] = useState(0);
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
        if (data.success && data.company.name) {
          setCompanyName(data.company.name);
        }
        if (data.success && data.company.logo) {
          setCompanyLogo(data.company.logo);
        }
        if (data.success && data.company.footerTechnician) {
          setFooterText(data.company.footerTechnician);
        } else if (data.success && data.company.poweredBy) {
          setFooterText(`Powered by ${data.company.poweredBy}`);
        }
      })
      .catch(() => {})
      .finally(() => setBrandLoaded(true));
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const showError = (err: unknown, fallback: string) => {
    setError(err instanceof ApiError ? err.message || fallback : 'Terjadi kesalahan. Silakan coba lagi.');
  };

  const requestOtp = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await apiAdmin<{ phoneNumber: string }>('/api/technician/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: phone }),
      });
      setOtpSentTo(data.phoneNumber);
      setOtpCode('');
      setResendIn(60);
    } catch (err) {
      showError(err, 'Kode OTP gagal dikirim');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiAdmin('/api/technician/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: otpSentTo, otpCode }),
      });
      router.push('/technician/dashboard');
    } catch (err) {
      showError(err, 'Login gagal');
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await apiAdmin('/api/technician/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });

      router.push('/technician/dashboard');
    } catch (error) {
      if (error instanceof ApiError) {
        setError(error.message || 'Login gagal');
      } else {
        setError('Terjadi kesalahan. Silakan coba lagi.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!brandLoaded) {
    return <div className="min-h-dvh bg-background" />;
  }

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row bg-background">
      {/* -- Mobile Brand Header (mobile only) -- */}
      <div className="lg:hidden bg-gradient-to-br from-blue-600 to-cyan-500 px-6 pt-10 pb-8 relative overflow-hidden flex-shrink-0">
        <div className="absolute top-[-50px] right-[-50px] w-40 h-40 bg-white/10 rounded-full pointer-events-none" />
        <div className="absolute bottom-[-30px] left-[-30px] w-28 h-28 bg-white/5 rounded-full pointer-events-none" />
        <div className="relative z-10">
          <span className="text-xs font-semibold uppercase tracking-widest text-blue-200">Portal Teknisi</span>
          <h1 className="text-3xl font-extrabold text-white mt-1 leading-tight">
            {companyName}
          </h1>
          <p className="text-sm text-blue-100/80 mt-2 leading-relaxed">
            Portal khusus teknisi lapangan. Terima tiket, dokumentasi, dan registrasi dari lokasi.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {['Tiket Kerja', 'Foto Lapangan', 'Real-time'].map(f => (
              <span key={f} className="text-xs font-medium bg-white/20 text-white px-3 py-1 rounded-full">{f}</span>
            ))}
          </div>
        </div>
      </div>
      {/* -- Left Panel: Login Form -- */}
      <div className="flex items-start justify-center w-full lg:w-[430px] lg:min-h-dvh bg-card border-r border-border shadow-xl px-4 pt-6 pb-6 sm:px-8 sm:pt-10 lg:pt-14 sm:pb-10 flex-shrink-0">
        <div className="w-full max-w-[320px]">

          <LoginLogo src={companyLogo} alt={companyName} fallbackIcon={Wrench} />

          {/* Subtitle */}
          <p className="text-center text-sm text-blue-600 dark:text-blue-400 font-semibold mb-6">
            Portal Teknisi
          </p>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
            </div>
          )}

          {mode === 'otp' ? (
            otpSentTo ? (
              <form onSubmit={verifyOtp} className="space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Kode 6 angka dikirim ke WhatsApp <span className="font-semibold text-foreground">+{otpSentTo}</span>. Berlaku 5 menit.
                </p>
                <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-slate-600 focus-within:border-blue-500 dark:focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-200 dark:focus-within:ring-blue-800/50 transition-all">
                  <div className="bg-blue-600 px-4 flex items-center justify-center flex-shrink-0">
                    <KeyRound className="w-5 h-5 text-white" />
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="Kode OTP"
                    required
                    autoFocus
                    className="flex-1 px-4 py-3 text-sm bg-blue-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none transition-colors tracking-[0.3em]"
                  />
                </div>
                <button type="submit" disabled={loading || otpCode.length !== 6} className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-all shadow-sm flex items-center justify-center gap-2">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Memproses...</> : <><Wrench className="w-4 h-4" />Masuk</>}
                </button>
                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => { setOtpSentTo(''); setOtpCode(''); setError(''); }} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 disabled:no-underline">
                    Ganti nomor
                  </button>
                  <button type="button" onClick={() => requestOtp()} disabled={loading || resendIn > 0} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 disabled:no-underline">
                    {resendIn > 0 ? `Kirim ulang (${resendIn} dtk)` : 'Kirim ulang kode'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); requestOtp(); }} className="space-y-4">
                <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-slate-600 focus-within:border-blue-500 dark:focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-200 dark:focus-within:ring-blue-800/50 transition-all">
                  <div className="bg-blue-600 px-4 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5 text-white" />
                  </div>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Nomor HP (WhatsApp)"
                    required
                    className="flex-1 px-4 py-3 text-sm bg-blue-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none transition-colors"
                  />
                </div>
                <button type="submit" disabled={loading} className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-all shadow-sm flex items-center justify-center gap-2">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Mengirim...</> : <><MessageCircle className="w-4 h-4" />Kirim kode OTP</>}
                </button>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Pakai nomor yang didaftarkan admin di Kelola Teknisi.
                </p>
              </form>
            )
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-slate-600 focus-within:border-blue-500 dark:focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-200 dark:focus-within:ring-blue-800/50 transition-all">
                <div className="bg-blue-600 px-4 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-white" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Masukkan username"
                  required
                  autoComplete="username"
                  className="flex-1 px-4 py-3 text-sm bg-blue-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none transition-colors"
                />
              </div>

              <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-slate-600 focus-within:border-blue-500 dark:focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-200 dark:focus-within:ring-blue-800/50 transition-all">
                <div className="bg-blue-600 px-4 flex items-center justify-center flex-shrink-0">
                  <Lock className="w-5 h-5 text-white" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  required
                  autoComplete="current-password"
                  className="flex-1 px-4 py-3 text-sm bg-blue-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-all shadow-sm flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Memproses...</>
                ) : (
                  <><Wrench className="w-4 h-4" />Masuk</>
                )}
              </button>
            </form>
          )}

          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => { setMode(mode === 'otp' ? 'password' : 'otp'); setError(''); }}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 disabled:no-underline"
            >
              {mode === 'otp' ? 'Akun lama? Masuk dengan username dan password' : 'Masuk dengan nomor HP dan kode OTP'}
            </button>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-400 dark:text-slate-500 mt-8">{footerText}</p>
        </div>
      </div>

      {/* -- Right Panel: Brand Info -- */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-slate-100 via-white to-cyan-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 items-center justify-center px-12 py-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 sm:w-72 sm:h-72 bg-blue-100/60 dark:bg-blue-900/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-56 h-56 bg-cyan-100/50 dark:bg-cyan-900/20 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-[calc(100%-2rem)] sm:max-w-lg w-full relative z-10">
          <div className="mb-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-blue-500 dark:text-blue-400">Portal Teknisi</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight mb-1 text-foreground">
            {companyName}
          </h1>
          <div className="mb-4 h-1.5 w-28 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500" />
          <p className="text-base text-muted-foreground mb-8 leading-relaxed">
            Portal khusus teknisi lapangan untuk menerima tiket kerja, dokumentasi instalasi, dan pendaftaran pelanggan dari lokasi.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-card rounded-2xl p-4 shadow-sm border border-border text-center">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
              </div>
              <p className="text-sm font-bold text-foreground mb-1">Tiket Kerja</p>
              <p className="text-xs text-muted-foreground leading-snug">Terima &amp; selesaikan tiket gangguan</p>
            </div>
            <div className="bg-card rounded-2xl p-4 shadow-sm border border-border text-center">
              <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-900/40 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-cyan-600 dark:text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </div>
              <p className="text-sm font-bold text-foreground mb-1">Foto Lapangan</p>
              <p className="text-xs text-muted-foreground leading-snug">Dokumentasi instalasi dari kamera</p>
            </div>
            <div className="bg-card rounded-2xl p-4 shadow-sm border border-border text-center">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/40 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <p className="text-sm font-bold text-foreground mb-1">Real-time</p>
              <p className="text-xs text-muted-foreground leading-snug">Update status ke sistem langsung</p>
            </div>
          </div>

          <div className="space-y-3">
            {[
              { color: 'bg-blue-500', text: 'Manajemen Tiket  Terima, proses, dan tutup tiket gangguan' },
              { color: 'bg-cyan-500', text: 'Foto Dokumentasi  Upload foto instalasi &amp; KTP dari kamera HP' },
              { color: 'bg-green-500', text: 'Registrasi Pelanggan  Daftarkan pelanggan baru dari lapangan' },
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

