'use client';

import { useState, useEffect } from 'react';
import { Shield, Smartphone, QrCode, KeyRound, AlertTriangle, CheckCircle, Loader2, Eye, EyeOff, X } from 'lucide-react';

type Phase = 'status' | 'setup-qr' | 'setup-verify' | 'disable-confirm';

export default function SecuritySettingsPage() {
  const [phase, setPhase] = useState<Phase>('status');
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Setup fields
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  // Disable fields
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [showDisablePassword, setShowDisablePassword] = useState(false);

  useEffect(() => {
    fetch('/api/admin/profile/2fa')
      .then(r => r.json())
      .then(d => { setEnabled(d.enabled); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const startSetup = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/admin/profile/2fa?action=setup');
      const data = await res.json();
      if (data.qrCode) {
        setQrCode(data.qrCode);
        setSecret(data.secret);
        setPhase('setup-qr');
      }
    } catch {
      setError('Failed to generate QR code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const verifyAndEnable = async () => {
    const cleanCode = setupCode.replace(/\s/g, '');
    if (cleanCode.length !== 6) { setError('Please enter the 6-digit code from your authenticator app.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/admin/profile/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, code: cleanCode }),
      });
      const data = await res.json();
      if (data.success) {
        setEnabled(true);
        setPhase('status');
        setSuccess(data.message);
        setSetupCode('');
        setTimeout(() => setSuccess(''), 5000);
      } else {
        setError(data.error || 'Verification failed');
      }
    } catch {
      setError('Request failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const disableTwoFactor = async () => {
    if (!disablePassword || disableCode.replace(/\s/g, '').length < 6) {
      setError('Please enter your password and the 6-digit authenticator code.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/admin/profile/2fa', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: disablePassword, code: disableCode.replace(/\s/g, '') }),
      });
      const data = await res.json();
      if (data.success) {
        setEnabled(false);
        setPhase('status');
        setSuccess(data.message);
        setDisablePassword('');
        setDisableCode('');
        setTimeout(() => setSuccess(''), 5000);
      } else {
        setError(data.error || 'Failed to disable 2FA');
      }
    } catch {
      setError('Request failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelPhase = () => {
    setPhase('status');
    setError('');
    setSetupCode('');
    setDisablePassword('');
    setDisableCode('');
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#00f7ff]" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc]">
          Security Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account security — Two-Factor Authentication</p>
      </div>

      {/* Success Banner */}
      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/40 rounded-xl flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
          <p className="text-sm text-green-400">{success}</p>
        </div>
      )}

      {/* ────────── STATUS PHASE ────────── */}
      {phase === 'status' && (
        <div className="bg-card/80 dark:bg-gradient-to-br dark:from-slate-800/60 dark:to-slate-900/60 border border-[#bc13fe]/30 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl ${enabled ? 'bg-green-500/20 border border-green-500/30' : 'bg-muted dark:bg-slate-700/50 border border-border dark:border-slate-600/50'}`}>
              <Shield className={`w-7 h-7 ${enabled ? 'text-green-400' : 'text-muted-foreground dark:text-slate-400'}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-semibold text-foreground">Two-Factor Authentication</h2>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${enabled ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                  {enabled ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {enabled
                  ? 'Your account is protected with authenticator-based 2FA. Each login requires a 6-digit code from your authenticator app.'
                  : 'Add an extra layer of security to your account. After enabling, each login from a new session will require a code from your authenticator app.'}
              </p>
              {enabled ? (
                <button
                  onClick={() => { setPhase('disable-confirm'); setError(''); }}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 hover:text-red-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Disable 2FA
                </button>
              ) : (
                <button
                  onClick={startSetup}
                  disabled={submitting}
                  className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg text-sm font-medium transition-opacity shadow-md dark:bg-gradient-to-r dark:from-[#bc13fe] dark:to-[#00f7ff] dark:shadow-[0_0_20px_rgba(188,19,254,0.3)] flex items-center gap-2 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                  Set Up 2FA
                </button>
              )}
            </div>
          </div>

          {/* Info cards */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: Smartphone, title: 'Authenticator App', desc: 'Use Google Authenticator, Authy, or any TOTP app' },
              { icon: Shield, title: 'Protects Your Account', desc: 'Even if your password is stolen, login is blocked without the code' },
              { icon: KeyRound, title: '6-Digit Code', desc: 'A new code is generated every 30 seconds' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-3 bg-muted/50 dark:bg-slate-900/50 rounded-xl border border-border dark:border-slate-700/50">
                <Icon className="w-5 h-5 text-primary dark:text-[#00f7ff] mb-2" />
                <p className="text-xs font-semibold text-foreground mb-1">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ────────── SETUP QR PHASE ────────── */}
      {phase === 'setup-qr' && (
        <div className="bg-card dark:bg-gradient-to-br dark:from-slate-800/60 dark:to-slate-900/60 border border-border dark:border-[#bc13fe]/30 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Step 1 — Scan QR Code</h2>
            <button onClick={cancelPhase} className="text-muted-foreground hover:text-foreground dark:text-slate-400 dark:hover:text-white"><X className="w-5 h-5" /></button>
          </div>

          <p className="text-sm text-muted-foreground">
            Open your authenticator app (Google Authenticator, Authy, etc.) and scan the QR code below.
          </p>

          {/* QR Code */}
          <div className="flex justify-center">
            <div className="p-4 bg-white rounded-2xl shadow-[0_0_30px_rgba(188,19,254,0.3)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCode} alt="2FA QR Code" width={200} height={200} />
            </div>
          </div>

          {/* Manual entry secret */}
          <div className="p-4 bg-muted dark:bg-slate-900/70 rounded-xl border border-border dark:border-slate-700/50">
            <p className="text-xs text-muted-foreground dark:text-slate-400 mb-2">If you can&apos;t scan the QR code, enter this key manually:</p>
            <div className="flex items-center gap-2">
              <code className={`flex-1 text-sm font-mono text-primary dark:text-[#00f7ff] break-all ${!showSecret ? 'blur-sm select-none' : ''}`}>
                {secret}
              </code>
              <button onClick={() => setShowSecret(s => !s)} className="text-muted-foreground hover:text-foreground dark:text-slate-400 dark:hover:text-white shrink-0">
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            onClick={() => { setPhase('setup-verify'); setError(''); }}
            className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl transition-all shadow-md hover:bg-primary/90 dark:bg-gradient-to-r dark:from-[#bc13fe] dark:to-[#00f7ff] dark:text-white dark:shadow-[0_0_20px_rgba(188,19,254,0.3)] dark:hover:opacity-90"
          >
            I&apos;ve Scanned the Code →
          </button>
        </div>
      )}

      {/* ────────── SETUP VERIFY PHASE ────────── */}
      {phase === 'setup-verify' && (
        <div className="bg-card dark:bg-gradient-to-br dark:from-slate-800/60 dark:to-slate-900/60 border border-border dark:border-[#bc13fe]/30 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Step 2 — Verify Code</h2>
            <button onClick={cancelPhase} className="text-muted-foreground hover:text-foreground dark:text-slate-400 dark:hover:text-white"><X className="w-5 h-5" /></button>
          </div>

          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code shown in your authenticator app to confirm the setup.
          </p>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-primary dark:text-[#00f7ff] uppercase tracking-wider block mb-2">
              Authenticator Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={setupCode}
              onChange={e => {
                const d = e.target.value.replace(/\D/g, '').slice(0, 6);
                const f = d.length > 3 ? `${d.slice(0, 3)} ${d.slice(3)}` : d;
                setSetupCode(f);
              }}
              placeholder="000 000"
              className="w-full bg-background dark:bg-slate-900 border-2 border-border dark:border-[#bc13fe]/40 rounded-xl px-4 py-3.5 text-foreground dark:text-white text-2xl font-mono tracking-[0.5em] text-center placeholder-muted-foreground dark:placeholder-slate-600 focus:border-primary dark:focus:border-[#00f7ff] focus:outline-none transition-all"
            />
          </div>

          <div className="flex gap-3">
            <button onClick={() => setPhase('setup-qr')} className="flex-1 py-3 border border-border dark:border-slate-600 text-muted-foreground hover:text-foreground hover:border-foreground/50 dark:text-slate-400 dark:hover:text-white dark:hover:border-slate-500 rounded-xl text-sm font-medium transition-colors">
              ← Back
            </button>
            <button
              onClick={verifyAndEnable}
              disabled={submitting}
              className="flex-1 bg-primary text-primary-foreground font-bold py-3 rounded-xl shadow-md hover:bg-primary/90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 dark:bg-gradient-to-r dark:from-[#bc13fe] dark:to-[#00f7ff] dark:text-white dark:shadow-[0_0_20px_rgba(188,19,254,0.3)] dark:hover:opacity-90"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Enable 2FA
            </button>
          </div>
        </div>
      )}

      {/* ────────── DISABLE CONFIRM PHASE ────────── */}
      {phase === 'disable-confirm' && (
        <div className="bg-card dark:bg-gradient-to-br dark:from-slate-800/60 dark:to-slate-900/60 border border-destructive/30 dark:border-red-500/30 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <h2 className="text-lg font-semibold text-foreground">Disable Two-Factor Authentication</h2>
            </div>
            <button onClick={cancelPhase} className="text-muted-foreground hover:text-foreground dark:text-slate-400 dark:hover:text-white"><X className="w-5 h-5" /></button>
          </div>

          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-sm text-red-400">
              ⚠️ Disabling 2FA will make your account less secure. You will only need your password to log in.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-primary dark:text-[#00f7ff] uppercase tracking-wider block mb-2">
                Current Password
              </label>
              <div className="relative">
                <input
                  type={showDisablePassword ? 'text' : 'password'}
                  value={disablePassword}
                  onChange={e => setDisablePassword(e.target.value)}
                  placeholder="Enter your password"
                  autoFocus
                  className="w-full bg-background dark:bg-slate-900 border-2 border-border dark:border-[#bc13fe]/40 rounded-xl px-4 py-3 pr-12 text-foreground dark:text-white placeholder-muted-foreground dark:placeholder-slate-600 focus:border-primary dark:focus:border-[#00f7ff] focus:outline-none transition-all"
                />
                <button onClick={() => setShowDisablePassword(s => !s)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground dark:text-slate-400 dark:hover:text-white">
                  {showDisablePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-primary dark:text-[#00f7ff] uppercase tracking-wider block mb-2">
                Authenticator Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={disableCode}
                onChange={e => {
                  const d = e.target.value.replace(/\D/g, '').slice(0, 6);
                  const f = d.length > 3 ? `${d.slice(0, 3)} ${d.slice(3)}` : d;
                  setDisableCode(f);
                }}
                placeholder="000 000"
                className="w-full bg-background dark:bg-slate-900 border-2 border-border dark:border-[#bc13fe]/40 rounded-xl px-4 py-3.5 text-foreground dark:text-white text-xl font-mono tracking-[0.5em] text-center placeholder-muted-foreground dark:placeholder-slate-600 focus:border-primary dark:focus:border-[#00f7ff] focus:outline-none transition-all"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={cancelPhase} className="flex-1 py-3 border border-border dark:border-slate-600 text-muted-foreground hover:text-foreground hover:border-foreground/50 dark:text-slate-400 dark:hover:text-white dark:hover:border-slate-500 rounded-xl text-sm font-medium transition-colors">
              Cancel
            </button>
            <button
              onClick={disableTwoFactor}
              disabled={submitting}
              className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Confirm Disable
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
