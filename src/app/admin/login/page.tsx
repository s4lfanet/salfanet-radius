'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Loader2, Shield, Smartphone, User, Lock, Clock, LogIn, ArrowLeft, KeyRound } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

type Step = 'credentials' | 'twoFactor';

// Set default theme on login page
if (typeof window !== 'undefined') {
  const savedTheme = localStorage.getItem('theme');
  if (!savedTheme) {
    // Default to dark mode for cyberpunk theme
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
    return <div className="min-h-screen bg-gradient-to-br from-slate-900 via-[#1a0f35] to-slate-900" />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-[#1a0f35] to-slate-900 relative overflow-hidden flex items-center justify-center p-4">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#bc13fe]/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-[#00f7ff]/20 rounded-full blur-[100px] animate-pulse delay-700"></div>
        <div className="absolute bottom-0 left-1/2 w-[600px] h-[400px] bg-[#ff44cc]/15 rounded-full blur-[150px] animate-pulse delay-1000"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:60px_60px]"></div>
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            {companyLogo ? (
              <div className="inline-flex items-center justify-center rounded-xl border-2 border-white/20 bg-white p-2 backdrop-blur-md shadow-[0_0_40px_rgba(188,19,254,0.4)] px-3 py-2 flex-shrink-0">
                <img src={companyLogo} alt={companyName} className="max-h-10 max-w-[100px] w-auto h-auto object-contain" />
              </div>
            ) : (
              <div className={`inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br rounded-xl border-2 transition-all duration-500 flex-shrink-0 ${
                step === 'twoFactor'
                  ? 'from-[#00f7ff] to-[#bc13fe] shadow-[0_0_40px_rgba(0,247,255,0.5)] border-[#00f7ff]/40'
                  : 'from-[#bc13fe] to-[#00f7ff] shadow-[0_0_40px_rgba(188,19,254,0.5)] border-[#bc13fe]/40'
              }`}>
                {step === 'twoFactor'
                  ? <Smartphone className="w-6 h-6 text-foreground" />
                  : <Shield className="w-6 h-6 text-foreground" />
                }
              </div>
            )}
              <h1 className="text-xl sm:text-2xl font-bold leading-tight text-left text-transparent bg-clip-text bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] drop-shadow-[0_0_20px_rgba(0,247,255,0.5)] max-w-[200px]">
                {companyName}
              </h1>
          </div>
          <p className="text-sm text-[#00f7ff] font-mono uppercase tracking-widest">
            {step === 'twoFactor' ? '2-Factor Authentication' : t('auth.adminControlPanel')}
          </p>
        </div>

        {/* Card */}
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-3xl border-2 border-[#bc13fe]/30 shadow-[0_0_50px_rgba(188,19,254,0.2)] p-8">

          {/* Idle Logout Notice */}
          {idleLogout && step === 'credentials' && (
            <div className="mb-5 p-4 bg-amber-500/10 border-2 border-amber-500/40 rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-amber-400 flex-shrink-0 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                <div>
                  <p className="text-sm font-bold text-amber-400">{t('auth.sessionExpired')}</p>
                  <p className="text-xs text-amber-300/80 mt-0.5">{t('auth.sessionExpiredDesc')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-5 p-4 bg-red-500/10 border-2 border-red-500/40 rounded-xl">
              <p className="text-sm text-red-400 font-medium">{error}</p>
            </div>
          )}

          {/* ── STEP 1: Username + Password ── */}
          {step === 'credentials' && (
            <form onSubmit={handleCredentialsSubmit} className="space-y-5">
              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-[#00f7ff] mb-3 uppercase tracking-wider">
                  <User className="w-4 h-4" />
                  {t('auth.username')}
                </label>
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-4 py-3.5 bg-slate-900/80 border-2 border-[#bc13fe]/40 rounded-xl text-white placeholder-[#e0d0ff]/40 focus:border-[#00f7ff] focus:ring-2 focus:ring-[#00f7ff]/30 focus:shadow-[0_0_20px_rgba(0,247,255,0.2)] transition-all text-sm"
                  placeholder={t('auth.enterUsername')}
                  disabled={loading}
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-[#00f7ff] mb-3 uppercase tracking-wider">
                  <Lock className="w-4 h-4" />
                  {t('auth.password')}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-3.5 bg-slate-900/80 border-2 border-[#bc13fe]/40 rounded-xl text-white placeholder-[#e0d0ff]/40 focus:border-[#00f7ff] focus:ring-2 focus:ring-[#00f7ff]/30 focus:shadow-[0_0_20px_rgba(0,247,255,0.2)] transition-all pr-12 text-sm"
                    placeholder={t('auth.enterPassword')}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-[#00f7ff] transition-colors"
                    disabled={loading}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-gradient-to-r from-[#00f7ff] to-[#00d4e6] hover:shadow-[0_0_40px_rgba(0,247,255,0.5)] disabled:opacity-50 disabled:shadow-none text-black text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-3 mt-6"
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />{t('auth.signingIn')}</>
                ) : (
                  <><LogIn className="w-5 h-5" />{t('auth.signIn')}</>
                )}
              </button>
            </form>
          )}

          {/* ── STEP 2: 2FA Code ── */}
          {step === 'twoFactor' && (
            <form onSubmit={handleTwoFactorSubmit} className="space-y-5">
              {/* Info banner */}
              <div className="p-4 bg-[#00f7ff]/10 border-2 border-[#00f7ff]/30 rounded-xl">
                <div className="flex items-start gap-3">
                  <Smartphone className="w-5 h-5 text-[#00f7ff] flex-shrink-0 mt-0.5 drop-shadow-[0_0_8px_rgba(0,247,255,0.8)]" />
                  <div>
                    <p className="text-sm font-bold text-[#00f7ff]">Authenticator Code Required</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Open your authenticator app (Google Authenticator, Authy, etc.) and enter the 6-digit code.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-[#00f7ff] mb-3 uppercase tracking-wider">
                  <KeyRound className="w-4 h-4" />
                  Authenticator Code
                </label>
                <input
                  ref={tfaInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={tfaCode}
                  onChange={(e) => handleTfaCodeChange(e.target.value)}
                  className="login-input-2fa w-full px-4 py-4 bg-slate-900/80 border-2 border-[#00f7ff]/40 rounded-xl text-white text-center text-2xl font-mono tracking-[0.5em] placeholder-[#e0d0ff]/30 focus:border-[#00f7ff] focus:ring-2 focus:ring-[#00f7ff]/30 focus:shadow-[0_0_20px_rgba(0,247,255,0.2)] transition-all"
                  placeholder="000 000"
                  disabled={loading}
                  maxLength={7}
                />
                <p className="text-xs text-muted-foreground text-center mt-2">This session expires in 10 minutes</p>
              </div>

              <button
                type="submit"
                disabled={loading || tfaCode.replace(/\s/g, '').length < 6}
                className="w-full py-4 bg-gradient-to-r from-[#00f7ff] to-[#00d4e6] hover:shadow-[0_0_40px_rgba(0,247,255,0.5)] disabled:opacity-50 disabled:shadow-none text-black text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-3"
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />Verifying...</>
                ) : (
                  <><KeyRound className="w-5 h-5" />Verify Code</>
                )}
              </button>

              <button
                type="button"
                onClick={handleBackToCredentials}
                disabled={loading}
                className="w-full text-sm text-muted-foreground hover:text-[#00f7ff] transition-colors flex items-center justify-center gap-2 pt-1"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[#e0d0ff]/40 mt-8 font-mono uppercase tracking-widest">
          {footerText}
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-[#1a0f35] to-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)]" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
