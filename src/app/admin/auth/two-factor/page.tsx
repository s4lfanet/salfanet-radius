'use client';

import { useState, useEffect, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, Smartphone, Loader2, KeyRound, ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

function TwoFactorForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [companyName, setCompanyName] = useState('SALFANET RADIUS');
  const tfaToken = searchParams.get('t') || '';

  useEffect(() => {
    // Redirect to login if no token
    if (!tfaToken) {
      router.replace('/admin/login');
      return;
    }
    fetch('/api/public/company')
      .then(r => r.json())
      .then(d => { if (d.success && d.company.name) setCompanyName(d.company.name); })
      .catch(() => {});
  }, [tfaToken, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || code.replace(/\s/g, '').length < 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await signIn('credentials', {
        tfaToken,
        tfaCode: code.replace(/\s/g, ''),
        redirect: false,
      });

      if (result?.error) {
        setError(result.error === 'CredentialsSignin' ? 'Invalid authenticator code. Please try again.' : result.error);
        setCode('');
      } else if (result?.ok) {
        router.push('/admin');
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  // Auto-format code as user types (add space after 3 digits)
  const handleCodeChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6);
    const formatted = digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
    setCode(formatted);
  };

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
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-[#bc13fe] to-[#00f7ff] rounded-2xl mb-5 shadow-[0_0_50px_rgba(188,19,254,0.5)] border-2 border-[#bc13fe]/40">
            <Smartphone className="w-10 h-10 text-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] drop-shadow-[0_0_20px_rgba(0,247,255,0.5)]">
            {companyName}
          </h1>
          <p className="text-sm text-primary dark:text-[#00f7ff] mt-2 font-mono uppercase tracking-widest">
            Two-Factor Authentication
          </p>
        </div>

        {/* 2FA Form */}
        <div className="bg-card dark:bg-gradient-to-br dark:from-slate-800/80 dark:to-slate-900/80 backdrop-blur-xl rounded-3xl border-2 border-border dark:border-[#bc13fe]/30 shadow-xl dark:shadow-[0_0_50px_rgba(188,19,254,0.2)] p-8">
          {/* Info box */}
          <div className="mb-6 p-4 bg-primary/10 dark:bg-[#00f7ff]/10 border border-primary/30 dark:border-[#00f7ff]/30 rounded-xl">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-primary dark:text-[#00f7ff] mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground dark:text-[#e0d0ff]/90 leading-relaxed">
                Open your authenticator app (Google Authenticator, Authy, etc.) and enter the 6-digit code for this account.
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-5 p-4 bg-red-500/10 border-2 border-red-500/40 rounded-xl">
              <p className="text-sm text-red-400 text-center font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-primary dark:text-[#00f7ff] mb-2 uppercase tracking-wider">
                Authenticator Code
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-primary dark:text-[#bc13fe]">
                  <KeyRound className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  value={code}
                  onChange={e => handleCodeChange(e.target.value)}
                  placeholder="000 000"
                  className="w-full bg-background dark:bg-slate-900/80 border-2 border-border dark:border-[#bc13fe]/40 rounded-xl px-4 py-3.5 pl-12 text-foreground dark:text-white placeholder-muted-foreground dark:placeholder-slate-500 focus:border-primary dark:focus:border-[#00f7ff] focus:outline-none dark:focus:shadow-[0_0_20px_rgba(0,247,255,0.2)] transition-all text-2xl font-mono tracking-[0.5em] text-center"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">Code is valid for 30 seconds</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold py-3.5 rounded-xl transition-all duration-300 shadow-md dark:bg-gradient-to-r dark:from-[#bc13fe] dark:to-[#00f7ff] dark:hover:from-[#d020ff] dark:hover:to-[#00d4dc] dark:text-white dark:shadow-[0_0_30px_rgba(188,19,254,0.4)] dark:hover:shadow-[0_0_50px_rgba(188,19,254,0.6)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Verifying…</>
              ) : (
                <><Shield className="w-5 h-5" /> Verify &amp; Sign In</>
              )}
            </button>
          </form>

          <div className="mt-5 text-center">
            <button
              onClick={() => router.push('/admin/login')}
              className="text-sm text-muted-foreground hover:text-primary dark:hover:text-[#00f7ff] transition-colors flex items-center gap-1 mx-auto"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Login
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground dark:text-slate-600 mt-6">
          This session will expire in 10 minutes.
        </p>
      </div>
    </div>
  );
}

export default function TwoFactorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#1a0f35] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#00f7ff]" />
      </div>
    }>
      <TwoFactorForm />
    </Suspense>
  );
}
