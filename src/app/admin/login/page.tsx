'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import Image from 'next/image';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Loader2, Shield, Smartphone, User, Lock, Clock, LogIn, ArrowLeft, KeyRound } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

type Step = 'credentials' | 'twoFactor';

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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const { t } = useTranslation();

  // ── UI state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('credentials');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [idleLogout, setIdleLogout] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [footerText, setFooterText] = useState('');
  const [brandLoaded, setBrandLoaded] = useState(false);

  // ── Form data ─────────────────────────────────────────────────────────
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [tfaToken, setTfaToken] = useState('');
  const [tfaCode, setTfaCode] = useState('');
  const tfaInputRef = useRef<HTMLInputElement>(null);

  // Check idle logout
  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'idle') {
      setIdleLogout(true);
      setTimeout(() => {
        window.history.replaceState({}, '', '/admin/login');
      }, 100);
    }
  }, [searchParams]);

  // Load company branding
  useEffect(() => {
    fetch('/api/public/company')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.company.name) setCompanyName(data.company.name);
        if (data.success && data.company.logo) setCompanyLogo(data.company.logo);
        if (data.success && data.company.footerAdmin) {
          setFooterText(data.company.footerAdmin);
        } else if (data.success && data.company.poweredBy) {
          setFooterText(`Powered by ${data.company.poweredBy}`);
        }
      })
      .catch(() => {})
      .finally(() => setBrandLoaded(true));
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/admin');
    }
  }, [status, router]);

  // Focus 2FA input when switching to that step
  useEffect(() => {
    if (step === 'twoFactor') {
      setTimeout(() => tfaInputRef.current?.focus(), 100);
    }
  }, [step]);

  // ── Step 1: Check credentials + 2FA requirement ───────────────────────
  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Use pre-login API because NextAuth v4 sanitizes authorize() errors
      // to "CredentialsSignin" — custom error messages never reach the client.
      const res = await fetch('/api/admin/auth/pre-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: formData.username, password: formData.password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('auth.loginFailed'));
        return;
      }

      if (data.requires2FA && data.token) {
        // Show 2FA step inline — no page redirect, no race conditions
        setTfaToken(data.token);
        setStep('twoFactor');
        return;
      }

      // No 2FA — proceed with NextAuth
      const result = await signIn('credentials', {
        username: formData.username,
        password: formData.password,
        redirect: false,
      });

      if (result?.error) {
        setError(t('auth.loginFailed'));
      } else if (result?.ok) {
        const callbackUrl = searchParams.get('callbackUrl') || '/admin';
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Submit 2FA TOTP code ──────────────────────────────────────
  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = tfaCode.replace(/\s/g, '');
    if (cleanCode.length < 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        tfaToken,
        tfaCode: cleanCode,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid authenticator code. Please try again.');
        setTfaCode('');
        tfaInputRef.current?.focus();
      } else if (result?.ok) {
        const callbackUrl = searchParams.get('callbackUrl') || '/admin';
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  // Auto-format 2FA code as "000 000"
  const handleTfaCodeChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6);
    const formatted = digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
    setTfaCode(formatted);
  };

  const handleBackToCredentials = () => {
    setStep('credentials');
    setTfaToken('');
    setTfaCode('');
    setError('');
  };

  if (!brandLoaded) {
    return <div className="min-h-screen bg-gray-50 dark:bg-slate-950" />;
  }

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-slate-950">
      {/* ── Left Panel: Login Form ── */}
      <div className="flex items-start justify-center w-full lg:w-[420px] min-h-screen bg-white dark:bg-slate-800 shadow-xl dark:shadow-slate-900/50 px-8 pt-14 pb-10 flex-shrink-0">
        <div className="w-full max-w-[320px]">

          {/* Logo */}
          <div className="flex justify-center mb-5">
            {companyLogo ? (
              <div className="p-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-700 shadow-sm">
                <Image unoptimized src={companyLogo} alt={companyName} width={120} height={48} className="max-h-12 max-w-[120px] w-auto h-auto object-contain" />
              </div>
            ) : (
              <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl shadow-lg transition-all duration-300 ${step === 'twoFactor' ? 'bg-indigo-600 shadow-indigo-500/25' : 'bg-blue-600 shadow-blue-500/25'}`}>
                {step === 'twoFactor' ? <Smartphone className="w-7 h-7 text-white" /> : <Shield className="w-7 h-7 text-white" />}
              </div>
            )}
          </div>

          {/* Subtitle */}
          <p className="text-center text-sm text-blue-600 dark:text-blue-400 font-semibold mb-6">
            {step === 'twoFactor' ? 'Autentikasi 2 Faktor' : t('auth.adminControlPanel')}
          </p>

          {/* Idle Logout Notice */}
          {idleLogout && step === 'credentials' && (
            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">{t('auth.sessionExpired')}</p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-500/80">{t('auth.sessionExpiredDesc')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-xl">
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
            </div>
          )}

          {/* ── STEP 1: Credentials ── */}
          {step === 'credentials' && (
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-slate-600 focus-within:border-blue-500 dark:focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-200 dark:focus-within:ring-blue-800/50 transition-all">
                <div className="bg-blue-600 px-4 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-white" />
                </div>
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder={t('auth.enterUsername')}
                  disabled={loading}
                  className="flex-1 px-4 py-3 text-sm bg-blue-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none transition-colors"
                />
              </div>

              <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-slate-600 focus-within:border-blue-500 dark:focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-200 dark:focus-within:ring-blue-800/50 transition-all">
                <div className="bg-blue-600 px-4 flex items-center justify-center flex-shrink-0">
                  <Lock className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 flex items-center bg-blue-50 dark:bg-slate-900 focus-within:bg-white dark:focus-within:bg-slate-800 transition-colors">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={t('auth.enterPassword')}
                    disabled={loading}
                    className="flex-1 px-4 py-3 text-sm bg-transparent text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors" disabled={loading}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-all shadow-sm flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />{t('auth.signingIn')}</>
                ) : (
                  <><LogIn className="w-4 h-4" />{t('auth.signIn')}</>
                )}
              </button>
            </form>
          )}

          {/* ── STEP 2: 2FA ── */}
          {step === 'twoFactor' && (
            <form onSubmit={handleTwoFactorSubmit} className="space-y-4">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700/50 rounded-xl">
                <div className="flex items-start gap-2">
                  <Smartphone className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Kode Autentikator Diperlukan</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Buka aplikasi autentikator dan masukkan kode 6 digit.</p>
                  </div>
                </div>
              </div>

              <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-slate-600 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-200 dark:focus-within:ring-indigo-800/50 transition-all">
                <div className="bg-indigo-600 px-4 flex items-center justify-center flex-shrink-0">
                  <KeyRound className="w-5 h-5 text-white" />
                </div>
                <input
                  ref={tfaInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={tfaCode}
                  onChange={(e) => handleTfaCodeChange(e.target.value)}
                  className="flex-1 px-4 py-4 text-center text-xl font-mono tracking-widest bg-blue-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-600 focus:bg-white dark:focus:bg-slate-800 focus:outline-none transition-colors"
                  placeholder="000 000"
                  disabled={loading}
                  maxLength={7}
                />
              </div>
              <p className="text-xs text-center text-gray-400 dark:text-slate-500">Sesi ini berakhir dalam 10 menit</p>

              <button
                type="submit"
                disabled={loading || tfaCode.replace(/\s/g, '').length < 6}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-all shadow-sm flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Memverifikasi...</>
                ) : (
                  <><KeyRound className="w-4 h-4" />Verifikasi Kode</>
                )}
              </button>
              <button
                type="button"
                onClick={handleBackToCredentials}
                disabled={loading}
                className="w-full text-xs text-gray-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Kembali ke Login
              </button>
            </form>
          )}

          {/* Footer */}
          <p className="text-center text-xs text-gray-400 dark:text-slate-500 mt-8">{footerText}</p>
        </div>
      </div>

      {/* ── Right Panel: Brand Info ── */}
      <div className="hidden lg:flex flex-1 bg-gray-50 dark:bg-slate-900 items-center justify-center p-12">
        <div className="max-w-xl w-full">
          <h1 className="text-4xl font-bold text-slate-800 dark:text-slate-100 mb-3 leading-tight">
            {companyName || 'Salfanet Radius'}
          </h1>
          <hr className="border-gray-300 dark:border-slate-700 mb-6" />
          <p className="text-gray-600 dark:text-slate-400 text-sm leading-relaxed mb-8">
            Solusi manajemen Billing ISP terlengkap untuk skalabilitas bisnis Anda. Kelola ribuan pelanggan MikroTik secara otomatis, aman, dan efisien dalam satu dashboard terintegrasi.
          </p>
          <div className="grid grid-cols-3 gap-6 mb-8 text-center">
            <div>
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mb-1">User Friendly</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Aplikasi dirancang agar mudah digunakan</p>
            </div>
            <div>
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mb-1">Data Terpusat</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Kelola banyak MikroTik dengan satu dashboard</p>
            </div>
            <div>
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mb-1">Secure</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Data tersimpan dengan aman dan backup otomatis</p>
            </div>
          </div>
          <div className="space-y-3 text-sm text-gray-700 dark:text-slate-300">
            <p><span className="font-bold">Automated Billing:</span> Sistem isolir otomatis &amp; kirim notifikasi via WhatsApp</p>
            <p><span className="font-bold">Multi-Router:</span> Kelola banyak Mikrotik dalam satu server Radius.</p>
            <p><span className="font-bold">Payment Gateway:</span> Dukungan otomatisasi pembayaran (QRIS, VA, Retail).</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
